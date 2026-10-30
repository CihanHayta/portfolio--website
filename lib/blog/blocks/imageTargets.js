// Görsellerin yazıdaki hedef bölümleri ve yerleştirme.
// Hedef değerleri: "cover" (kapak alanı) · "intro" (ilk başlıktan önce) ·
// "block:<başlık kimliği>" (o başlığın hemen altı) · "block:<boş görsel alanı>"
// (şablondaki boş görsel alanı doldurulur) · "gallery" · "end".
// - Mevcut blokların kimliği ve içeriği değişmez; yalnızca yeni görsel blokları eklenir.
// - Hedefi bulunamayan görsel SESSİZCE atılmaz: `unplaced` içinde döner.
import { createBlock } from "./model.js";

// Türkçe harfler işaretlerinden arındırılır (ç→c, ş→s); kelimeler bölünmez.
const fold = (text) => String(text ?? "").toLocaleLowerCase("tr-TR").normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}\s]/gu, " ");
const words = (text) => new Set(fold(text).split(/\s+/).filter((word) => word.length > 3));
const headingText = (block) => String(block.props?.text ?? "").trim();
const SLOT_TYPES = new Set(["image", "imageText", "hero"]);
const isEmptySlot = (block) => SLOT_TYPES.has(block?.type) && !block.props?.image?.url;

// Başlıklar ve şablondaki boş görsel alanları belge sırasıyla listelenir.
export function imageTargets(blocks = []) {
  const middle = [];
  let section = "";
  for (const block of blocks) {
    if (block.type === "heading" && headingText(block)) {
      section = headingText(block);
      middle.push({ value: `block:${block.id}`, label: `H${block.props.level ?? 2} · ${section.slice(0, 70)}`, level: Number(block.props.level ?? 2) });
    } else if (isEmptySlot(block)) {
      middle.push({ value: `block:${block.id}`, label: `Boş görsel alanı${section ? ` · ${section.slice(0, 60)}` : ""}`, slot: true });
    }
  }
  return [
    { value: "cover", label: "Kapak görseli" },
    { value: "intro", label: "Giriş (ilk başlıktan önce)" },
    ...middle,
    { value: "gallery", label: "Galeri" },
    { value: "end", label: "Yazının sonu" },
  ];
}

export const targetLabel = (blocks, target) => imageTargets(blocks).find((item) => item.value === target)?.label ?? "Hedef seçilmedi";

// Kaynak görselin kaynaktaki bölüm adına en çok benzeyen başlığı önerir; yoksa
// henüz görsel önerilmemiş ilk başlık, o da yoksa yazının sonu.
export function suggestTarget(blocks = [], { section = "", role = "content" } = {}, { coverTaken = false, used = new Set() } = {}) {
  if (role === "og" && !coverTaken) return "cover";
  const headings = blocks.filter((block) => block.type === "heading" && headingText(block));
  const wanted = words(section);
  let best = null;
  let bestScore = 0;
  for (const block of headings) {
    const score = [...words(headingText(block))].filter((word) => wanted.has(word)).length;
    if (score > bestScore) {
      best = block;
      bestScore = score;
    }
  }
  if (best) return `block:${best.id}`;
  const slot = blocks.find((block) => isEmptySlot(block) && !used.has(`block:${block.id}`));
  if (slot) return `block:${slot.id}`;
  const free = headings.find((block) => !used.has(`block:${block.id}`));
  return free ? `block:${free.id}` : "end";
}

const asImage = (item) => ({ url: item.url, alt: String(item.alt ?? "").trim().slice(0, 300), width: item.width ?? null, height: item.height ?? null });

// items: [{ url, alt, width, height, target, caption? }] (seçim sırası korunur)
export function placeAtTargets(blocks = [], items = []) {
  const result = [...blocks];
  let cover = null;
  let placed = 0;
  const unplaced = [];
  const offsets = new Map(); // hedef → o hedefe eklenen görsel sayısı (sıra korunur)
  const insert = (index, target, block) => {
    const offset = offsets.get(target) ?? 0;
    result.splice(index + offset, 0, block);
    offsets.set(target, offset + 1);
    placed += 1;
  };

  for (const item of items) {
    if (!item?.url) continue;
    const target = item.target;
    if (target === "cover") {
      if (!cover) cover = { media: { id: item.mediaId ?? null, url: item.url, width: item.width ?? null, height: item.height ?? null }, alt: String(item.alt ?? "").trim() };
      else unplaced.push(item);
      continue;
    }
    const block = () => createBlock("image", { image: asImage(item), caption: String(item.caption ?? "").trim().slice(0, 300) });
    if (target === "intro") {
      const first = result.findIndex((other) => other.type === "heading");
      insert(first === -1 ? Math.min(1, result.length) : first, "intro", block());
    } else if (typeof target === "string" && target.startsWith("block:")) {
      const index = result.findIndex((other) => other.id === target.slice(6));
      const host = result[index];
      if (index === -1) unplaced.push(item);
      else if (item.replace && host.type === "gallery" && Number.isInteger(item.slot) && host.props.items?.[item.slot]) {
        // "Görseli değiştir": galerideki o görsel yerinde değişir (sıra ve başlık korunur).
        const items = host.props.items.map((entry, position) => (position === item.slot ? { ...entry, image: asImage(item) } : entry));
        result[index] = { ...host, props: { ...host.props, items } };
        placed += 1;
      } else if (item.replace && SLOT_TYPES.has(host.type)) {
        // "Görseli değiştir": blok kimliği, yazı ve diğer ayarlar korunur; yalnızca görsel değişir.
        result[index] = { ...host, props: { ...host.props, image: asImage(item) } };
        placed += 1;
      } else if (isEmptySlot(result[index])) {
        // Şablondaki boş görsel alanı doldurulur (blok kimliği ve diğer ayarları korunur).
        result[index] = { ...result[index], props: { ...result[index].props, image: asImage(item) } };
        placed += 1;
      } else insert(index + 1, target, block());
    } else if (target === "gallery") {
      const index = result.findIndex((other) => other.type === "gallery" && other.props.items.length < 12);
      const entry = { image: asImage(item), title: "", caption: String(item.caption ?? "").trim().slice(0, 200) };
      if (index === -1) result.push(createBlock("gallery", { items: [entry] }));
      else result[index] = { ...result[index], props: { ...result[index].props, items: [...result[index].props.items, entry] } };
      placed += 1;
    } else if (target === "end") {
      result.push(block());
      placed += 1;
    } else {
      unplaced.push(item);
    }
  }
  return { blocks: result, cover, placed, unplaced };
}
