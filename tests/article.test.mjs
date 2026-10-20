import assert from "node:assert/strict";
import { test } from "node:test";
import { clipWords, inlineImageCount, normalizeArticle, normalizePlan, buildArticlePrompt, buildPlanPrompt } from "@/lib/ai/prompts";
import { runQualityChecks } from "@/lib/ai/quality";
import { blocksToDoc, docImages, inlineNodes, setImageAlt, withSourceCredit } from "@/lib/ai/tiptap";
import { contentImages, sanitizeContent } from "@/lib/blog/blocks/model";
import { MEDIA_URL_PREFIX, sanitizeDoc } from "@/lib/blog/content";
import { SLUG_PATTERN } from "@/lib/blog/slug";

const media = (name) => ({ id: `id-${name}`, url: `${MEDIA_URL_PREFIX}2026/10/${name}.webp`, width: 1600, height: 900 });
const images = [
  { id: "inline-1", role: "inline", alt: "Birinci görsel", media: media("bir") },
  { id: "inline-2", role: "inline", alt: "İkinci görsel", media: media("iki") },
];

const rawArticle = {
  primaryKeyword: "içerik pazarlaması",
  secondaryKeywords: ["blog stratejisi", "seo"],
  seoTitle: "İçerik Pazarlaması Nedir? **Başlangıç** Rehberi",
  h1: "İçerik Pazarlaması: Sıfırdan Başlangıç Rehberi",
  metaDescription:
    "İçerik pazarlaması ile doğru kitleye ulaşmanın yollarını öğren. Plan yapmayı, içerik üretmeyi ve sonuçları ölçmeyi adım adım anlatan kapsamlı bir başlangıç rehberi hazırladık senin için burada.",
  slug: "İçerik Pazarlaması Rehberi!",
  excerpt: "İçerik pazarlaması ile doğru kitleye ulaşmanın yolları.",
  categorySlug: "dijital-pazarlama",
  tags: ["İçerik", "#SEO", "icerik", "", "Blog"],
  blocks: [
    { type: "h3", text: "Erken gelen alt başlık" },
    { type: "p", text: "İçerik pazarlaması, **değerli** içerikle *güven* kurmaktır. `kod` ve [iletişim](/#contact)." },
    { type: "h2", text: "## Neden *önemli*?" },
    { type: "p", text: "Çünkü [tehlikeli](javascript:alert(1)) bağlantılar düz metne iner." },
    { type: "image", imageId: "inline-1" },
    { type: "image", imageId: "inline-1" },
    { type: "image", imageId: "uydurma" },
    { type: "ul", items: ["Bir", "", "İki"] },
    { type: "ol", items: [] },
    { type: "table", rows: [{ cells: ["Kanal", "Maliyet"] }, { cells: ["Blog"] }] },
    { type: "table", rows: [{ cells: ["tek satır"] }] },
    { type: "quote", text: "Alıntı metni." },
    { type: "script", text: "alert(1)" },
    { type: "h2", text: "Sonuç" },
    { type: "p", text: "Özet paragrafı." },
  ],
};

test("model çıktısı sınırlanır: SEO alanları, slug, etiketler, bloklar", () => {
  const article = normalizeArticle(rawArticle, {
    imageIds: ["inline-1", "inline-2"],
    categorySlugs: ["teknoloji", "dijital-pazarlama"],
  });

  assert.equal(article.title, "İçerik Pazarlaması: Sıfırdan Başlangıç Rehberi");
  assert.equal(article.seoTitle, "İçerik Pazarlaması Nedir? Başlangıç Rehberi");
  assert.ok(article.seoTitle.length <= 60);
  assert.ok(article.seoDescription.length <= 160, String(article.seoDescription.length));
  assert.match(article.seoDescription, /[.…]$/, "meta açıklaması sözcük ortasında kesilmez");
  assert.equal(article.slug, "icerik-pazarlamasi-rehberi");
  assert.match(article.slug, SLUG_PATTERN);
  assert.ok(article.excerpt.length <= 200);
  assert.deepEqual(article.tags, ["İçerik", "SEO", "Blog"]);
  assert.equal(article.categorySlug, "dijital-pazarlama");
  assert.deepEqual(article.missingImages, ["inline-2"]);

  const types = article.blocks.map((block) => block.type);
  assert.deepEqual(types, ["h2", "p", "h2", "p", "image", "ul", "table", "quote", "h2", "p"]);
  assert.equal(article.blocks[2].text, "Neden önemli?");
  assert.deepEqual(article.blocks[5].items, ["Bir", "İki"]);
  assert.deepEqual(article.blocks[6].rows, [["Kanal", "Maliyet"], ["Blog", ""]]);

  assert.equal(normalizeArticle({ ...rawArticle, categorySlug: "olmayan" }, { imageIds: [], categorySlugs: ["teknoloji"] }).categorySlug, "");
  assert.equal(normalizeArticle({ ...rawArticle, h1: "" }, { imageIds: [], categorySlugs: [] }), null);
  assert.equal(normalizeArticle({ ...rawArticle, blocks: [{ type: "h2", text: "Yalnız başlık" }] }, { imageIds: [], categorySlugs: [] }), null);
  assert.equal(normalizeArticle(null, { imageIds: [], categorySlugs: [] }), null);
});

test("metin kırpma cümle ya da sözcük sınırında yapılır", () => {
  assert.equal(clipWords("Kısa metin.", 60), "Kısa metin.");
  assert.equal(clipWords("Birinci cümle burada biter. İkinci cümle sınırı aşıyor ve kesilir.", 40), "Birinci cümle burada biter.");
  const clipped = clipWords("virgülsüz ve noktasız uzun bir başlık metni burada devam ediyor", 30);
  assert.ok(clipped.length <= 30 && clipped.endsWith("…") && !clipped.includes("  "), clipped);
});

test("görsel planı: tek kapak, sınırlı sayıda yazı içi görsel, geçerli motif", () => {
  const item = (role, extra = {}) => ({ role, concept: "Konsept", description: "Açıklama", alt: "Alt metin", placement: "Girişten sonra", motif: "chart", palette: "forest", prompt: "an illustration", ...extra });
  const plan = normalizePlan(
    {
      topic: "Konu",
      summary: "Özet metni.",
      keyPoints: ["Bir", "İki", "Üç"],
      images: [item("inline"), item("cover", { motif: "uydurma", palette: "pembe" }), item("cover"), item("inline"), item("inline"), item("inline", { alt: "" })],
    },
    2
  );
  assert.deepEqual(plan.images.map((image) => image.id), ["cover", "inline-1", "inline-2"]);
  assert.equal(plan.images[0].palette, "forest");
  assert.notEqual(plan.images[0].motif, "uydurma");
  assert.equal(normalizePlan({ summary: "x", keyPoints: ["a", "b"], images: [item("inline")] }, 1), null, "kapak zorunlu");
  assert.equal(normalizePlan({ summary: "", keyPoints: [], images: [item("cover")] }, 1), null);
  assert.deepEqual([200, 900, 3000].map(inlineImageCount), [1, 2, 3]);
});

test("istemler kaynağı sınırlandırılmış veri olarak verir ve uydurmayı yasaklar", () => {
  const source = { title: "Başlık", metaDescription: "", text: "KAYNAK METNİ", truncated: true, wordCount: 900 };
  const plan = { summary: "Özet", keyPoints: ["Fikir"] };
  const planPrompt = buildPlanPrompt(source, 2);
  assert.match(planPrompt, /<kaynak_metin>\nKAYNAK METNİ\n<\/kaynak_metin>/);
  assert.match(planPrompt, /2 yazı içi görsel/);
  const articlePrompt = buildArticlePrompt({ source, plan, images, categories: [{ slug: "teknoloji", name: "Teknoloji" }] });
  assert.match(articlePrompt, /inline-1 — /);
  assert.match(articlePrompt, /teknoloji — Teknoloji/);
  assert.match(articlePrompt, /baş kısmı verildi/);
});

test("satır içi işaretler Tiptap düğümlerine çevrilir", () => {
  assert.deepEqual(inlineNodes("düz **kalın** *italik* `kod` [bağ](/#contact) son"), [
    { type: "text", text: "düz " },
    { type: "text", text: "kalın", marks: [{ type: "bold" }] },
    { type: "text", text: " " },
    { type: "text", text: "italik", marks: [{ type: "italic" }] },
    { type: "text", text: " " },
    { type: "text", text: "kod", marks: [{ type: "code" }] },
    { type: "text", text: " " },
    { type: "text", text: "bağ", marks: [{ type: "link", attrs: { href: "/#contact" } }] },
    { type: "text", text: " son" },
  ]);
  assert.deepEqual(inlineNodes("[x](javascript:alert(1))")[0], { type: "text", text: "x" });
  assert.deepEqual(inlineNodes("5 * 3 = 15 ve 2*4"), [{ type: "text", text: "5 * 3 = 15 ve 2*4" }]);
});

function buildDoc() {
  const article = normalizeArticle(rawArticle, { imageIds: ["inline-1", "inline-2"], categorySlugs: [] });
  return { article, doc: blocksToDoc(article.blocks, images, article.missingImages) };
}

test("bloklar editörün kabul ettiği Tiptap belgesine dönüşür", () => {
  const { doc } = buildDoc();

  // Editörün kendi temizleyicisi belgeyi hiç değiştirmiyorsa yapı geçerlidir.
  assert.deepEqual(sanitizeDoc(doc), doc);

  const types = doc.content.map((node) => node.type);
  assert.ok(types.includes("bulletList") && types.includes("table") && types.includes("blockquote"));
  // h2 → seviye 1, h3 → seviye 2: sayfada <h2>/<h3> olarak çizilir, ikinci bir <h1> oluşmaz.
  assert.deepEqual(doc.content.filter((node) => node.type === "heading").map((node) => node.attrs.level), [1, 1, 1]);
  const blocks = sanitizeContent(doc).blocks;
  assert.deepEqual(blocks.filter((block) => block.type === "heading").map((block) => block.props.level), ["2", "2", "2"]);
  assert.equal(contentImages({ type: "blocks", blocks }).length, 2);
  assert.ok(contentImages({ type: "blocks", blocks }).every((image) => image.alt));

  const table = doc.content.find((node) => node.type === "table");
  assert.equal(table.content[0].content[0].type, "tableHeader");
  assert.equal(table.content[1].content[0].type, "tableCell");

  // Modelin yerleştirmediği görsel kaybolmaz; her görsel tam bir kez yer alır.
  const placed = docImages(doc);
  assert.deepEqual(placed.map((node) => node.attrs.alt).sort(), ["Birinci görsel", "İkinci görsel"]);
  assert.ok(placed.every((node) => node.attrs.src.startsWith(MEDIA_URL_PREFIX) && node.attrs.width === 1600));
  assert.notEqual(doc.content[0].type, "image", "görsel yazının en başına konmaz");
});

test("medya kütüphanesinde olmayan görsel belgeye giremez", () => {
  const foreign = [{ id: "inline-1", role: "inline", alt: "x", media: { url: "https://baska.com/a.png", width: 10, height: 10 } }];
  const doc = blocksToDoc([{ type: "p", text: "Metin" }, { type: "image", imageId: "inline-1" }], foreign);
  assert.equal(docImages(doc).length, 0);
});

test("alt metin güncelleme ve kaynak notu belge yapısını bozmaz", () => {
  const { doc } = buildDoc();
  const src = docImages(doc)[0].attrs.src;
  const updated = setImageAlt(doc, src, "Yeni alt");
  assert.equal(docImages(updated).find((node) => node.attrs.src === src).attrs.alt, "Yeni alt");
  assert.notEqual(docImages(doc)[0].attrs.alt, "Yeni alt", "özgün belge değişmez");

  const credited = withSourceCredit(doc, "https://ornek.com/yazi", "Örnek Site");
  assert.deepEqual(sanitizeDoc(credited), credited);
  assert.equal(credited.content.length, doc.content.length + 1);
  assert.equal(withSourceCredit(doc, "javascript:alert(1)", "x"), doc);
});

function quality(overrides = {}) {
  const { article, doc } = buildDoc();
  return runQualityChecks({
    fields: {
      title: article.title,
      seoTitle: article.seoTitle,
      seoDescription: article.seoDescription,
      slug: article.slug,
      excerpt: article.excerpt,
      coverAlt: "Kapak alt metni",
      primaryKeyword: article.primaryKeyword,
      ...overrides.fields,
    },
    doc: overrides.doc ?? doc,
    sourceText: overrides.sourceText ?? "İçerik pazarlaması üzerine kaynak metin.",
    cover: "cover" in overrides ? overrides.cover : media("kapak"),
    plannedInlineCount: 2,
  });
}
const level = (report, id) => report.checks.find((check) => check.id === id)?.level;

test("kalite denetimi: geçerli yazı yayına engel hata içermez", () => {
  const report = quality();
  assert.equal(report.hasErrors, false, JSON.stringify(report.checks.filter((check) => check.level === "error")));
  for (const id of ["title", "seoTitle", "seoDescription", "slug", "excerpt", "cover", "images", "structure", "originality", "facts"]) {
    assert.equal(level(report, id), "ok", id);
  }
  assert.equal(level(report, "research"), "info");
  assert.equal(level(report, "length"), "warn", "kısa yazı uyarı verir ama engellemez");
});

test("kalite denetimi: eksik ve hatalı alanlar yayını engeller", () => {
  assert.equal(level(quality({ fields: { title: " " } }), "title"), "error");
  assert.equal(level(quality({ fields: { seoTitle: "x".repeat(71) } }), "seoTitle"), "error");
  assert.equal(level(quality({ fields: { seoDescription: "x".repeat(161) } }), "seoDescription"), "error");
  assert.equal(level(quality({ fields: { slug: "Geçersiz Slug" } }), "slug"), "error");
  assert.equal(level(quality({ fields: { slug: "taslak-0a1b2c3d" } }), "slug"), "error");
  assert.equal(level(quality({ cover: null }), "cover"), "error");
  assert.equal(level(quality({ fields: { coverAlt: "" } }), "cover"), "error");
  assert.equal(quality({ cover: null }).hasErrors, true);

  const { doc } = buildDoc();
  const noAlt = setImageAlt(doc, docImages(doc)[0].attrs.src, "");
  assert.equal(level(quality({ doc: noAlt }), "images"), "error");

  const unknownNode = { ...doc, content: [...doc.content, { type: "iframe", attrs: { src: "https://x" } }] };
  assert.equal(level(quality({ doc: unknownNode }), "structure"), "error");
});

test("kalite denetimi: uydurma sayı, kopya ve tekrar uyarı olarak işaretlenir", () => {
  const para = (text) => ({ type: "paragraph", content: [{ type: "text", text }] });
  const copied = "Bu cümle kaynak metinde aynen geçen uzun bir ifadedir ve birebir kopyalanmıştır tam olarak böyle.";
  const doc = {
    type: "doc",
    content: [
      para("Araştırmaya göre kullanıcıların %73'ü 2024 yılında 150 dakika harcıyor ve 3 adım izliyor."),
      para(copied),
      para("Aynı paragraf iki kez yazılmış olduğunda bu durum tespit edilmelidir mutlaka."),
      para("Aynı paragraf iki kez yazılmış olduğunda bu durum tespit edilmelidir mutlaka."),
    ],
  };
  const report = quality({ doc, sourceText: `${copied} Kaynakta 2024 yılı geçiyor.` });
  const facts = report.checks.find((check) => check.id === "facts");
  assert.equal(facts.level, "warn");
  assert.deepEqual(facts.detail.split(", ").sort(), ["150", "73"], "2024 kaynakta var, 3 tek haneli");
  assert.equal(level(report, "originality"), "warn");
  assert.equal(level(report, "repetition"), "warn");
  assert.equal(level(report, "headings"), "warn");
  assert.equal(report.hasErrors, false, "uyarılar yayını engellemez");
});

test("anahtar kelime denetimi Türkçe karakter farkına takılmaz", () => {
  const report = quality({ fields: { primaryKeyword: "icerik pazarlamasi" } });
  assert.equal(level(report, "keyword"), "ok");
  assert.equal(level(quality({ fields: { primaryKeyword: "bambaşka ifade" } }), "keyword"), "warn");
});
