// Stüdyoda seçilen görselleri taslağa yerleştirir:
// 1. Şablondaki boş görsel alanları (image / imageText / hero / galeri) sırayla dolar;
//    kullanıcının önceden koyduğu görsel değişmez.
// 2. Artan görseller yapay zekânın önerdiği bölümün (afterBlockId) altına,
//    öneri yoksa henüz görseli olmayan H2 bölümlerine yeni görsel bloğu olarak eklenir.
// Kapak görseli bloklara konmaz, yazının kapak alanına gider.
// Görseller medya kütüphanesinden gelir: { media: { id, url, width, height }, alt }.
import { createBlock } from "./model.js";

const asImage = ({ media, alt }) => ({ url: media.url, alt: String(alt ?? "").trim(), width: media.width ?? null, height: media.height ?? null });
const IMAGE_TYPES = new Set(["image", "imageText", "hero", "gallery"]);
const CLOSING = /sonuç|özet|son söz|toparla|sık sorulan|\bsss\b|ilgili yazı|kaynaklar|kaynakça/i;

export function placeImages(blocks, images, { coverId = null, placements = [] } = {}) {
  const queue = images.filter((image) => image?.media?.url && image.media.id !== coverId);
  let used = 0;
  const next = () => (used < queue.length ? asImage(queue[used++]) : null);

  const filledBlocks = blocks.map((block) => {
    switch (block.type) {
      case "image":
      case "imageText":
      case "hero": {
        if (block.props.image) return block;
        const image = next();
        return image ? { ...block, props: { ...block.props, image } } : block;
      }
      case "gallery": {
        const items = block.props.items.map((item) => {
          if (item.image) return item;
          const image = next();
          return image ? { ...item, image } : item;
        });
        return { ...block, props: { ...block.props, items } };
      }
      default:
        return block;
    }
  });

  // Artan görseller için yerleşim noktaları.
  const leftover = queue.slice(used);
  const ids = new Set(filledBlocks.map((block) => block.id));
  const suggested = new Map((placements ?? []).map((item) => [item.imageId, item.afterBlockId]));
  const insertAfter = new Map(); // blok kimliği → eklenecek görseller
  const add = (blockId, image) => insertAfter.set(blockId, [...(insertAfter.get(blockId) ?? []), image]);
  const unplaced = [];
  for (const image of leftover) {
    const target = suggested.get(image.media.id);
    if (target && ids.has(target)) add(target, image);
    else unplaced.push(image);
  }

  // Görseli olmayan H2 bölümlerinin ilk metin bloğu (yoksa başlığın kendisi).
  if (unplaced.length) {
    const slots = [];
    let section = null;
    const close = () => {
      if (section && !section.hasImage && !section.closing && !insertAfter.has(section.anchor)) slots.push(section.anchor);
    };
    for (const block of filledBlocks) {
      if (block.type === "heading" && String(block.props.level) === "2") {
        close();
        section = { anchor: block.id, hasImage: false, closing: CLOSING.test(String(block.props.text ?? "")), text: false };
        continue;
      }
      if (!section) continue;
      if (IMAGE_TYPES.has(block.type)) section.hasImage = true;
      if (block.type === "text" && !section.text) {
        section.anchor = block.id;
        section.text = true;
      }
    }
    close();
    while (unplaced.length && slots.length) add(slots.shift(), unplaced.shift());
  }

  const out = [];
  let inserted = 0;
  for (const block of filledBlocks) {
    out.push(block);
    for (const image of insertAfter.get(block.id) ?? []) {
      out.push(createBlock("image", { image: asImage(image) }));
      inserted += 1;
    }
  }

  const cover = images.find((image) => image?.media?.id === coverId) ?? null;
  return {
    blocks: out,
    cover: cover ? { media: cover.media, alt: String(cover.alt ?? "").trim() } : null,
    placed: used + inserted,
    inserted,
    leftover: unplaced.length,
  };
}

