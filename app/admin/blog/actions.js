"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { profile } from "@/data/content";
import { ADMIN_POST_FIELDS, getAdmin } from "@/lib/blog/admin";
import { contentImages, contentText, sanitizeContent } from "@/lib/blog/blocks/model";
import { findPlaceholders } from "@/lib/blog/blocks/templates";
import { readingMinutes } from "@/lib/blog/content";
import { SLUG_PATTERN, slugify } from "@/lib/blog/slug";
import { MEDIA_BUCKET } from "@/lib/supabase/env";
import { createPublicClient } from "@/lib/supabase/server";

// Her işlem yetkiyi sunucuda yeniden doğrular; arayüzdeki düğmelere güvenilmez.
// İşlemler { ok, error } döndürür; istemci hatayı olduğu gibi gösterir.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNAUTHORIZED = { ok: false, error: "Oturumun sona ermiş. Yeniden giriş yap." };
const MAX_CONTENT_BYTES = 600_000;
const MAX_TAGS = 10;

const fail = (error, extra) => ({ ok: false, error, ...extra });
const uuidOrNull = (value) => (typeof value === "string" && UUID.test(value) ? value : null);
const clip = (value, max) => String(value ?? "").trim().slice(0, max);

function dbError(error) {
  if (error.code === "23505") return "Bu kalıcı bağlantı başka bir kayıtta kullanılıyor.";
  if (error.code === "42501") return "Bu işlem için yetkin yok.";
  console.error("[blog] veritabanı hatası:", error);
  return "Kayıt sırasında beklenmeyen bir hata oluştu. Yeniden dene.";
}

function revalidatePost(slug) {
  revalidatePath("/blog");
  if (slug) revalidatePath(`/blog/${slug}`);
}

function isAutoSlug(slug) {
  return /^taslak-[0-9a-f]{8}$/.test(slug);
}

// --- Yazılar ----------------------------------------------------------------

function parsePostInput(input) {
  const slug = slugify(input.slug);
  if (!SLUG_PATTERN.test(slug)) {
    return { error: "Kalıcı bağlantı en az bir harf ya da rakam içermeli." };
  }

  // Tanınmayan blokları, alanları ve güvensiz adresleri atar.
  const content = sanitizeContent(input.content);
  if (JSON.stringify(content).length > MAX_CONTENT_BYTES) {
    return { error: "İçerik çok uzun. Yazıyı bölmeyi dene." };
  }

  const canonical = clip(input.canonicalUrl, 500);
  if (canonical && !/^https:\/\/[^\s]+$/i.test(canonical)) {
    return { error: "Canonical URL https:// ile başlayan tam bir adres olmalı." };
  }

  const tags = [];
  const seen = new Set();
  for (const raw of Array.isArray(input.tags) ? input.tags : []) {
    const name = clip(raw, 40);
    const tagSlug = slugify(name, 40);
    if (!tagSlug || seen.has(tagSlug)) continue;
    seen.add(tagSlug);
    tags.push({ name, slug: tagSlug });
  }
  if (tags.length > MAX_TAGS) return { error: `En fazla ${MAX_TAGS} etiket eklenebilir.` };

  const text = contentText(content);

  return {
    tags,
    row: {
      title: clip(input.title, 160),
      slug,
      excerpt: clip(input.excerpt, 200),
      content,
      content_text: text,
      reading_minutes: readingMinutes(text),
      cover_media_id: uuidOrNull(input.coverMediaId),
      cover_alt: clip(input.coverAlt, 300),
      category_id: uuidOrNull(input.categoryId),
      is_featured: Boolean(input.isFeatured),
      seo_title: clip(input.seoTitle, 70),
      seo_description: clip(input.seoDescription, 160),
      canonical_url: canonical,
    },
  };
}

async function syncTags(supabase, postId, tags) {
  let tagIds = [];
  if (tags.length > 0) {
    const { error: upsertError } = await supabase
      .from("blog_tags")
      .upsert(tags, { onConflict: "slug", ignoreDuplicates: true });
    if (upsertError) return upsertError;

    const { data, error } = await supabase
      .from("blog_tags")
      .select("id")
      .in("slug", tags.map((tag) => tag.slug));
    if (error) return error;
    tagIds = data.map((tag) => tag.id);
  }

  const { error: deleteError } = await supabase.from("blog_post_tags").delete().eq("post_id", postId);
  if (deleteError) return deleteError;
  if (tagIds.length === 0) return null;

  const { error } = await supabase
    .from("blog_post_tags")
    .insert(tagIds.map((tagId) => ({ post_id: postId, tag_id: tagId })));
  return error;
}

// `revision` istemcinin en son gördüğü sürümdür. Arada başka bir sekme
// kaydettiyse güncelleme hiçbir satıra dokunmaz ve çakışma bildirilir.
async function updateWithRevision(supabase, id, revision, changes) {
  const { data, error } = await supabase
    .from("blog_posts")
    .update({ ...changes, revision: revision + 1 })
    .eq("id", id)
    .eq("revision", revision)
    .select("id, slug, status, published_at, revision, updated_at")
    .maybeSingle();

  if (error) return fail(dbError(error));
  if (!data) {
    return fail("Bu yazı başka bir sekmede ya da cihazda değiştirildi. Güncel hali için sayfayı yenile.", {
      conflict: true,
    });
  }
  return { ok: true, post: data };
}

// Yeni yazı ilk kaydedildiğinde oluşturulur; editörü açmak tek başına
// veritabanına kayıt atmaz.
export async function createPost(input) {
  const admin = await getAdmin();
  if (!admin) return UNAUTHORIZED;
  if (!input) return fail("Geçersiz istek.");

  const parsed = parsePostInput({
    ...input,
    slug: slugify(input.slug) || `taslak-${randomUUID().slice(0, 8)}`,
  });
  if (parsed.error) return fail(parsed.error);

  const { data, error } = await admin.supabase
    .from("blog_posts")
    .insert({
      ...parsed.row,
      author_id: admin.user.id,
      author_name: admin.displayName || profile.fullName,
    })
    .select("id, slug, status, published_at, revision, updated_at")
    .single();
  if (error) return fail(dbError(error));

  const tagError = await syncTags(admin.supabase, data.id, parsed.tags);
  if (tagError) return fail(dbError(tagError));

  return { ok: true, post: data };
}

export async function savePost(id, revision, input) {
  const admin = await getAdmin();
  if (!admin) return UNAUTHORIZED;
  if (!uuidOrNull(id) || !Number.isInteger(revision) || !input) return fail("Geçersiz istek.");

  const parsed = parsePostInput(input);
  if (parsed.error) return fail(parsed.error);

  // Slug değişirse eski adresin önbelleği de tazelenmeli; yoksa yönlendirme
  // yerine birkaç dakika boyunca eski sayfa sunulur.
  const { data: previous } = await admin.supabase
    .from("blog_posts")
    .select("slug")
    .eq("id", id)
    .maybeSingle();

  const result = await updateWithRevision(admin.supabase, id, revision, parsed.row);
  if (!result.ok) return result;

  const tagError = await syncTags(admin.supabase, id, parsed.tags);
  if (tagError) return fail(dbError(tagError));

  if (result.post.status === "published") {
    revalidatePost(result.post.slug);
    if (previous && previous.slug !== result.post.slug) revalidatePath(`/blog/${previous.slug}`);
  }
  return result;
}

// Şablon ya da blok kütüphanesinden kalan talimat cümleleri gerçek içerik
// gibi yayınlanmaz. Kullanıcıya kalan ilk cümle gösterilir.
function placeholderError(text) {
  const leftovers = findPlaceholders(text);
  if (leftovers.length === 0) return null;
  const first = leftovers[0].length > 90 ? `${leftovers[0].slice(0, 88)}…` : leftovers[0];
  const more = leftovers.length > 1 ? ` (ve ${leftovers.length - 1} yer tutucu daha)` : "";
  return `Şablondaki örnek metin hâlâ duruyor: “${first}”${more}. Yayınlamadan önce kendi içeriğinle değiştir.`;
}

export async function publishPost(id, revision, publishAt) {
  const admin = await getAdmin();
  if (!admin) return UNAUTHORIZED;
  if (!uuidOrNull(id) || !Number.isInteger(revision)) return fail("Geçersiz istek.");

  const { data: post, error } = await admin.supabase
    .from("blog_posts")
    .select("title, slug, content_text, published_at, author_name, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(dbError(error));
  if (!post || post.deleted_at) return fail("Yazı bulunamadı.");

  if (!post.title) return fail("Yayınlamadan önce bir başlık yaz.");
  if (isAutoSlug(post.slug)) return fail("Yayınlamadan önce bir kalıcı bağlantı belirle.");
  if (!post.content_text.trim()) return fail("Yayınlamadan önce yazı içeriğini ekle.");
  const leftover = placeholderError(post.content_text);
  if (leftover) return fail(leftover);

  const now = new Date();
  let publishedAt;
  if (publishAt) {
    publishedAt = new Date(publishAt);
    if (Number.isNaN(publishedAt.getTime())) return fail("Yayın tarihi geçersiz.");
  } else {
    // Daha önce yayımlanmış bir yazı yeniden yayına alınırsa ilk tarihi korunur.
    const previous = post.published_at ? new Date(post.published_at) : null;
    publishedAt = previous && previous <= now ? previous : now;
  }

  const result = await updateWithRevision(admin.supabase, id, revision, {
    status: "published",
    published_at: publishedAt.toISOString(),
    author_name: post.author_name || admin.displayName || profile.fullName,
  });
  if (result.ok) revalidatePost(result.post.slug);
  return result;
}

// "AI ile Blog Oluştur" akışının son adımı: önizlemede onaylanan içeriği tek
// bir güncellemeyle kaydeder ve yayınlar. İçerik ile yayın durumu aynı SQL
// ifadesinde yazıldığı için yarım kalmış bir kayıt oluşamaz; önce her şey
// doğrulanır, eksik varsa veritabanına hiç dokunulmaz.
export async function publishGeneratedPost(id, revision, input) {
  const admin = await getAdmin();
  if (!admin) return UNAUTHORIZED;
  if (!uuidOrNull(id) || !Number.isInteger(revision) || !input) return fail("Geçersiz istek.");

  const parsed = parsePostInput(input);
  if (parsed.error) return fail(parsed.error);
  const { row, tags } = parsed;

  if (!row.title) return fail("Yayınlamadan önce bir başlık yaz.");
  if (isAutoSlug(row.slug)) return fail("Yayınlamadan önce bir kalıcı bağlantı belirle.");
  if (!row.content_text.trim()) return fail("Yayınlamadan önce yazı içeriğini ekle.");
  const leftover = placeholderError(row.content_text);
  if (leftover) return fail(leftover);
  if (!row.cover_media_id) return fail("Kapak görseli olmadan yayınlanamaz.");
  if (!row.cover_alt) return fail("Kapak görselinin alt metni boş olamaz.");

  const inlineImages = contentImages(row.content);
  if (inlineImages.some((image) => !String(image.alt ?? "").trim())) {
    return fail("Yazı içindeki her görselin alt metni olmalı.");
  }

  const { data: post, error } = await admin.supabase
    .from("blog_posts")
    .select("status, published_at, author_name, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(dbError(error));
  if (!post || post.deleted_at) return fail("Yazı bulunamadı.");
  if (post.status !== "draft") return fail("Bu yazı zaten yayında. Değişiklikleri editörden güncelle.");

  // Kapak ve yazı içi görsellerin tamamı medya kütüphanesinde gerçekten var mı?
  const urls = [...new Set(inlineImages.map((image) => image.url))];
  const [coverResult, inlineResult] = await Promise.all([
    admin.supabase.from("blog_media").select("id").eq("id", row.cover_media_id).maybeSingle(),
    urls.length
      ? admin.supabase.from("blog_media").select("url").in("url", urls)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (coverResult.error || inlineResult.error) return fail(dbError(coverResult.error ?? inlineResult.error));
  if (!coverResult.data || inlineResult.data.length !== urls.length) {
    return fail("Görsellerden biri medya kütüphanesinde bulunamadı. Eksik görselle yayınlanmadı.");
  }

  // Aynı bağlantıyla ikinci bir yazı oluşmasın (çöp kutusundakiler dahil).
  const { data: clash, error: clashError } = await admin.supabase
    .from("blog_posts")
    .select("id")
    .eq("slug", row.slug)
    .neq("id", id)
    .limit(1);
  if (clashError) return fail(dbError(clashError));
  if (clash.length > 0) return fail("Bu kalıcı bağlantı başka bir yazıda kullanılıyor. Bağlantıyı değiştir.");

  // Etiketler yayından önce eşitlenir; burada hata olursa yazı taslak kalır.
  const tagError = await syncTags(admin.supabase, id, tags);
  if (tagError) return fail(dbError(tagError));

  const now = new Date();
  const previous = post.published_at ? new Date(post.published_at) : null;
  const result = await updateWithRevision(admin.supabase, id, revision, {
    ...row,
    status: "published",
    published_at: (previous && previous <= now ? previous : now).toISOString(),
    author_name: post.author_name || admin.displayName || profile.fullName,
  });
  if (!result.ok) return result;

  revalidatePost(result.post.slug);

  // Başarı, yazı ziyaretçi gözüyle (anon rol, RLS) okunabildiğinde bildirilir.
  const { data: visible, error: verifyError } = await createPublicClient()
    .from("blog_posts")
    .select("id, slug, cover_media_id")
    .eq("id", id)
    .maybeSingle();
  if (verifyError || !visible || visible.slug !== row.slug || visible.cover_media_id !== row.cover_media_id) {
    console.error("[blog] yayın doğrulanamadı:", verifyError ?? "yazı herkese açık sorguda görünmüyor");
    return fail("Yazı kaydedildi ancak yayında olduğu doğrulanamadı. Yazılar listesinden durumunu kontrol et.", {
      post: result.post,
      unverified: true,
    });
  }

  return { ...result, verified: true };
}

export async function unpublishPost(id, revision) {
  const admin = await getAdmin();
  if (!admin) return UNAUTHORIZED;
  if (!uuidOrNull(id) || !Number.isInteger(revision)) return fail("Geçersiz istek.");

  const result = await updateWithRevision(admin.supabase, id, revision, { status: "draft" });
  if (result.ok) revalidatePost(result.post.slug);
  return result;
}

async function setDeleted(id, deletedAt) {
  const admin = await getAdmin();
  if (!admin) return UNAUTHORIZED;
  if (!uuidOrNull(id)) return fail("Geçersiz istek.");

  // Çöp kutusuna giden yazı yayından da kalkar; geri yüklenince taslak olur.
  const { data, error } = await admin.supabase
    .from("blog_posts")
    .update({ deleted_at: deletedAt, status: "draft" })
    .eq("id", id)
    .select("slug")
    .maybeSingle();
  if (error) return fail(dbError(error));
  if (!data) return fail("Yazı bulunamadı.");

  revalidatePost(data.slug);
  revalidatePath("/admin/blog", "layout");
  return { ok: true };
}

export async function trashPost(id) {
  return setDeleted(id, new Date().toISOString());
}

export async function restorePost(id) {
  return setDeleted(id, null);
}

export async function deletePostForever(id) {
  const admin = await getAdmin();
  if (!admin) return UNAUTHORIZED;
  if (!uuidOrNull(id)) return fail("Geçersiz istek.");

  // Yalnızca çöp kutusundaki yazı kalıcı silinir.
  const { data, error } = await admin.supabase
    .from("blog_posts")
    .delete()
    .eq("id", id)
    .not("deleted_at", "is", null)
    .select("id")
    .maybeSingle();
  if (error) return fail(dbError(error));
  if (!data) return fail("Yazı çöp kutusunda değil.");

  revalidatePath("/admin/blog", "layout");
  return { ok: true };
}

export async function duplicatePost(id) {
  const admin = await getAdmin();
  if (!admin) return UNAUTHORIZED;
  if (!uuidOrNull(id)) return fail("Geçersiz istek.");

  const { data: source, error } = await admin.supabase
    .from("blog_posts")
    .select(ADMIN_POST_FIELDS + ", content_text, reading_minutes, tag_links:blog_post_tags(tag_id)")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(dbError(error));
  if (!source) return fail("Yazı bulunamadı.");

  const { data: copy, error: insertError } = await admin.supabase
    .from("blog_posts")
    .insert({
      title: `${source.title} (kopya)`.slice(0, 160),
      slug: `taslak-${randomUUID().slice(0, 8)}`,
      excerpt: source.excerpt,
      content: source.content,
      content_text: source.content_text,
      reading_minutes: source.reading_minutes,
      cover_media_id: source.cover_media_id,
      cover_alt: source.cover_alt,
      category_id: source.category_id,
      seo_title: source.seo_title,
      seo_description: source.seo_description,
      author_id: admin.user.id,
      author_name: admin.displayName || profile.fullName,
    })
    .select("id")
    .single();
  if (insertError) return fail(dbError(insertError));

  if (source.tag_links.length > 0) {
    const { error: tagError } = await admin.supabase
      .from("blog_post_tags")
      .insert(source.tag_links.map((link) => ({ post_id: copy.id, tag_id: link.tag_id })));
    if (tagError) return fail(dbError(tagError));
  }

  revalidatePath("/admin/blog", "layout");
  return { ok: true, id: copy.id };
}

// --- Kategoriler ve etiketler -----------------------------------------------

export async function createCategory(name) {
  const admin = await getAdmin();
  if (!admin) return UNAUTHORIZED;

  const cleanName = clip(name, 60);
  const slug = slugify(cleanName, 60);
  if (!slug) return fail("Kategori adı en az bir harf ya da rakam içermeli.");

  const { data, error } = await admin.supabase
    .from("blog_categories")
    .insert({ name: cleanName, slug, position: 100 })
    .select("id, name, slug")
    .single();
  if (error) return fail(error.code === "23505" ? "Bu kategori zaten var." : dbError(error));

  revalidatePath("/blog");
  revalidatePath("/admin/blog", "layout");
  return { ok: true, category: data };
}

export async function renameCategory(id, name) {
  const admin = await getAdmin();
  if (!admin) return UNAUTHORIZED;
  const cleanName = clip(name, 60);
  if (!uuidOrNull(id) || !cleanName) return fail("Kategori adı boş olamaz.");

  // Slug bilerek değişmez: /blog?kategori=… bağlantıları bozulmaz.
  const { error } = await admin.supabase.from("blog_categories").update({ name: cleanName }).eq("id", id);
  if (error) return fail(dbError(error));

  revalidatePath("/blog");
  revalidatePath("/admin/blog", "layout");
  return { ok: true };
}

async function deleteTaxonomy(table, id) {
  const admin = await getAdmin();
  if (!admin) return UNAUTHORIZED;
  if (!uuidOrNull(id)) return fail("Geçersiz istek.");

  const { error } = await admin.supabase.from(table).delete().eq("id", id);
  if (error) return fail(dbError(error));

  revalidatePath("/blog");
  revalidatePath("/admin/blog", "layout");
  return { ok: true };
}

export async function deleteCategory(id) {
  return deleteTaxonomy("blog_categories", id);
}

export async function deleteTag(id) {
  return deleteTaxonomy("blog_tags", id);
}

// --- Medya ------------------------------------------------------------------

export async function listMedia() {
  const admin = await getAdmin();
  if (!admin) return UNAUTHORIZED;

  const { data, error } = await admin.supabase
    .from("blog_media")
    .select("id, url, width, height, alt_text, caption, size_bytes, created_at")
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) return fail(dbError(error));
  return { ok: true, media: data };
}

export async function updateMediaAlt(id, altText) {
  const admin = await getAdmin();
  if (!admin) return UNAUTHORIZED;
  if (!uuidOrNull(id)) return fail("Geçersiz istek.");

  const { error } = await admin.supabase
    .from("blog_media")
    .update({ alt_text: clip(altText, 300) })
    .eq("id", id);
  if (error) return fail(dbError(error));
  return { ok: true };
}

export async function deleteMedia(id) {
  const admin = await getAdmin();
  if (!admin) return UNAUTHORIZED;
  if (!uuidOrNull(id)) return fail("Geçersiz istek.");

  // Bir yazıda (kapak ya da içerik) kullanılan görsel silinmez.
  const { data: usage, error: usageError } = await admin.supabase.rpc("blog_media_usage", {
    media_id: id,
  });
  if (usageError) return fail(dbError(usageError));
  if (usage > 0) {
    return fail(`Bu görsel ${usage} yazıda kullanılıyor. Önce o yazılardan kaldır.`);
  }

  const { data: media, error } = await admin.supabase
    .from("blog_media")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(dbError(error));
  if (!media) return fail("Görsel bulunamadı.");

  const { error: storageError } = await admin.supabase.storage
    .from(MEDIA_BUCKET)
    .remove([media.storage_path]);
  if (storageError) return fail("Dosya depolamadan silinemedi. Yeniden dene.");

  const { error: deleteError } = await admin.supabase.from("blog_media").delete().eq("id", id);
  if (deleteError) return fail(dbError(deleteError));

  revalidatePath("/admin/blog/media");
  return { ok: true };
}

// --- Oturum -----------------------------------------------------------------

export async function logout() {
  const admin = await getAdmin();
  if (admin) await admin.supabase.auth.signOut();
  redirect("/admin/login");
}
