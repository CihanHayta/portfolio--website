import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyFill,
  buildExpandPrompt,
  buildFillPrompt,
  buildFillSchema,
  closingIndex,
  copiedPassages,
  coverageReport,
  extraShareFor,
  slotBudgets,
  slotKey,
  slotsFromResponse,
  slotsToExpand,
  sourceOutline,
  targetWordsFor,
  templateSlots,
} from "@/lib/ai/templateFill";
import { contentText } from "@/lib/blog/blocks/model";
import { TEMPLATES, instantiateTemplate, templateByKey } from "@/lib/blog/blocks/templates";

const sum = (map) => [...map.values()].reduce((total, value) => total + value, 0);
const words = (n, seed = "kelime") => Array.from({ length: n }, (_, index) => `${seed}${index}`).join(" ");

test("sözcük bütçesi her şablonda hedefe eşittir ve editör sınırlarını aşmaz", () => {
  for (const template of TEMPLATES) {
    const slots = templateSlots(instantiateTemplate(template));
    for (const target of [600, 1000, 2400]) {
      const budgets = slotBudgets(slots, target);
      assert.ok(Math.abs(sum(budgets) - target) <= slots.length, `${template.key} ${target}: ${sum(budgets)}`);
      for (const slot of slots) {
        if (slot.kind === "steps") assert.ok(budgets.get(slot.id) <= 75 * (slot.count || 3), "adım açıklaması 600 karakteri aşmaz");
        if (slot.kind === "callout") assert.ok(budgets.get(slot.id) <= 80);
      }
    }
  }
});

test("hedef: seçilen uzunluk ya da kaynağa göre (600–2.500)", () => {
  assert.equal(targetWordsFor("medium"), 1000);
  assert.equal(targetWordsFor("short", [{ kind: "url", wordCount: 2400 }]), 600, "kullanıcının seçimi önceliklidir");
  assert.equal(targetWordsFor("auto", [{ kind: "url", wordCount: 2412 }]), 2400);
  assert.equal(targetWordsFor("auto", [{ kind: "url", wordCount: 300 }]), 600);
  assert.equal(targetWordsFor("auto", [{ kind: "url", wordCount: 9000 }]), 2500);
  assert.equal(targetWordsFor("auto", [{ kind: "text", text: words(3000) }]), 1000, "kullanıcı notu kaynak boyutu sayılmaz");
  assert.equal(targetWordsFor("auto", []), 1000);
});

test("kaynak başlık iskeleti çıkarılır ve isteme eklenir; ek bölüm payı hesaplanır", () => {
  const text = ["# Ana başlık", "Giriş.", "## Bir", "## İki", "### İki-a", "## Üç", "## Dört", "## Beş", "## Altı", "## Yedi", "##### Derin"].join("\n");
  assert.deepEqual(sourceOutline(text).map((heading) => heading.level), [1, 2, 2, 3, 2, 2, 2, 2, 2, 5]);
  const template = templateByKey("seoGuide");
  const slots = templateSlots(instantiateTemplate(template));
  const sources = [{ kind: "url", title: "K", text, wordCount: 2400 }];
  const share = extraShareFor(slots, sources);
  assert.ok(share > 0 && share <= 0.4);
  const prompt = buildFillPrompt({
    brief: { topic: "Konu", goal: "inform", tone: "friendly", length: "auto" },
    template,
    slots,
    links: [],
    categories: [],
    sources,
    targetWords: 2400,
    extraShare: share,
    images: [{ id: "img1", alt: "Grafik", section: "İki" }],
  });
  assert.match(prompt, /Kaynak 1 başlık listesi/);
  assert.match(prompt, /H2 İki\n  H3 İki-a/);
  assert.match(prompt, /extraSections/);
  assert.match(prompt, /- img1 — Grafik — İki/);
  assert.match(prompt, /coverage/);
});

test("şema: ek bölüm, kapsam ve görsel yerleşimi yalnızca istendiğinde; genişletmede SEO alanı yok", () => {
  const slots = templateSlots(instantiateTemplate(templateByKey("seoGuide")));
  const full = buildFillSchema(slots, { extra: true, coverage: true, images: true });
  assert.deepEqual(full.propertyOrdering.slice(0, 4), ["sections", "extraSections", "coverage", "imagePlacements"]);
  assert.equal(full.properties.coverage.items.properties.covered.type, "BOOLEAN");
  const plain = buildFillSchema(slots);
  assert.ok(!plain.properties.extraSections && !plain.properties.coverage);
  const expand = buildFillSchema(slots.slice(0, 2), { seo: false });
  assert.deepEqual(expand.propertyOrdering, ["sections"]);
});

test("ek bölümler kapanıştan (Sonuç/SSS/CTA) önce eklenir; şablon sırası korunur", () => {
  const blocks = instantiateTemplate(templateByKey("seoGuide"));
  const closing = closingIndex(blocks);
  assert.ok(closing > 0 && closing < blocks.length);
  const slots = templateSlots(blocks);
  const result = applyFill(blocks, [], {
    extraSections: [
      { level: "2", heading: "Kaynaktan ek konu", paragraphs: ["Birinci paragraf.", "İkinci paragraf."] },
      { level: "3", heading: "Alt konu", paragraphs: ["Metin."] },
      { level: "2", heading: "", paragraphs: ["başlıksız atlanır"] },
    ],
  });
  assert.equal(result.extra, 2);
  const types = result.blocks.map((block) => block.type);
  assert.equal(result.blocks.length, blocks.length + 4);
  assert.equal(result.blocks[closing].props.text, "Kaynaktan ek konu");
  assert.equal(result.blocks[closing + 2].props.level, "3");
  assert.deepEqual(types.slice(0, closing), blocks.slice(0, closing).map((block) => block.type));
  assert.ok(slots.every((slot) => result.idMap[slot.id]), "her slotun yeni kimliği bilinir");
});

test("genişletme yalnızca hedefin altında kalan slotları seçer ve mevcut metni isteme koyar", () => {
  const template = templateByKey("minimal");
  const blocks = instantiateTemplate(template);
  const slots = templateSlots(blocks);
  const response = {};
  const paragraphSlots = slots.filter((slot) => slot.kind === "paragraphs");
  // İlk paragraf slotu bütçesini doldurur, diğerleri kısa kalır.
  const budgets = slotBudgets(slots, 1000);
  paragraphSlots.forEach((slot, index) => {
    response[slotKey(slot)] = { paragraphs: [index === 0 ? words(budgets.get(slot.id)) : "Kısa paragraf."] };
  });
  for (const slot of slots.filter((item) => item.kind === "heading")) response[slotKey(slot)] = { text: "Başlık" };
  const filled = applyFill(blocks, slotsFromResponse({ sections: response }, slots));
  const items = slotsToExpand(filled.blocks, 1000);
  assert.equal(items.length, paragraphSlots.length - 1);
  assert.ok(items.every((item) => item.words < item.budget * 0.8));
  const prompt = buildExpandPrompt({ brief: { topic: "Konu", tone: "friendly" }, template, items, blocks: filled.blocks, missingTopics: ["Eksik konu"], links: [], sources: [] });
  assert.match(prompt, /şu an 2 sözcük; ≈\d+ sözcüklük YENİ paragraf ekle/);
  assert.match(prompt, /Mevcut metin: """Kısa paragraf\."""/);
  assert.match(prompt, /Eksik konu/);
});

test("kaynakla aynen örtüşen 8+ sözcüklük dizi sayılır", () => {
  const source = "Yerel arama sonuçlarında görünmek için işletme profilinizi eksiksiz ve güncel tutmanız gerekir.";
  assert.equal(copiedPassages("Önce şunu bilin: yerel arama sonuçlarında görünmek için işletme profilinizi eksiksiz tutun.", source), 1);
  assert.equal(copiedPassages("İşletme profili güncel olmalı; yoksa yerel aramada geride kalırsınız.", source), 0);
});

test("kapsam raporu model beyanını kullanır; Türkçe kaynakta anahtar sözcükle denetler", () => {
  const sourceText = "## Google İşletme Profili kurulumu\nMetin ve bir de bu için çok daha gibi.\n## Yorum yönetimi\nMetin ve bir için.";
  const report = coverageReport({
    modelCoverage: [
      { topic: "Google İşletme Profili kurulumu", covered: true, note: "" },
      { topic: "Yorum yönetimi", covered: true, note: "" },
      { topic: "Yerel bağlantılar", covered: false, note: "Kaynakta ayrıntı yok" },
    ],
    sourceText,
    draftText: "Google işletme profilinizin kurulumu şöyle yapılır.",
  });
  assert.equal(report.method, "model+anahtar-sözcük");
  assert.equal(report.covered, 2);
  assert.equal(report.total, 3);
  assert.match(report.items[1].note, /bulunamadı/);
  assert.equal(report.items[0].note, "");
  const english = coverageReport({ modelCoverage: [{ topic: "Local SEO", covered: true }], sourceText: "## Local SEO\nThe guide is about the topic." });
  assert.equal(english.method, "model");
});

test("şablon doldurma sonrası metin kaybolmaz: tüm slot paragrafları taslakta", () => {
  const blocks = instantiateTemplate(templateByKey("seoGuide"));
  const slots = templateSlots(blocks);
  const response = {};
  for (const slot of slots) {
    if (slot.kind === "paragraphs") response[slotKey(slot)] = { paragraphs: Array.from({ length: 10 }, (_, index) => `${words(70, `p${index}x`)}.`) };
  }
  const filled = applyFill(blocks, slotsFromResponse({ sections: response }, slots));
  const text = contentText({ type: "blocks", version: 1, blocks: filled.blocks });
  const paragraphs = slots.filter((slot) => slot.kind === "paragraphs").length;
  assert.ok((text.match(/p9x69/g) ?? []).length === paragraphs, "10 paragrafın sonuncusu da korunur");
});

test("genişletmede blok kimlikleri korunur", () => {
  const blocks = instantiateTemplate(templateByKey("minimal"));
  const slots = templateSlots(blocks);
  const target = slots.find((slot) => slot.kind === "paragraphs");
  const result = applyFill(blocks, slotsFromResponse({ sections: { [slotKey(target)]: { paragraphs: ["Yeni metin."] } } }, [target]), { keepIds: true });
  assert.deepEqual(result.blocks.map((block) => block.id), blocks.map((block) => block.id));
  assert.match(contentText({ type: "blocks", version: 1, blocks: result.blocks }), /Yeni metin\./);
});

test("genişletmede paragraf slotları yeniden yazılmaz; yeni paragraflar sona eklenir", () => {
  const blocks = instantiateTemplate(templateByKey("minimal"));
  const slots = templateSlots(blocks);
  const target = slots.find((slot) => slot.kind === "paragraphs");
  const schema = buildFillSchema([target], { seo: false, append: true });
  assert.deepEqual(Object.keys(schema.properties.sections.properties[slotKey(target)].properties), ["append"]);
  const before = blocks.find((block) => block.id === target.id).props.doc.content.length;
  const result = applyFill(blocks, slotsFromResponse({ sections: { [slotKey(target)]: { append: ["Ek paragraf bir.", "Ek paragraf iki."] } } }, [target]), { keepIds: true });
  const doc = result.blocks.find((block) => block.id === target.id).props.doc;
  assert.equal(doc.content.length, before + 2, "mevcut paragraflar korunur, yeniler eklenir");
  assert.match(contentText({ type: "blocks", version: 1, blocks: result.blocks }), /Ek paragraf iki\./);
});

test("arşivde örtüşen yazılar isteme eklenir; farklı açı seçiliyse odak yazı belirtilir", () => {
  const template = templateByKey("seoGuide");
  const slots = templateSlots(instantiateTemplate(template));
  const base = { brief: { topic: "Meta reklam bütçesi", goal: "inform", tone: "friendly", length: "medium" }, template, slots, links: [], categories: [] };
  const related = [{ title: "Meta Reklam Bütçesi Nasıl Belirlenir?", covered: ["Günlük bütçe"], gaps: ["Lookalike kitleler"], focus: true }];
  const plain = buildFillPrompt({ ...base, related });
  assert.match(plain, /Blog arşivimizde bu konuyla örtüşen yazılar var/);
  assert.match(plain, /zaten işlediği konular: Günlük bütçe/);
  assert.match(plain, /eksik kaldığı konular: Lookalike kitleler/);
  assert.doesNotMatch(plain, /FARKLI AÇI/);
  assert.match(buildFillPrompt({ ...base, related, angle: true }), /FARKLI AÇI: “Meta Reklam Bütçesi Nasıl Belirlenir\?”/);
  assert.doesNotMatch(buildFillPrompt(base), /Blog arşivimizde/);
});
