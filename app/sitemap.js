import { PRODUCTION_SITE_URL, SITE_URL } from "@/lib/supabase/env";
import { listPublishedForFeeds } from "@/lib/blog/queries";
import { sitemapEntries } from "@/lib/blog/sitemapEntries";

// Her istekte üretilir: yeni yayımlanan ya da kaldırılan yazı anında yansır.
export const dynamic = "force-dynamic";

export default async function sitemap() {
  // Veritabanına ulaşılamasa bile site haritası sabit sayfalarla üretilir.
  const posts = await listPublishedForFeeds().catch(() => []);
  return sitemapEntries(posts, { siteUrl: SITE_URL, ownHosts: [new URL(PRODUCTION_SITE_URL).host] });
}
