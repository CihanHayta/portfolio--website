import assert from "node:assert/strict";
import { test } from "node:test";
import { createBlock } from "./model.js";
import { headingOverlap, imageSections, verifiedSectionMap } from "./imageSections.js";

const h = (text, level = "2") => createBlock("heading", { text, level });
const p = () => createBlock("text", {});
const img = (url) => createBlock("image", { image: { url, alt: "a" } });

test("bölümler gerçek H2 sırasıyla; H3 alt hedef; görseller kendi bölümünde", () => {
  const b1 = h("Reklam bütçesi nasıl planlanır?");
  const sub = h("Test bütçesi", "3");
  const b2 = h("Ölçüm ve raporlama");
  const blocks = [p(), img("https://x/intro.webp"), b1, p(), sub, img("https://x/1.webp"), b2, p()];
  const out = imageSections(blocks);
  assert.equal(out.intro.placed.length, 1);
  assert.deepEqual(out.sections.map((s) => [s.number, s.title]), [[1, "Reklam bütçesi nasıl planlanır?"], [2, "Ölçüm ve raporlama"]]);
  assert.equal(out.sections[0].placed[0].url, "https://x/1.webp");
  assert.equal(out.sections[0].subheadings[0].title, "Test bütçesi");
  assert.equal(out.sections[1].placed.length, 0, "görsel yoksa başka bölümün görseli gösterilmez");
  assert.equal(out.counts.empty, 1);
});

test("kaynak görseli: birebir başlık eşlemesi, kelime eşleşmesi, doğrulanamayan ve kapak", () => {
  const b1 = h("Küçük işletmeler için test bütçesi");
  const b2 = h("Sonuçları ölçmek");
  const sources = [
    { id: "s-og", role: "og", section: "" },
    { id: "s-1", section: "Test budget for small businesses" },
    { id: "s-2", section: "Küçük işletmelerde test bütçesi" },
    { id: "s-3", section: "Hakkımızda" },
    { id: "s-4", section: "" },
  ];
  const out = imageSections([b1, b2], { sources, sectionMap: { [b1.id]: "Test budget for small businesses" } });
  assert.deepEqual(out.cover, { id: "s-og", reason: "og" });
  assert.deepEqual(out.sections[0].matches.map((m) => [m.id, m.reason]), [["s-1", "map"], ["s-2", "words"]]);
  assert.deepEqual(out.unmatched.map((m) => m.id), ["s-3", "s-4"]);
  assert.equal(out.sections[1].matches.length, 0);
});

test("kelime örtüşmesi tek ortak kelimeyle eşleşme saymaz", () => {
  assert.equal(headingOverlap("Bütçe", "Bütçe planı"), 0);
  assert.ok(headingOverlap("Meta reklam bütçesi", "Meta reklam bütçesi nasıl dağıtılır") >= 0.6);
});

test("AI eşlemesi yalnızca kaynakta gerçekten geçen başlıkları tutar", () => {
  const out = verifiedSectionMap({ abcdef1234: "Test Budget", zzzzzz9999: "Uydurma başlık", "bad id": "Test Budget" }, ["Intro", "test budget"]);
  assert.deepEqual(out, { abcdef1234: "test budget" });
});
