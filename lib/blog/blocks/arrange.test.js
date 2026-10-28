import assert from "node:assert/strict";
import { test } from "node:test";
import { createBlock } from "./model.js";
import { blockSummary, canSplit, dropBlocks, splitTextBlock } from "./arrange.js";

const para = (value, marks) => ({ type: "paragraph", content: [{ type: "text", text: value, ...(marks ? { marks } : {}) }] });
const textBlock = (...nodes) => createBlock("text", { doc: { type: "doc", content: nodes } });
const list = () => {
  const intro = textBlock(para("Bir"), para("İki", [{ type: "link", attrs: { href: "https://ornek.com" } }]), { type: "bulletList", content: [{ type: "listItem", content: [para("Madde")] }] });
  const h2 = createBlock("heading", { text: "Bölüm", level: "2" });
  const image = createBlock("image", {});
  return { intro, h2, image, blocks: [intro, h2, image] };
};

test("taşıma: aşağı ve yukarı; aynı yere bırakma etkisiz (null)", () => {
  const { intro, h2, image, blocks } = list();
  assert.deepEqual(dropBlocks(blocks, { kind: "move", id: intro.id }, { index: 3 }).map((b) => b.id), [h2.id, image.id, intro.id]);
  assert.deepEqual(dropBlocks(blocks, { kind: "move", id: image.id }, { index: 0 }).map((b) => b.id), [image.id, intro.id, h2.id]);
  assert.equal(dropBlocks(blocks, { kind: "move", id: h2.id }, { index: 1 }), null);
  assert.equal(dropBlocks(blocks, { kind: "move", id: h2.id }, { index: 2 }), null);
});

test("iki paragrafın arasına bırakma: metin bölünür, biçim/bağlantı/liste korunur, kimlikler tekil", () => {
  const { intro, image, blocks } = list();
  const out = dropBlocks(blocks, { kind: "move", id: image.id }, { blockId: intro.id, nodeIndex: 1 });
  assert.equal(out.length, 4);
  assert.equal(out[0].id, intro.id, "ilk parça kimliğini korur");
  assert.equal(out[1].id, image.id);
  assert.equal(out[2].type, "text");
  assert.notEqual(out[2].id, intro.id);
  assert.deepEqual(out[0].props.doc.content, [para("Bir")]);
  assert.equal(out[2].props.doc.content[0].content[0].marks[0].attrs.href, "https://ornek.com");
  assert.equal(out[2].props.doc.content[1].type, "bulletList");
  assert.equal(new Set(out.map((b) => b.id)).size, out.length);
});

test("yeni blok paragraf arasına ve sıraya; geçersiz hedefler reddedilir", () => {
  const { intro, h2, blocks } = list();
  const fresh = createBlock("quote", {});
  const between = dropBlocks(blocks, { kind: "new", block: fresh }, { blockId: intro.id, nodeIndex: 2 });
  assert.equal(between[1].id, fresh.id);
  assert.equal(between[0].props.doc.content.length, 2);
  assert.deepEqual(dropBlocks(blocks, { kind: "new", block: fresh }, { index: 1 }).map((b) => b.id).slice(0, 3), [intro.id, fresh.id, h2.id]);
  assert.equal(dropBlocks(blocks, { kind: "move", id: intro.id }, { blockId: intro.id, nodeIndex: 1 }), null, "kendi içine bırakılamaz");
  assert.equal(dropBlocks(blocks, { kind: "move", id: h2.id }, { blockId: intro.id, nodeIndex: 0 }), null, "sınırda bölme yok");
  assert.equal(dropBlocks(blocks, { kind: "move", id: h2.id }, { blockId: intro.id, nodeIndex: 3 }), null);
  assert.equal(dropBlocks(blocks, { kind: "move", id: "yok" }, { index: 0 }), null);
});

test("bölme yardımcıları ve kısa ad", () => {
  const { intro, h2 } = list();
  assert.equal(canSplit(intro, 1), true);
  assert.equal(canSplit(h2, 1), false);
  assert.equal(splitTextBlock(intro, 0), null);
  assert.equal(blockSummary(h2), "Bölüm");
  assert.match(blockSummary(intro), /^Bir İki Madde$/);
});
