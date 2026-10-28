// Blok sıralama ve bırakma: saf fonksiyonlar (editör, testler).
// Hedef biçimleri:
//   { index }                 → blok listesinde o sıraya (0 = en başa, n = en sona)
//   { blockId, nodeIndex }    → bir metin bloğunun nodeIndex. paragrafından hemen
//                               önceye: metin bloğu o noktadan ikiye bölünür, bırakılan
//                               blok iki parçanın arasına girer.
// Kaynak biçimleri: { kind: "move", id } (var olan blok) · { kind: "new", block }.
// Sonuç: yeni dizi ya da null (geçersiz/etkisiz bırakma; hiçbir şey değişmez).
import { cloneBlock } from "./model.js";

const nodesOf = (block) => (block?.type === "text" && Array.isArray(block.props?.doc?.content) ? block.props.doc.content : null);

// Metin bloğu ancak iki dolu parça oluşacaksa bölünebilir.
export const canSplit = (block, nodeIndex) => {
  const nodes = nodesOf(block);
  return Boolean(nodes) && Number.isInteger(nodeIndex) && nodeIndex > 0 && nodeIndex < nodes.length;
};

// İlk parça kimliğini korur; ikinci parça yeni kimlik alır. Biçim, bağlantı ve
// listeler düğüm olarak taşındığı için aynen korunur.
export function splitTextBlock(block, nodeIndex) {
  if (!canSplit(block, nodeIndex)) return null;
  const nodes = nodesOf(block);
  const first = { ...block, props: { ...block.props, doc: { ...block.props.doc, content: nodes.slice(0, nodeIndex) } } };
  const twin = cloneBlock(block);
  const second = { ...twin, props: { ...twin.props, doc: { ...block.props.doc, content: nodes.slice(nodeIndex) } } };
  return [first, second];
}

export function dropBlocks(blocks, source, target) {
  if (!Array.isArray(blocks) || !source || !target) return null;
  let moving;
  let rest = blocks;
  if (source.kind === "move") {
    const from = blocks.findIndex((block) => block.id === source.id);
    if (from === -1) return null;
    moving = blocks[from];
    if (target.blockId === source.id) return null; // blok kendi içine bırakılamaz
    if (Number.isInteger(target.index)) {
      // Hedef, blok yerinden çıkarılmadan önceki sıraya göre verilir.
      const to = target.index > from ? target.index - 1 : target.index;
      if (to === from) return null;
      rest = blocks.filter((block) => block.id !== source.id);
      return [...rest.slice(0, to), moving, ...rest.slice(to)];
    }
    rest = blocks.filter((block) => block.id !== source.id);
  } else if (source.kind === "new" && source.block) {
    moving = source.block;
  } else {
    return null;
  }

  if (Number.isInteger(target.index)) {
    const at = Math.max(0, Math.min(target.index, rest.length));
    return [...rest.slice(0, at), moving, ...rest.slice(at)];
  }
  const at = rest.findIndex((block) => block.id === target.blockId);
  if (at === -1) return null;
  const parts = splitTextBlock(rest[at], target.nodeIndex);
  if (!parts) return null;
  return [...rest.slice(0, at), parts[0], moving, parts[1], ...rest.slice(at + 1)];
}

// "Konuma taşı" listesi için blokların kısa adı.
export function blockSummary(block) {
  const text = (node) => (node?.text ?? "") + (node?.content ?? []).map(text).join(" ");
  if (block.type === "heading") return String(block.props?.text ?? "").trim();
  if (block.type === "text") return text(block.props?.doc).replace(/\s+/g, " ").trim();
  return String(block.props?.title ?? block.props?.caption ?? block.props?.image?.alt ?? "").trim();
}
