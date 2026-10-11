"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { profile } from "@/data/content";
import { ADMIN_POST_FIELDS, getAdmin } from "@/lib/blog/admin";
import { docText, readingMinutes, sanitizeDoc } from "@/lib/blog/content";
import { SLUG_PATTERN, slugify } from "@/lib/blog/slug";
import { MEDIA_BUCKET } from "@/lib/supabase/env";

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
  revalidatePath("/sitemap.xml");
  revalidatePath("/blog/rss.xml");
  if (slug) revalidatePath(`/blog/${slug}`);
}

function isAutoSlug(slug) {
  return /^taslak-[0-9a-f]{8}$/.test(slug);
}

// --- Yazılar ----------------------------------------------------------------

export async function createDraft() {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");

  const { data, error } = await admin.supabase
    .from("blog_posts")
    .insert({
      slug: `taslak-${randomUUID().slice(0, 8)}`,
      author_id: admin.user.id,
      author_name: admin.displayName || profile.fullName,
    })
    .select("id")
    .single();

  if (error) throw new Error(dbError(error));
  redirect(`/admin/blog/${data.id}`);
}

function parsePostInput(input) {
  const slug = slugify(input.slug);
  if (!SLUG_PATTERN.test(slug)) {
    return { error: "Kalıcı bağlantı en az bir harf ya da rakam içermeli." };
  }

  const content = sanitizeDoc(input.content);
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

  const contentText = docText(content);

  return {
    tags,
    row: {
      title: clip(input.title, 160),
      slug,
      excerpt: clip(input.excerpt, 200),
      content,
      content_text: contentText,
      reading_minutes: readingMinutes(contentText),
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
