import "server-only";
import { createPublicClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const POSTS_PER_PAGE = 9;

const CARD_FIELDS =
  "id, title, slug, excerpt, published_at, reading_minutes, cover_alt, " +
  "cover:blog_media(url, width, height), category:blog_categories(name, slug)";

// RLS zaten yalnızca yayımlanmış yazıları döndürür; koşulları sorguda da
// tekrarlamak, politika yanlışlıkla gevşetilirse ikinci bir emniyet sağlar.
function publicPosts(supabase, fields, options) {
  return supabase
    .from("blog_posts")
    .select(fields, options)
    .eq("status", "published")
    .is("deleted_at", null)
    .lte("published_at", new Date().toISOString());
}

function unwrap({ data, error, count }) {
  if (error) throw new Error(`Blog verisi okunamadı: ${error.message}`);
  return { data, count };
}

export async function listCategories() {
  if (!isSupabaseConfigured()) return [];
  const { data } = unwrap(
    await createPublicClient()
      .from("blog_categories")
      .select("id, name, slug, description, blog_posts(count)")
      .order("position")
      .order("name")
  );
  return data.map(({ blog_posts, ...category }) => ({
    ...category,
    postCount: blog_posts?.[0]?.count ?? 0,
  }));
}

export async function listPosts({ query = "", categoryId = null, page = 1 } = {}) {
  if (!isSupabaseConfigured()) return { posts: [], total: 0 };

  let request = publicPosts(createPublicClient(), CARD_FIELDS, { count: "exact" });
  if (categoryId) request = request.eq("category_id", categoryId);

  // PostgREST `or` sözdizimini bozabilecek karakterler aramadan çıkarılır.
  const term = query.replace(/[%_,()"\\*]/g, " ").trim().slice(0, 80);
  if (term) {
    request = request.or(`title.ilike.%${term}%,excerpt.ilike.%${term}%,content_text.ilike.%${term}%`);
  }

  const from = (page - 1) * POSTS_PER_PAGE;
  const { data, count } = unwrap(
    await request.order("published_at", { ascending: false }).range(from, from + POSTS_PER_PAGE - 1)
  );
  return { posts: data, total: count ?? 0 };
}

export async function listFeaturedPosts(limit = 3) {
  if (!isSupabaseConfigured()) return [];
  const { data } = unwrap(
    await publicPosts(createPublicClient(), CARD_FIELDS)
      .eq("is_featured", true)
      .order("published_at", { ascending: false })
      .limit(limit)
  );
  return data;
}

export async function getPostBySlug(slug) {
  if (!isSupabaseConfigured()) return null;
  const { data } = unwrap(
    await publicPosts(
      createPublicClient(),
      `${CARD_FIELDS}, content, author_name, updated_at, seo_title, seo_description, ` +
        "canonical_url, category_id, tags:blog_tags(name, slug)"
    )
      .eq("slug", slug)
      .maybeSingle()
  );
  return data;
}

export async function getRedirectSlug(oldSlug) {
  if (!isSupabaseConfigured()) return null;
  const { data } = unwrap(
    await createPublicClient()
      .from("blog_slug_redirects")
      .select("post:blog_posts(slug)")
      .eq("old_slug", oldSlug)
      .maybeSingle()
  );
  return data?.post?.slug ?? null;
}

export async function listRelatedPosts(post, limit = 3) {
  if (!isSupabaseConfigured()) return [];
  const supabase = createPublicClient();
  const base = () =>
    publicPosts(supabase, CARD_FIELDS)
      .neq("id", post.id)
      .order("published_at", { ascending: false })
      .limit(limit);

  const sameCategory = post.category_id
    ? unwrap(await base().eq("category_id", post.category_id)).data
    : [];
  if (sameCategory.length >= limit) return sameCategory;

  const seen = new Set(sameCategory.map((item) => item.id));
  const recent = unwrap(await base()).data.filter((item) => !seen.has(item.id));
  return [...sameCategory, ...recent].slice(0, limit);
}

export async function listPublishedForFeeds(limit = 1000) {
  if (!isSupabaseConfigured()) return [];
  const { data } = unwrap(
    await publicPosts(createPublicClient(), "slug, title, excerpt, published_at, updated_at, author_name")
      .order("published_at", { ascending: false })
      .limit(limit)
  );
  return data;
}
