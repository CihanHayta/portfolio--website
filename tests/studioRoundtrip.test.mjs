// Stüdyonun editöre aktardığı taslak, editörün kaydettiği biçimde (sunucu
// sanitizeContent) saklanıp yeniden açıldığında (toBlocks) kayıpsız kalmalı.
// Veritabanı kullanılmaz; kayıt/açılış yolundaki saf dönüşümler sınanır.
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyFill, slotKey, slotsFromResponse, templateSlots } from "@/lib/ai/templateFill";
import { contentImages, contentText, sanitizeContent, toBlocks } from "@/lib/blog/blocks/model";
import { placeImages } from "@/lib/blog/blocks/placeImages";
import { findPlaceholders, instantiateTemplate, templateByKey } from "@/lib/blog/blocks/templates";
import { MEDIA_URL_PREFIX } from "@/lib/blog/content";

// Stüdyo görselleri önce medya kütüphanesine (sitenin kendi kovası) aktarılır.
const media = (id) => ({ media: { id, url: `${MEDIA_URL_PREFIX}${id}.webp`, width: 1200, height: 800 }, alt: `Alt ${id}` });

function filledDraft(key) {
  const blocks = instantiateTemplate(templateByKey(key));
  const slots = templateSlots(blocks);
  const sections = {};
  for (const slot of slots) {
    const text = `Özgün içerik ${slot.id}`;
    sections[slotKey(slot)] = {
      heading: { text: `Başlık ${slot.id}` },
      paragraphs: { paragraphs: [`${text} bir.`, `${text} iki.`] },
      list: { items: [`${text} madde`, "İkinci madde"] },
      table: { rows: [{ cells: ["A", "B"] }, { cells: ["1", "2"] }] },
      callout: { title: "Not", text },
      steps: { items: [{ title: "Adım", text }] },
      faq: { items: [{ question: "Soru?", answer: text }] },
      prosCons: { pros: ["Artı"], cons: ["Eksi"] },
      cta: { title: "İletişime geçin", text },
      imageText: { title: "Bölüm", paragraphs: [text] },
      columns: { items: [{ title: "Bir", text }, { title: "İki", text }, { title: "Üç", text }] },
      hero: { title: "Ana vaat", text },
      quote: {},
      stats: { items: [] },
    }[slot.kind];
  }
  return applyFill(blocks, slotsFromResponse({ sections }, slots), {
    extraSections: [{ level: "2", heading: "Kaynaktan ek bölüm", paragraphs: ["Ek bölüm metni."] }],
  });
}

for (const key of ["seoGuide", "steps", "comparison", "imageText", "hero"]) {
  test(`stüdyo taslağı kaydedilip yeniden açıldığında kayıpsız kalır: ${key}`, () => {
    const filled = filledDraft(key);
    const placed = placeImages(filled.blocks, [media("kapak"), media("a"), media("b"), media("c")], { coverId: "kapak" });

    // Editör içeriği bu biçimde gönderir; sunucu sanitizeContent ile saklar.
    const sent = JSON.parse(JSON.stringify({ type: "blocks", version: 1, blocks: placed.blocks }));
    const saved = sanitizeContent(sent);
    const reopened = toBlocks(JSON.parse(JSON.stringify(saved)));

    assert.deepEqual(reopened, sanitizeContent(sent).blocks, "kaydet → aç aynı blokları verir");
    assert.deepEqual(reopened.map((block) => block.id), placed.blocks.map((block) => block.id), "blok kimlikleri ve sırası korunur");
    assert.equal(contentText(saved), contentText({ type: "blocks", version: 1, blocks: placed.blocks }), "metin kaybolmaz");
    assert.match(contentText(saved), /Kaynaktan ek bölüm/);
    const urls = contentImages(saved).map((image) => image.url);
    assert.equal(urls.length, placed.placed, "yerleşen her görsel kayıtta durur");
    assert.ok(!urls.some((url) => url.includes("kapak")), "kapak içerikte değil, kapak alanında");
    assert.deepEqual(sanitizeContent(saved), saved, "sanitize kararlıdır (ikinci kayıtta değişmez)");
  });
}

test("şablonun örnek metni kalırsa yayın engeli devrede kalır", () => {
  const blocks = instantiateTemplate(templateByKey("seoGuide"));
  const untouched = applyFill(blocks, []);
  assert.ok(findPlaceholders(contentText({ type: "blocks", version: 1, blocks: untouched.blocks })).length > 0);
});

test("kayıtta yalnızca sitenin kendi medya kovasındaki görseller kalır (dış adres düşer)", () => {
  const blocks = [{ id: "i1", type: "image", props: { image: { url: "https://baska-site.com/a.jpg", alt: "Dış" } } }];
  const saved = sanitizeContent({ type: "blocks", version: 1, blocks });
  assert.equal(contentImages(saved).length, 0);
});
