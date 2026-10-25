import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildReferencePrompt,
  buildVisualPlanPrompt,
  draftSections,
  duckDuckGoImagesUrl,
  imageSearchQuery,
  normalizeVisualPlan,
  visualBudget,
} from "../lib/ai/visualPlan.js";
import { insertVisuals } from "../lib/blog/blocks/insertVisuals.js";
import { adoptNewContext, loadSourceContext, loadVisualState, saveSourceContext, saveVisualState } from "../lib/blog/sourceContext.js";

const heading = (id, text, level = "2") => ({ id, type: "heading", props: { level, text } });
const para = (id, text) => ({ id, type: "text", props: { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] } } });
const BLOCKS = [
  para("p0", "Giriş paragrafı reklam bütçesi hakkında."),
  heading("h1", "Meta reklam bütçesi nasıl belirlenir"),
  para("p1", "Bütçe hedefe göre belirlenir. ".repeat(30)),
  heading("h2", "Manuel ve otomatik teklif karşılaştırması"),
  para("p2", "İki yaklaşımın farkı. ".repeat(30)),
  heading("h3", "Örnek kampanya kurgusu", "3"),
  para("p3", "Örnek kurgu. ".repeat(10)),
  heading("h4", "Sonuç"),
  para("p4", "Özet."),
];
const SECTIONS = draftSections(BLOCKS);
const SOURCE_IMAGES = [
  { src: "https://kaynak.example/a.jpg", alt: "Teklif stratejisi grafiği", section: "Manuel ve otomatik teklif" },
  { src: "https://kaynak.example/b.jpg", alt: "Bütçe tablosu", section: "Reklam bütçesi" },
];

test("Taslaktan H2/H3 bölümleri çıkarılır", () => {
  assert.deepEqual(SECTIONS.map((section) => [section.id, section.level]), [["h1", 2], ["h2", 2], ["h3", 3], ["h4", 2]]);
  assert.ok(SECTIONS[0].words > 50);
  assert.ok(!SECTIONS[0].text.includes("Manuel"), "bölüm metni sonraki başlıkta biter");
});

test("Görsel sayısı makale uzunluğuna göre belirlenir", () => {
  assert.equal(visualBudget(300, 5), 2);
  assert.equal(visualBudget(2400, 6), 6);
  assert.equal(visualBudget(9000, 20), 8);
  assert.equal(visualBudget(0, 0), 1);
});

test("Plan doğrulanır: bilinmeyen bölüm, ikinci kapak, kapanış bölümü ve bütçe aşımı atılır", () => {
  const raw = {
    analysis: { topic: "Meta reklam bütçesi", audience: "KOBİ", intent: "nasıl yapılır", sections: [{ sectionId: "h1", question: "Bütçe nasıl?", mainIdea: "Hedef", concepts: ["ROAS"] }, { sectionId: "yok", question: "x", mainIdea: "y" }] },
    items: [
      { target: "h2", kind: "comparison", purpose: "Farkı göster", composition: "iki sütun", aspect: "3:2", prompt: "two approaches side by side", alt: "Karşılaştırma", priority: 1, sourceImage: -1 },
      { target: "cover", kind: "cover", purpose: "Ana konu", composition: "geniş", aspect: "16:9", prompt: "budget planning desk", alt: "Kapak", priority: 1 },
      { target: "cover", kind: "cover", purpose: "İkinci kapak", composition: "x", aspect: "16:9", prompt: "x", alt: "x", priority: 1 },
      { target: "h4", kind: "section", purpose: "Sonuç görseli", composition: "x", aspect: "3:2", prompt: "x", alt: "x", priority: 2 },
      { target: "uydurma", kind: "section", purpose: "x", composition: "x", aspect: "3:2", prompt: "x", alt: "x", priority: 2 },
      { target: "h2", kind: "comparison", purpose: "Tekrar", composition: "x", aspect: "3:2", prompt: "y", alt: "y", priority: 2 },
      { target: "h1", kind: "section", purpose: "Bütçe", composition: "x", aspect: "21:9", prompt: "budget", alt: "Bütçe", priority: 2 },
      { target: "h3", kind: "example", purpose: "Örnek", composition: "x", aspect: "4:3", prompt: "example", alt: "Örnek", priority: 3 },
    ],
    skip: [{ sectionId: "h4", reason: "Kapanış bölümü" }, { sectionId: "uydurma", reason: "x" }],
  };
  const plan = normalizeVisualPlan(raw, { sections: SECTIONS, sourceImages: SOURCE_IMAGES, budget: 3 });
  assert.deepEqual(plan.items.map((item) => [item.target, item.kind]), [["cover", "cover"], ["h2", "comparison"], ["h1", "section"]]);
  assert.equal(plan.items[2].aspect, "3:2", "geçersiz oran düzeltilir");
  assert.equal(plan.items[1].sourceImage.src, SOURCE_IMAGES[0].src, "kaynak görsel bölüm başlığıyla eşleşir");
  assert.equal(plan.items[0].sourceImage, null, "kapağa kendiliğinden kaynak görsel atanmaz");
  assert.ok(plan.items.every((item) => item.status === "planned" && item.negative));
  assert.deepEqual(plan.skipped.map((entry) => entry.sectionId), ["h4"]);
  assert.deepEqual(plan.analysis.sections.map((entry) => entry.sectionId), ["h1"]);
});

test("Plan istemi bölüm kimliklerini, kaynak iskeletini ve eksik okuma bilgisini içerir", () => {
  const prompt = buildVisualPlanPrompt({
    title: "Meta reklam bütçesi",
    sections: SECTIONS,
    source: { url: "https://kaynak.example/yazi", title: "Budget", text: "# Başlık\n## Alt başlık\nMetin", images: SOURCE_IMAGES, wordCount: 1800, truncated: true, missingFrom: "Bölüm 5" },
    budget: 4,
  });
  assert.match(prompt, /\[h1\] H2 "Meta reklam bütçesi nasıl belirlenir"/);
  assert.match(prompt, /## Alt başlık/);
  assert.match(prompt, /kısmen okundu; eksik kısım: Bölüm 5/);
  assert.match(prompt, /0\. "Teklif stratejisi grafiği" — bölüm: Manuel/);
});

test("Seçilen görseller doğru başlığın altına eklenir; metin blokları korunur; hedefsiz görsel sona yığılmaz", () => {
  const media = (id) => ({ id, url: `https://cdn.example/${id}.webp`, width: 1200, height: 800 });
  const { blocks, cover, placed, unplaced } = insertVisuals(BLOCKS, [
    { target: "cover", media: media("kapak"), alt: "Kapak alt" },
    { target: "h2", media: media("k1"), alt: "Karşılaştırma 1", caption: "Açıklama" },
    { target: "h2", media: media("k2"), alt: "Karşılaştırma 2" },
    { target: "silinmis-baslik", media: media("x"), alt: "x" },
    { target: "p1", media: media("y"), alt: "paragraf hedef olamaz" },
  ]);
  assert.equal(cover.media.id, "kapak");
  assert.equal(placed, 2);
  assert.deepEqual(unplaced.map((pick) => pick.media.id), ["x", "y"]);
  const order = blocks.map((block) => (block.type === "image" ? `img:${block.props.image.url.split("/").pop()}` : block.id));
  assert.deepEqual(order, ["p0", "h1", "p1", "h2", "img:k1.webp", "img:k2.webp", "p2", "h3", "p3", "h4", "p4"]);
  assert.equal(blocks[4].props.caption, "Açıklama");
  assert.equal(blocks[4].props.image.alt, "Karşılaştırma 1");
  assert.equal(BLOCKS.length, 9, "girdi dizisi değişmez");
});

test("DuckDuckGo bağlantısı bölüm ve başlıktan sorgu oluşturur (yalnızca kullanıcı açar)", () => {
  const query = imageSearchQuery({ target: "h2", heading: "Manuel ve otomatik teklif karşılaştırması" }, "Meta reklam bütçesi");
  assert.equal(query, "manuel otomatik teklif karşılaştırması meta reklam bütçesi");
  const url = new URL(duckDuckGoImagesUrl(query));
  assert.equal(url.host, "duckduckgo.com");
  assert.equal(url.searchParams.get("q"), query);
  assert.equal(url.searchParams.get("iax"), "images");
});

test("Referans istemi kopyalamayı, filigranı ve logoyu açıkça dışlar; format oranı belirler", () => {
  const { prompt, aspect } = buildReferencePrompt("A marketer reviewing ad results", ["palette", "angle", "kötü"], "social");
  assert.match(prompt, /color palette/);
  assert.match(prompt, /different camera angle/);
  assert.match(prompt, /Do not copy the reference pixel by pixel/);
  assert.match(prompt, /watermark, logo/);
  assert.equal(aspect, "9:16");
});

test("Kaynak bağlamı ve görsel durumu saklanır; yeni yazı kimlik alınca taşınır", () => {
  const map = new Map();
  const storage = { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) };
  saveSourceContext(null, { url: "https://kaynak.example/yazi", title: "T", text: "x".repeat(50_000), images: SOURCE_IMAGES, wordCount: 1800, provider: "jina" }, storage);
  saveVisualState(null, { items: [{ id: "v1" }] }, storage);
  assert.equal(loadSourceContext(null, storage).text.length, 40_000);
  adoptNewContext("post-1", storage);
  assert.equal(loadSourceContext(null, storage), null);
  assert.equal(loadSourceContext("post-1", storage).url, "https://kaynak.example/yazi");
  assert.deepEqual(loadVisualState("post-1", storage).items, [{ id: "v1" }]);
  assert.equal(saveSourceContext("p", { title: "url yok" }, storage), false);
});
