import assert from "node:assert/strict";
import { test } from "node:test";
import { contentHeadings, contentText, sanitizeBlocks } from "@/lib/blog/blocks/model";
import { BLOCKS } from "@/lib/blog/blocks/registry";
import {
  PLACEHOLDER_TEXTS,
  TEMPLATES,
  TEMPLATE_CATEGORIES,
  findPlaceholders,
  instantiateTemplate,
  templateByKey,
  templateOutline,
} from "@/lib/blog/blocks/templates";

const REQUIRED = ["seoGuide", "steps", "listicle", "comparison", "problemSolution", "faq", "serviceGuide", "sourceResearch"];
const asContent = (blocks) => ({ type: "blocks", version: 1, blocks });

test("istenen sekiz şablon tanımlı ve anahtarlar benzersiz", () => {
  for (const key of REQUIRED) assert.ok(templateByKey(key), `${key} eksik`);
  assert.equal(new Set(TEMPLATES.map((t) => t.key)).size, TEMPLATES.length);
  const categories = new Set(TEMPLATE_CATEGORIES.map(([key]) => key));
  for (const template of TEMPLATES) {
    assert.ok(categories.has(template.category), `${template.key} kategorisi tanımsız`);
    for (const field of ["label", "description", "useCase", "ai"]) assert.ok(template[field]?.length > 5, `${template.key}.${field}`);
  }
});

test("her şablon geçerli, sunucu doğrulamasından kayıpsız geçen bloklar üretir", () => {
  for (const template of TEMPLATES) {
    const blocks = instantiateTemplate(template);
    assert.ok(blocks.length > 0);
    for (const block of blocks) assert.ok(BLOCKS[block.type], `${template.key}: bilinmeyen blok ${block.type}`);
    const clean = sanitizeBlocks(blocks);
    assert.equal(clean.length, blocks.length, `${template.key}: doğrulamada blok kayboldu`);
    assert.deepEqual(clean.map((b) => b.type), blocks.map((b) => b.type));
  }
});

test("her uygulamada yeni kimlikler üretilir (iki taslak aynı blok kimliğini paylaşmaz)", () => {
  const a = instantiateTemplate(templateByKey("seoGuide")).map((b) => b.id);
  const b = instantiateTemplate(templateByKey("seoGuide")).map((b) => b.id);
  assert.equal(a.filter((id) => b.includes(id)).length, 0);
});

test("başlık hiyerarşisi: içerikte H1 yok, ilk başlık H2, H3 bir H2'den sonra gelir", () => {
  for (const template of TEMPLATES) {
    const outline = templateOutline(template);
    if (outline.length === 0) continue;
    assert.equal(outline[0].level, 2, `${template.key}: ilk başlık H2 olmalı`);
    for (const heading of outline) assert.ok(heading.level === 2 || heading.level === 3, `${template.key}: H${heading.level}`);
    const headings = contentHeadings(asContent(instantiateTemplate(template)));
    assert.equal(headings.length, outline.length);
  }
});

test("kapak bloğu sayfada olmayan bir çapaya bağlantı vermez", () => {
  const hero = instantiateTemplate(templateByKey("hero")).find((b) => b.type === "hero");
  assert.equal(hero.props.buttonHref, "");
});

test("CTA blokları varsayılan olarak var olan iletişim bölümüne gider", () => {
  for (const template of TEMPLATES) {
    for (const block of instantiateTemplate(template).filter((b) => b.type === "cta")) {
      assert.equal(block.props.buttonHref, "/#iletisim", template.key);
    }
  }
});

test("dokunulmamış şablonun örnek metinleri yer tutucu olarak yakalanır", () => {
  assert.ok(PLACEHOLDER_TEXTS.size > 20);
  for (const template of TEMPLATES) {
    const text = contentText(asContent(instantiateTemplate(template)));
    assert.ok(findPlaceholders(text).length > 0, `${template.key}: yer tutucu bulunamadı`);
  }
});

test("gerçek içerik yer tutucu sayılmaz; kısa ve olağan başlıklar engellenmez", () => {
  const text = [
    "Sonuç",
    "Sık sorulan sorular",
    "Google Ads bütçesini haftalık olarak gözden geçirin.",
    "Bu yazıda reklam bütçesini nasıl planlayacağınızı anlatıyoruz.",
  ].join("\n");
  assert.deepEqual(findPlaceholders(text), []);
});

test("yer tutucu satırları tekilleştirilerek döndürülür", () => {
  const sample = [...PLACEHOLDER_TEXTS][0];
  assert.deepEqual(findPlaceholders(`${sample}\nGerçek bir paragraf.\n${sample}`), [sample]);
});
