import { SITE_URL } from "@/lib/supabase/env";
import { listPublishedForFeeds } from "@/lib/blog/queries";

export const revalidate = 3600;

export default async function sitemap() {
  // Veritabanına ulaşılamasa bile site haritası sabit sayfalarla üretilir.
  const posts = await listPublishedForFeeds().catch(() => []);

  return [
    { url: SITE_URL, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.8 },
    ...posts.map((post) => ({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: post.updated_at,
      changeFrequency: "monthly",
      priority: 0.6,
    })),
  ];
}
