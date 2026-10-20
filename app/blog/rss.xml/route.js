import { blog, brand } from "@/data/content";
import { SITE_URL } from "@/lib/supabase/env";
import { listPublishedForFeeds } from "@/lib/blog/queries";

// Her istekte üretilir: yeni yayımlanan ya da kaldırılan yazı anında yansır.
export const dynamic = "force-dynamic";

const escapeXml = (value) =>
  String(value ?? "").replace(
    /[<>&'"]/g,
    (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[ch]
  );

export async function GET() {
  const posts = await listPublishedForFeeds(50);

  const items = posts
    .map(
      (post) => `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${SITE_URL}/blog/${post.slug}</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${post.slug}</guid>
      <pubDate>${new Date(post.published_at).toUTCString()}</pubDate>
      <description>${escapeXml(post.excerpt)}</description>
    </item>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(`${brand.legalName} — Blog`)}</title>
    <link>${SITE_URL}/blog</link>
    <description>${escapeXml(blog.description)}</description>
    <language>tr-TR</language>
    <atom:link href="${SITE_URL}/blog/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
