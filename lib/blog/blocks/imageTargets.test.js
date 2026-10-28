import assert from "node:assert/strict";
import { test } from "node:test";
import { createBlock, richFromText } from "./model.js";
import { imageTargets, placeAtTargets, suggestTarget } from "./imageTargets.js";

const draft = () => {
  const intro = createBlock("text", { doc: richFromText("Giriş paragrafı") });
  const h2a = createBlock("heading", { text: "Reklam bütçesi nasıl planlanır", level: "2" });
  const p1 = createBlock("text", { doc: richFromText("Bölüm 1") });
  const h3 = createBlock("heading", { text: "Kanal seçimi ve hedefleme", level: "3" });
  const p2 = createBlock("text", { doc: richFromText("Bölüm 2") });
  return { blocks: [intro, h2a, p1, h3, p2], intro, h2a, p1, h3, p2 };
};
const img = (name, target) => ({ url: `https://x.supabase.co/storage/v1/object/public/blog-media/${name}.webp`, alt: name, width: 800, height: 450, target });

test("hedef listesi: kapak, giriş, H2 ve H3 başlıkları, galeri, son", () => {
  const { blocks, h2a, h3 } = draft();
  const values = imageTargets(blocks).map((item) => item.value);
  assert.deepEqual(values, ["cover", "intro", `block:${h2a.id}`, `block:${h3.id}`, "gallery", "end"]);
  assert.match(imageTargets(blocks)[3].label, /^H3 · Kanal seçimi/);
});

test("görsel seçilen başlığın hemen altına; aynı hedefe ikinci görsel sırayı korur; mevcut bloklar değişmez", () => {
  const { blocks, h2a, p1 } = draft();
  const out = placeAtTargets(blocks, [img("a", `block:${h2a.id}`), img("b", `block:${h2a.id}`)]);
  assert.equal(out.placed, 2);
  const index = out.blocks.findIndex((block) => block.id === h2a.id);
  assert.equal(out.blocks[index + 1].props.image.alt, "a");
  assert.equal(out.blocks[index + 2].props.image.alt, "b");
  assert.equal(out.blocks[index + 3].id, p1.id, "bölüm metni kayıpsız aşağı kaydı");
  for (const original of blocks) assert.ok(out.blocks.some((block) => block === original), "eski blok nesnesi aynen duruyor");
});

test("kapak bloklara girmez; giriş ilk başlıktan önce; galeri ve son", () => {
  const { blocks, h2a } = draft();
  const out = placeAtTargets(blocks, [img("kapak", "cover"), img("giris", "intro"), img("g1", "gallery"), img("g2", "gallery"), img("son", "end")]);
  assert.equal(out.cover.alt, "kapak");
  const headingIndex = out.blocks.findIndex((block) => block.id === h2a.id);
  assert.equal(out.blocks[headingIndex - 1].props.image.alt, "giris");
  const gallery = out.blocks.find((block) => block.type === "gallery");
  assert.deepEqual(gallery.props.items.map((item) => item.image.alt), ["g1", "g2"]);
  assert.equal(out.blocks.at(-2).type, "gallery");
  assert.equal(out.blocks.at(-1).props.image.alt, "son");
  assert.equal(out.placed, 4, "kapak sayılmaz; 4 görsel yazıya");
});

test("bulunamayan hedef sessizce atılmaz: unplaced olarak döner", () => {
  const { blocks } = draft();
  const out = placeAtTargets(blocks, [img("kayip", "block:yok-boyle-blok"), img("hedefsiz", null)]);
  assert.equal(out.placed, 0);
  assert.deepEqual(out.unplaced.map((item) => item.alt), ["kayip", "hedefsiz"]);
  assert.equal(out.blocks.length, blocks.length);
});

test("öneri: kaynak bölüm adına en benzer başlık; og görseli kapak", () => {
  const { blocks, h3 } = draft();
  assert.equal(suggestTarget(blocks, { section: "Doğru kanal seçimi nasıl yapılır" }), `block:${h3.id}`);
  assert.equal(suggestTarget(blocks, { role: "og" }), "cover");
  assert.notEqual(suggestTarget(blocks, { role: "og" }, { coverTaken: true }), "cover");
});

test("şablondaki boş görsel alanı hedef olur ve yerinde doldurulur; ikinci görsel altına eklenir", () => {
  const { blocks, h2a } = draft();
  const slot = createBlock("image", {});
  const withSlot = [...blocks.slice(0, 3), slot, ...blocks.slice(3)];
  const targets = imageTargets(withSlot);
  const entry = targets.find((item) => item.value === `block:${slot.id}`);
  assert.match(entry.label, /^Boş görsel alanı · Reklam bütçesi/);
  assert.equal(suggestTarget(withSlot, { section: "alakasız" }, { used: new Set() }), `block:${slot.id}`);
  const out = placeAtTargets(withSlot, [img("bir", `block:${slot.id}`), img("iki", `block:${slot.id}`)]);
  const index = out.blocks.findIndex((block) => block.id === slot.id);
  assert.equal(out.blocks[index].props.image.alt, "bir", "boş alan dolduruldu");
  assert.equal(out.blocks[index + 1].props.image.alt, "iki");
  assert.equal(out.placed, 2);
  assert.ok(out.blocks.some((block) => block.id === h2a.id));
});
