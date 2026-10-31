import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanUrl, mergeSources, readMeta, sanitizeMeta, sanitizeSources, sourcesFromReader, sourcesReady } from "./meta.js";
import { danglingCitations, splitCitations } from "./citations.js";
import { sanitizeContent } from "./blocks/model.js";

test("adres yalnızca http/https ve kimlik bilgisi içermez", () => {
  assert.equal(cleanUrl("javascript:alert(1)"), "");
  assert.equal(cleanUrl("ftp://ornek.com/a"), "");
  assert.equal(cleanUrl("https://kul:sifre@ornek.com/"), "");
  assert.equal(cleanUrl("https://localhost/"), "");
  assert.equal(cleanUrl(" https://ornek.com/yazi "), "https://ornek.com/yazi");
});

test("kaynakça: geçersiz ve tekrar eden adresler atılır, sıra korunur", () => {
  const out = sanitizeSources([
    { url: "https://a.com/1", title: "Bir" },
    { url: "notaurl" },
    { url: "https://a.com/1/", title: "Tekrar" },
    { url: "https://b.com/2", title: "İki", sectionUrl: "https://b.com/blog", kind: "source" },
  ]);
  assert.deepEqual(out.map((s) => s.title), ["Bir", "İki"]);
  assert.equal(out[1].sectionUrl, "https://b.com/blog");
  assert.equal(out[0].kind, "user");
  assert.equal(new Set(out.map((s) => s.id)).size, 2);
});

test("meta: tema ve beyan; kaynak varsa beyan düşer", () => {
  assert.deepEqual(sanitizeMeta({ theme: "dark" }), { theme: "dark" });
  assert.equal(sanitizeMeta({ theme: "neon" }), null);
  assert.deepEqual(sanitizeMeta({ sourcesWaived: true }), { sourcesWaived: true });
  const both = sanitizeMeta({ sourcesWaived: true, sources: [{ url: "https://a.com" }] });
  assert.equal(both.sourcesWaived, undefined);
  assert.equal(both.sources.length, 1);
});

test("yayın kuralı: kaynak ya da açık beyan", () => {
  assert.equal(sourcesReady({}), false);
  assert.equal(sourcesReady({ sources: [{ url: "bozuk" }] }), false);
  assert.equal(sourcesReady({ sources: [{ url: "https://a.com" }] }), true);
  assert.equal(sourcesReady({ sourcesWaived: true }), true);
});

test("sanitizeContent meta'yı korur, eski belgede meta yoktur", () => {
  const content = sanitizeContent({ type: "blocks", version: 1, blocks: [], meta: { theme: "dark", sources: [{ url: "https://a.com", title: "A" }], hack: 1 } });
  assert.equal(content.meta.theme, "dark");
  assert.equal(content.meta.hack, undefined);
  assert.equal(readMeta(content).sources[0].title, "A");
  assert.equal(sanitizeContent({ type: "blocks", version: 1, blocks: [] }).meta, undefined);
  assert.equal(sanitizeContent({ type: "doc", content: [], meta: { theme: "dark" } }).meta, undefined);
});

test("okuyucu sonucundan kaynakça; birleştirmede tekrar yok", () => {
  const fromReader = sourcesFromReader([{ url: "https://a.com/x", title: "X", siteName: "A" }], "2026-10-30T00:00:00.000Z");
  assert.equal(fromReader[0].kind, "source");
  assert.equal(fromReader[0].accessedAt, "2026-10-30T00:00:00.000Z");
  assert.equal(mergeSources(fromReader, [{ url: "https://a.com/x" }, { url: "https://b.com" }]).length, 2);
});

test("atıflar: yalnızca var olan numaralar bağlantı olur", () => {
  assert.deepEqual(splitCitations("Veri [1] ve [2, 3].", 3), [{ text: "Veri " }, { refs: [1] }, { text: " ve " }, { refs: [2, 3] }, { text: "." }]);
  assert.deepEqual(splitCitations("Dizi [5] burada", 2), [{ text: "Dizi [5] burada" }]);
  assert.deepEqual(splitCitations("[1]", 0), [{ text: "[1]" }]);
  assert.deepEqual(danglingCitations("a [1] b [4] c [2, 9]", 2), [4, 9]);
});

test("vurgu işareti (accent) temizlikten geçer; bilinmeyen işaret atılır", async () => {
  const { sanitizeDoc } = await import("./content.js");
  const doc = sanitizeDoc({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "önemli", marks: [{ type: "accent" }, { type: "evil" }] }] }] });
  assert.deepEqual(doc.content[0].content[0].marks, [{ type: "accent" }]);
});
