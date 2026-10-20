import { countWords, docText, isMediaUrl, nodeText, sanitizeDoc } from "../blog/content.js";
import { SLUG_PATTERN, slugify } from "../blog/slug.js";
import { docImages } from "./tiptap.js";

// Üretilen yazının yayın öncesi kalite denetimi. Yapay zekâ çağrısı yapmaz;
// tamamı deterministiktir ve kullanıcı alanları düzenledikçe yeniden çalışır.
// level: "ok" | "warn" (yayına engel değil) | "error" (yayına engel).

const lower = (value) => String(value ?? "").toLocaleLowerCase("tr");
// Anahtar kelime karşılaştırması Türkçe karakter farkına takılmaz ("ozellik" = "özellik").
const fold = (value) => slugify(value, 400).replace(/-/g, " ");
const words = (value) => lower(value).match(/[\p{L}\p{N}]+/gu) ?? [];

function shingles(tokens, size) {
  const set = new Set();
  for (let index = 0; index + size <= tokens.length; index += 1) {
    set.add(tokens.slice(index, index + size).join(" "));
  }
  return set;
}

// Kaynakta geçmeyen sayılar: uydurma istatistik riskinin en somut işareti.
export function unsupportedNumbers(articleText, sourceText) {
  const pattern = /\d+(?:[.,]\d+)*/g;
  const normalize = (value) => value.replace(/[.,]/g, "");
  const inSource = new Set((sourceText.match(pattern) ?? []).map(normalize));
  const found = new Set();
  for (const match of articleText.match(pattern) ?? []) {
    const value = normalize(match);
    // Tek haneli sayılar ("3 adım") olgu iddiası sayılmaz.
    if (value.length < 2 || inSource.has(value)) continue;
    found.add(match);
  }
  return [...found];
}

export function repeatedSentences(text) {
  const seen = new Map();
  for (const sentence of text.split(/(?<=[.!?…])\s+|\n+/)) {
    const key = words(sentence).join(" ");
    if (key.split(" ").length < 6) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.values()].filter((count) => count > 1).length;
}

export function runQualityChecks({ fields, doc, sourceText = "", cover, plannedInlineCount = 0, externalResearch = false }) {
  const checks = [];
  const add = (id, level, label, detail = "") => checks.push({ id, level, label, detail });

  const text = docText(doc);
  const wordCount = countWords(text);
  const top = doc?.content ?? [];
  const headings = top.filter((node) => node.type === "heading");
  // Belgede seviye 1 sayfadaki <h2>, seviye 2 <h3> olarak çizilir.
  const h2Count = headings.filter((node) => node.attrs?.level === 1).length;

  // --- Başlık yapısı ---
  const title = fields.title.trim();
  if (!title) add("title", "error", "H1 başlığı boş");
  else if (title.length > 160) add("title", "error", "H1 başlığı 160 karakteri aşıyor");
  else if (title.length > 70) add("title", "warn", "H1 başlığı uzun", `${title.length} karakter; 70 ve altı önerilir.`);
  else add("title", "ok", "H1 başlığı uygun", `${title.length} karakter`);

  const firstHeading = headings[0];
  const h3BeforeH2 = firstHeading && firstHeading.attrs?.level > 1;
  const emptyHeading = headings.some((node) => !nodeText(node).trim());
  const headingLabels = headings.map((node) => lower(nodeText(node).trim()));
  const duplicateHeading = new Set(headingLabels).size !== headingLabels.length;
  if (h3BeforeH2) add("headings", "warn", "İlk alt başlık H3; önce bir H2 gelmeli");
  else if (emptyHeading) add("headings", "warn", "Boş başlık var");
  else if (duplicateHeading) add("headings", "warn", "Aynı başlık birden fazla kez kullanılmış");
  else if (h2Count < 2) add("headings", "warn", "Başlık yapısı zayıf", `${h2Count} adet H2 var; en az 2 önerilir.`);
  else add("headings", "ok", "Başlık hiyerarşisi tutarlı", `${h2Count} H2, ${headings.length - h2Count} alt başlık`);

  // --- SEO alanları ---
  const seoTitle = fields.seoTitle.trim();
  if (!seoTitle) add("seoTitle", "warn", "SEO başlığı boş", "Boş bırakılırsa H1 başlığı kullanılır.");
  else if (seoTitle.length > 70) add("seoTitle", "error", "SEO başlığı 70 karakteri aşıyor");
  else if (seoTitle.length > 60) add("seoTitle", "warn", "SEO başlığı arama sonucunda kesilebilir", `${seoTitle.length} karakter; 60 ve altı önerilir.`);
  else add("seoTitle", "ok", "SEO başlığı uygun", `${seoTitle.length} karakter`);

  const description = fields.seoDescription.trim();
  if (!description) add("seoDescription", "warn", "Meta açıklaması boş", "Boş bırakılırsa özet kullanılır.");
  else if (description.length > 160) add("seoDescription", "error", "Meta açıklaması 160 karakteri aşıyor");
  else if (description.length < 110) add("seoDescription", "warn", "Meta açıklaması kısa", `${description.length} karakter; 120-160 önerilir.`);
  else add("seoDescription", "ok", "Meta açıklaması uygun", `${description.length} karakter`);

  const slug = fields.slug.trim();
  if (!SLUG_PATTERN.test(slug)) add("slug", "error", "Kalıcı bağlantı (slug) geçersiz", "Küçük harf, rakam ve kısa çizgi kullan.");
  else if (/^taslak-[0-9a-f]{8}$/.test(slug)) add("slug", "error", "Kalıcı bağlantı belirlenmemiş");
  else if (slug.length > 75) add("slug", "warn", "Kalıcı bağlantı uzun", `${slug.length} karakter`);
  else add("slug", "ok", "Kalıcı bağlantı uygun", `/blog/${slug}`);

  if (!fields.excerpt.trim()) add("excerpt", "warn", "Özet boş", "Blog listesinde ve paylaşımlarda görünür.");
  else if (fields.excerpt.length > 200) add("excerpt", "error", "Özet 200 karakteri aşıyor");
  else add("excerpt", "ok", "Özet uygun", `${fields.excerpt.trim().length} karakter`);

  const keyword = fold(fields.primaryKeyword ?? "");
  if (keyword) {
    const firstParagraph = top.find((node) => node.type === "paragraph");
    const missing = [];
    if (!fold(seoTitle || title).includes(keyword)) missing.push("SEO başlığı");
    if (!fold(description).includes(keyword)) missing.push("meta açıklaması");
    if (!fold(firstParagraph ? nodeText(firstParagraph) : "").includes(keyword)) missing.push("giriş paragrafı");
    if (missing.length) add("keyword", "warn", "Ana anahtar kelime bazı alanlarda geçmiyor", `“${fields.primaryKeyword}” şurada yok: ${missing.join(", ")}.`);
    else add("keyword", "ok", "Ana anahtar kelime başlık, açıklama ve girişte geçiyor", `“${fields.primaryKeyword}”`);
  }

  // --- Metin ---
  if (!text.trim()) add("length", "error", "Yazı içeriği boş");
  else if (wordCount < 400) add("length", "warn", "Yazı kısa", `${wordCount} sözcük`);
  else add("length", "ok", "Yazı uzunluğu yeterli", `${wordCount} sözcük`);

  const paragraphs = top.filter((node) => node.type === "paragraph").map((node) => words(nodeText(node)).join(" ")).filter((value) => value.split(" ").length >= 6);
  const duplicateParagraphs = paragraphs.length - new Set(paragraphs).size;
  const repeats = repeatedSentences(text);
  if (duplicateParagraphs > 0) add("repetition", "warn", "Aynı paragraf birden fazla kez geçiyor", `${duplicateParagraphs} tekrar`);
  else if (repeats > 0) add("repetition", "warn", "Tekrarlanan cümleler var", `${repeats} cümle birden fazla kez geçiyor.`);
  else add("repetition", "ok", "Metin tekrarı bulunmadı");

  // --- Kaynakla tutarlılık ---
  if (sourceText.trim()) {
    const articleTokens = words(text);
    const articleShingles = shingles(articleTokens, 7);
    const sourceShingles = shingles(words(sourceText), 7);
    let shared = 0;
    for (const item of articleShingles) if (sourceShingles.has(item)) shared += 1;
    const ratio = articleShingles.size ? shared / articleShingles.size : 0;
    if (ratio > 0.12) add("originality", "warn", "Kaynakla birebir örtüşen ifadeler fazla", `7 sözcüklük dizilerin %${Math.round(ratio * 100)} kadarı kaynakta da geçiyor.`);
    else add("originality", "ok", "Kaynak birebir kopyalanmamış", `Birebir örtüşme %${Math.round(ratio * 100)}`);

    const numbers = unsupportedNumbers(text, sourceText);
    if (numbers.length) add("facts", "warn", "Kaynakta geçmeyen sayılar var — yayınlamadan önce doğrula", numbers.slice(0, 12).join(", "));
    else add("facts", "ok", "Yazıdaki bütün sayılar kaynakta da geçiyor");
  }
  if (!externalResearch) {
    add("research", "info", "Harici araştırma yapılmadı", "İçerik yalnızca verdiğin kaynak sayfaya dayanıyor; başka kaynakla doğrulanmadı.");
  }

  // --- Görseller ve erişilebilirlik ---
  if (!cover?.id) add("cover", "error", "Kapak görseli yok");
  else if (!fields.coverAlt.trim()) add("cover", "error", "Kapak görselinin alt metni boş");
  else add("cover", "ok", "Kapak görseli ve alt metni hazır");

  const images = docImages(doc);
  const missingAlt = images.filter((node) => !String(node.attrs?.alt ?? "").trim()).length;
  const foreign = images.filter((node) => !isMediaUrl(node.attrs?.src)).length;
  if (foreign > 0) add("images", "error", "Medya kütüphanesinde olmayan görsel var", `${foreign} görsel`);
  else if (missingAlt > 0) add("images", "error", "Alt metni olmayan yazı içi görsel var", `${missingAlt} görsel`);
  else if (images.length < plannedInlineCount) add("images", "warn", "Planlanan görsellerin bir kısmı yazıda yok", `${images.length}/${plannedInlineCount} görsel yerleşti.`);
  else add("images", "ok", "Yazı içi görseller yerleşti, alt metinleri tam", `${images.length} görsel`);

  // --- Editör veri yapısı ---
  const clean = sanitizeDoc(doc);
  if (JSON.stringify(clean) !== JSON.stringify(doc)) add("structure", "error", "İçerik editörün tanımadığı öğeler içeriyor");
  else if (JSON.stringify(doc).length > 600_000) add("structure", "error", "İçerik çok uzun");
  else add("structure", "ok", "Tiptap veri yapısı geçerli", `${top.length} blok`);

  return {
    checks,
    wordCount,
    hasErrors: checks.some((check) => check.level === "error"),
    warnings: checks.filter((check) => check.level === "warn").length,
  };
}
