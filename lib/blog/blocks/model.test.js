import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ornek.supabase.co";
const MEDIA = "https://ornek.supabase.co/storage/v1/object/public/blog-media/2026/10/a.webp";

const model = await import("./model.js");
const { PALETTE, PALETTE_ITEMS } = await import("./palette.js");
const { TEMPLATES } = await import("./templates.js");
const { BLOCKS } = await import("./registry.js");
const { createBlock, sanitizeContent, sanitizeBlocks, legacyToBlocks, contentText, contentHeadings, faqSchemaItems, videoEmbed, cloneBlock } = model;

test("her palet kartı geçerli bir blok üretir ve doğrulamadan aynen geçer", () => {
  for (const item of PALETTE.flatMap((group) => group.items)) {
    const block = createBlock(item.type, item.props);
    const [clean] = sanitizeBlocks([block]);
    assert.equal(clean.type, item.type, item.key);
    assert.deepEqual(sanitizeBlocks([clean])[0].props, clean.props, `${item.key} kararlı değil`);
  }
});

test("her blok türünün palette bir kartı var", () => {
  const types = new Set(Object.values(PALETTE_ITEMS).map((item) => item.type));
  for (const type of Object.keys(BLOCKS)) assert.ok(types.has(type), type);
});

test("her şablon yalnızca geçerli bloklar üretir", () => {
  assert.equal(TEMPLATES.length, 10);
  for (const template of TEMPLATES) {
    const blocks = template.blocks().map((b) => createBlock(b.type, b.props));
    assert.equal(sanitizeBlocks(blocks).length, blocks.length, template.key);
    assert.ok(blocks.length >= 4, template.key);
  }
});

test("bilinmeyen blok türleri ve alanlar atılır", () => {
  const { blocks } = sanitizeContent({
    type: "blocks",
    blocks: [
      { id: "abc123", type: "script", props: { html: "<script>alert(1)</script>" } },
      { id: "abc124", type: "heading", props: { text: "Merhaba", level: "9", onclick: "x()", align: "justify" } },
      null,
      "metin",
    ],
  });
  assert.equal(blocks.length, 1);
  assert.deepEqual(Object.keys(blocks[0].props).sort(), ["align", "href", "level", "spacing", "text"]);
  assert.equal(blocks[0].props.level, "2");
  assert.equal(blocks[0].props.align, "left");
});

test("tehlikeli bağlantılar ve dış görseller reddedilir", () => {
  const [button, image, hero, video] = sanitizeBlocks([
    { type: "button", props: { text: "Tıkla", href: "javascript:alert(1)" } },
    { type: "image", props: { image: { url: "https://kotu.example/x.png", alt: "x" }, href: "data:text/html,x" } },
    { type: "hero", props: { title: "Kapak", image: { url: MEDIA, alt: "Deniz", width: 1600, height: 900 }, buttonHref: "/blog" } },
    { type: "video", props: { url: "https://kotu.example/embed/1" } },
  ]);
  assert.equal(button.props.href, "");
  assert.equal(image.props.image, null);
  assert.equal(image.props.href, "");
  assert.deepEqual(hero.props.image, { url: MEDIA, alt: "Deniz", width: 1600, height: 900 });
  assert.equal(hero.props.buttonHref, "/blog");
  assert.equal(video.props.url, "");
});

test("video yalnızca YouTube ve Vimeo için gömme adresi üretir", () => {
  assert.equal(videoEmbed("https://youtu.be/dQw4w9WgXcQ").src, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(videoEmbed("https://vimeo.com/123456789").provider, "vimeo");
  assert.equal(videoEmbed("https://example.com/video.mp4"), null);
  assert.equal(videoEmbed('"><script>alert(1)</script>'), null);
});

test("zengin metinden başlık, görsel ve bilinmeyen düğümler çıkarılır", () => {
  const [block] = sanitizeBlocks([{
    type: "text",
    props: { doc: { type: "doc", content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Başlık" }] },
      { type: "paragraph", content: [{ type: "text", text: "Metin", marks: [{ type: "link", attrs: { href: "javascript:x" } }, { type: "bold" }] }] },
      { type: "iframe", attrs: { src: "https://kotu.example" } },
    ] } },
  }]);
  assert.deepEqual(block.props.doc.content.map((n) => n.type), ["paragraph"]);
  assert.deepEqual(block.props.doc.content[0].content[0].marks, [{ type: "bold" }]);
});

test("liste alanları sınırlanır, öğelere kimlik verilir, asgari sayı korunur", () => {
  const [gallery, columns] = sanitizeBlocks([
    { type: "gallery", props: { items: Array.from({ length: 40 }, () => ({ image: null, title: "x" })) } },
    { type: "columns", props: { columns: [] } },
  ]);
  assert.equal(gallery.props.items.length, 12);
  assert.match(gallery.props.items[0].id, /^[a-z0-9]{6,16}$/);
  assert.equal(columns.props.columns.length, 2);
});

test("aynı kimlikli bloklar ayrıştırılır, kopyalar yeni kimlik alır", () => {
  const a = createBlock("faq", PALETTE_ITEMS.faq.props);
  const copy = cloneBlock(sanitizeBlocks([a])[0]);
  assert.notEqual(copy.id, a.id);
  const [x, y] = sanitizeBlocks([a, { ...a }]);
  assert.notEqual(x.id, y.id);
});

test("eski Tiptap belgesi veri kaybı olmadan bloklara çevrilir", () => {
  const legacy = { type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "Giriş" }] },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Birinci bölüm" }] },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Madde" }] }] }] },
    { type: "image", attrs: { src: MEDIA, alt: "Görsel", caption: "Açıklama", width: 800, height: 600, size: "md", align: "left" } },
    { type: "horizontalRule" },
    { type: "youtube", attrs: { src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } },
    { type: "codeBlock", attrs: { language: "js" }, content: [{ type: "text", text: "const a = 1;" }] },
  ] };
  const blocks = legacyToBlocks(legacy);
  assert.deepEqual(blocks.map((b) => b.type), ["text", "heading", "text", "image", "divider", "video", "text"]);
  assert.equal(blocks[1].props.level, "3");
  assert.equal(blocks[3].props.image.alt, "Görsel");
  assert.equal(blocks[3].props.caption, "Açıklama");
  const text = contentText(sanitizeContent(legacy));
  for (const word of ["Giriş", "Birinci bölüm", "Madde", "const a = 1;"]) assert.ok(text.includes(word), word);
  assert.deepEqual(legacyToBlocks({ type: "doc", content: [{ type: "paragraph" }] }), []);
});

test("başlık kimlikleri benzersizdir; eski biçim de desteklenir", () => {
  const content = sanitizeContent({ type: "blocks", blocks: [
    { type: "heading", props: { text: "Sonuç", level: "2" } },
    { type: "heading", props: { text: "Sonuç", level: "3" } },
    { type: "heading", props: { text: "  ", level: "2" } },
  ] });
  assert.deepEqual(contentHeadings(content).map((x) => [x.id, x.level]), [["sonuc", 1], ["sonuc-2", 2]]);
  const legacy = { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Eski" }] }] };
  assert.deepEqual(contentHeadings(legacy), [{ id: "eski", label: "Eski", level: 1 }]);
});

test("FAQ yapılandırılmış verisi yalnızca işaretli ve dolu sorulardan üretilir", () => {
  const content = sanitizeContent({ type: "blocks", blocks: [
    { type: "faq", props: { schema: true, items: [{ question: "Soru?", answer: "Cevap." }, { question: "", answer: "Boş" }] } },
    { type: "faq", props: { schema: false, items: [{ question: "Gizli?", answer: "Evet." }] } },
  ] });
  assert.deepEqual(faqSchemaItems(content), [{ question: "Soru?", answer: "Cevap." }]);
});

test("200 bloktan fazlası kesilir", () => {
  const many = Array.from({ length: 260 }, () => ({ type: "divider", props: {} }));
  assert.equal(sanitizeBlocks(many).length, 200);
});
