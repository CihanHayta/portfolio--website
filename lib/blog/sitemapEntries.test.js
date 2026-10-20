import assert from "node:assert/strict";
import { test } from "node:test";
import { sitemapEntries } from "./sitemapEntries.js";

const options = { siteUrl: "https://site.test", ownHosts: [] };

test("site haritası yalnızca kendi kanonik adresi olan yazıları ve dolu kategorileri içerir", () => {
  const entries = sitemapEntries(
    [
      { slug: "a", updated_at: "2026-10-01", canonical_url: null, category: { slug: "seo" } },
      { slug: "b", updated_at: "2026-10-05", canonical_url: "https://site.test/blog/b", category: { slug: "seo" } },
      { slug: "c", updated_at: "2026-10-03", canonical_url: "https://medium.com/c", category: { slug: "sosyal" } },
      { slug: "a", updated_at: "2026-10-01", canonical_url: "", category: null },
      { slug: "", updated_at: "2026-10-01" },
    ],
    options
  );
  const urls = entries.map((entry) => entry.url);
  assert.deepEqual(urls, [
    "https://site.test",
    "https://site.test/blog",
    "https://site.test/gizlilik",
    "https://site.test/blog/a",
    "https://site.test/blog/b",
    "https://site.test/blog?kategori=seo",
  ]);
  assert.equal(entries.at(-1).lastModified, "2026-10-05", "kategori en yeni yazının tarihini taşır");
  assert.ok(!urls.some((url) => url.includes("medium") || url.endsWith("/c")), "dış kanonikli yazı girmez");
  assert.ok(!urls.includes("https://site.test/blog?kategori=sosyal"), "yalnızca dış kanonikli yazısı olan kategori girmez");
});

test("veritabanı yoksa yalnızca sabit sayfalar listelenir", () => {
  assert.equal(sitemapEntries([], options).length, 3);
  assert.equal(sitemapEntries(null, options).length, 3);
});
