// Site haritası girdileri (saf; testlerde de kullanılır). Yalnızca bu sitede
// dizine eklenmesi amaçlanan, kendi kanonik adresi olan sayfalar listelenir:
// dış kanonikli yazılar ve yayımlanmış yazısı olmayan kategoriler girmez.
import { postCanonical } from "./canonical.js";

export function sitemapEntries(posts, { siteUrl, ownHosts = [] }) {
  const entries = [
    { url: siteUrl, changeFrequency: "monthly", priority: 1 },
    { url: `${siteUrl}/blog`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/gizlilik`, changeFrequency: "yearly", priority: 0.2 },
  ];
  const seen = new Set(entries.map((entry) => entry.url));
  const categories = new Map();

  for (const post of posts ?? []) {
    if (!post?.slug) continue;
    const canonical = postCanonical({ slug: post.slug, canonicalUrl: post.canonical_url }, { siteUrl, ownHosts });
    if (canonical.external || seen.has(canonical.url)) continue;
    seen.add(canonical.url);
    entries.push({ url: canonical.url, lastModified: post.updated_at, changeFrequency: "monthly", priority: 0.6 });

    const category = post.category?.slug;
    if (category) {
      const latest = categories.get(category);
      if (!latest || String(post.updated_at) > String(latest)) categories.set(category, post.updated_at);
    }
  }

  // Kategori listeleri kendi canonical'ına sahiptir (/blog?kategori=…).
  for (const [slug, lastModified] of categories) {
    entries.push({ url: `${siteUrl}/blog?kategori=${encodeURIComponent(slug)}`, lastModified, changeFrequency: "weekly", priority: 0.5 });
  }
  return entries;
}
