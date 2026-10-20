import assert from "node:assert/strict";
import { test } from "node:test";
import { applySuggestion } from "./applySuggestions.js";

const heading = (id, text, level = "2") => ({ id, type: "heading", props: { level, text } });
const text = (id) => ({ id, type: "text", props: { doc: { type: "doc", content: [] } } });
const BLOCKS = [heading("h1", "Giriş"), text("t1"), heading("h2", "Bütçe"), text("t2"), heading("h3", "Alt", "3"), text("t3"), heading("h4", "Sonuç"), text("t4"), { id: "c", type: "cta", props: {} }];

test("öneri ilgili başlığın bölümünün sonuna (alt başlıklardan sonra) eklenir", () => {
  const result = applySuggestion(BLOCKS, { afterHeading: "Bütçe", heading: "Yeni alt konu", level: "3", paragraphs: ["Yeni paragraf."] });
  assert.equal(result.at, 6, "Sonuç başlığından hemen önce");
  assert.deepEqual(result.blocks.slice(6, 8).map((block) => block.type), ["heading", "text"]);
  assert.equal(result.blocks[6].props.level, "3");
  assert.equal(result.blocks.length, BLOCKS.length + 2);
  assert.deepEqual(BLOCKS.map((block) => block.id), ["h1", "t1", "h2", "t2", "h3", "t3", "h4", "t4", "c"], "girdi değişmez");
});

test("başlıksız öneri yalnızca paragraf ekler; bilinmeyen başlıkta yazının sonuna, CTA'dan önce eklenir", () => {
  const plain = applySuggestion(BLOCKS, { afterHeading: "Alt", heading: "", paragraphs: ["Ek."] });
  assert.equal(plain.at, 6);
  assert.equal(plain.added.length, 1);
  const end = applySuggestion(BLOCKS, { afterHeading: "", heading: "Ek bölüm", level: "2", paragraphs: ["Son."] });
  assert.equal(end.at, 8);
  assert.equal(end.blocks.at(-1).type, "cta");
});
