import assert from "node:assert/strict";
import { test } from "node:test";
import { ExtractError, decodeEntities, extractArticle, sourceToText } from "@/lib/ai/extract";

const sentence = "paragraf makalenin ana metnini temsil eder ve yeterli uzunlukta olması için birkaç cümle içerir. ";
const filler = `Bu ${sentence.repeat(5)}`;
const filler2 = `İkinci ${sentence.repeat(5)}`;

const PAGE = `<!doctype html><html lang="tr" class="has-main-menu"><head>
<title>SEO Rehberi | Örnek Site</title>
<meta name="description" content="SEO&#39;nun temelleri &amp; ipuçları">
<meta property="og:site_name" content="Örnek Site">
<meta property="og:image" content="/kapak.jpg">
<link rel="canonical" href="https://ornek.com/seo-rehberi">
<script type="application/ld+json">{"@type":"BlogPosting","author":{"name":"Ayşe Yazar"},"datePublished":"2026-01-05"}</script>
</head><body class="tag-seo">
<nav><a href="/">Ana Sayfa</a><p>${filler}</p></nav>
<header><p>Site başlığı alanı</p></header>
<article>
  <h1>SEO Rehberi</h1>
  <p>${filler}</p>
  <script>alert("x")</script>
  <h2>Anahtar kelime araştırması</h2>
  <p>${filler2}</p>
  <ul><li>Birinci madde burada</li><li>İkinci madde burada</li></ul>
  <ol><li>Adım bir</li><li>Adım iki</li></ol>
  <img src="/gorsel.png" alt="Arama sonuçları ekranı" width="800">
  <img src="/logo-icon.png" alt="logo" width="24">
  <table><tr><th>Araç</th><th>Fiyat</th></tr><tr><td>A</td><td>10&nbsp;TL</td></tr></table>
  <blockquote><p>İçerik kraldır, ama dağıtım kraliçedir ve o yönetir.</p></blockquote>
  <div class="related-posts"><p>İlgili yazılar burada listelenir ve makaleye ait değildir aslında.</p></div>
  <h3>Sahipsiz son başlık</h3>
</article>
<aside><p>${filler}</p></aside>
<footer><p>Telif hakkı</p></footer>
</body></html>`;

test("ana içerik çıkarılır; gezinme, yan panel ve betikler atlanır", () => {
  const article = extractArticle(PAGE, "https://ornek.com/seo-rehberi?utm=1");

  assert.equal(article.title, "SEO Rehberi");
  assert.equal(article.metaTitle, "SEO Rehberi | Örnek Site");
  assert.equal(article.metaDescription, "SEO'nun temelleri & ipuçları");
  assert.equal(article.siteName, "Örnek Site");
  assert.equal(article.author, "Ayşe Yazar");
  assert.equal(article.publishedAt, "2026-01-05");
  assert.equal(article.language, "tr");
  assert.equal(article.canonicalUrl, "https://ornek.com/seo-rehberi");

  assert.deepEqual(article.headings, [
    { level: 1, text: "SEO Rehberi" },
    { level: 2, text: "Anahtar kelime araştırması" },
  ]);

  const types = article.blocks.map((block) => block.type);
  assert.deepEqual(types, ["heading", "paragraph", "heading", "paragraph", "list", "list", "image", "table", "quote"]);

  const [bullets, steps] = article.blocks.filter((block) => block.type === "list");
  assert.deepEqual(bullets, { type: "list", ordered: false, items: ["Birinci madde burada", "İkinci madde burada"] });
  assert.equal(steps.ordered, true);
  assert.deepEqual(article.blocks.find((block) => block.type === "table").rows, [["Araç", "Fiyat"], ["A", "10 TL"]]);

  const text = sourceToText(article).text;
  assert.ok(!text.includes("alert"));
  assert.ok(!text.includes("İlgili yazılar"));
  assert.ok(!text.includes("Telif hakkı"));
  assert.ok(!text.includes("Site başlığı alanı"));
  assert.ok(text.includes("## Anahtar kelime araştırması"));
  assert.ok(text.includes("| Araç | Fiyat |"));

  assert.deepEqual(article.images, [
    { src: "https://ornek.com/kapak.jpg", alt: "", role: "og" },
    { src: "https://ornek.com/gorsel.png", alt: "Arama sonuçları ekranı", role: "content", section: "Anahtar kelime araştırması" },
  ]);
});

test("içerik yetersizse hata verir, içerik uydurulmaz", () => {
  assert.throws(() => extractArticle("<html><body><p>Kısa.</p></body></html>", "https://ornek.com/"), ExtractError);
  assert.throws(() => extractArticle("", "https://ornek.com/"), ExtractError);
  assert.throws(
    () => extractArticle(`<html><body><div id="root"></div><script>render()</script></body></html>`, "https://ornek.com/"),
    ExtractError
  );
});

test("gövde boşsa sayfanın kendi JSON-LD metni kullanılır", () => {
  const body = "Gerçek makale metni buradadır ve sayfanın yapılandırılmış verisinden gelir. ".repeat(20);
  const html = `<html><head><title>Başlık</title><script type="application/ld+json">${JSON.stringify({
    "@graph": [{ "@type": "Article", headline: "JSON Başlık", articleBody: body }],
  })}</script></head><body><div id="app"></div></body></html>`;
  const article = extractArticle(html, "https://ornek.com/a");
  assert.equal(article.title, "JSON Başlık");
  assert.ok(article.wordCount > 150);
});

test("uzun kaynak kesilir ve bu belirtilir", () => {
  const article = { blocks: Array.from({ length: 400 }, () => ({ type: "paragraph", text: filler })) };
  const { text, truncated } = sourceToText(article, 5000);
  assert.equal(truncated, true);
  assert.ok(text.length <= 5000 && text.length > 4500);
  assert.ok(text.endsWith(filler), "blok ortasında kesilmez");
});

test("HTML varlıkları çözülür", () => {
  assert.equal(decodeEntities("A &amp; B &#x130;stanbul &#231;ay &ccedil; &bilinmeyen;"), "A & B İstanbul çay ç &bilinmeyen;");
});

test("kesilen kaynakta alınamayan ilk başlık bildirilir; H5/H6 korunur", () => {
  const blocks = [
    { type: "heading", level: 2, text: "Giriş" },
    ...Array.from({ length: 20 }, () => ({ type: "paragraph", text: filler })),
    { type: "heading", level: 2, text: "Sonuç" },
    { type: "paragraph", text: filler },
  ];
  const result = sourceToText({ blocks }, 2000);
  assert.equal(result.truncated, true);
  assert.equal(result.missingFrom, "Sonuç");
  assert.match(sourceToText({ blocks: [{ type: "heading", level: 6, text: "Derin" }] }).text, /^###### Derin/);
});
