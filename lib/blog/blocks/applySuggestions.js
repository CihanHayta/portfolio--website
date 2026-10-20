// Stüdyonun hazırladığı güncelleme önerilerini mevcut yazının bloklarına ekler.
// Öneri, `afterHeading` başlığının bölümünün sonuna (aynı ya da daha üst
// seviyedeki bir sonraki başlıktan önce) yerleşir; başlık bulunamazsa yazının
// sonuna, sondaki CTA bloğundan önce eklenir. Mevcut bloklar değişmez.
import { createBlock } from "./model.js";
import { inlineNodes } from "../../ai/tiptap.js";

const level = (block) => Number(block.props?.level ?? 2);

function sectionEnd(blocks, headingIndex) {
  const own = level(blocks[headingIndex]);
  for (let index = headingIndex + 1; index < blocks.length; index += 1) {
    if (blocks[index].type === "heading" && level(blocks[index]) <= own) return index;
    if (blocks[index].type === "cta") return index;
  }
  return blocks.length;
}

function articleEnd(blocks) {
  let index = blocks.length;
  while (index > 0 && blocks[index - 1].type === "cta") index -= 1;
  return index;
}

export function suggestionBlocks(suggestion) {
  const out = [];
  if (suggestion.heading) out.push(createBlock("heading", { level: suggestion.level === "3" ? "3" : "2", text: suggestion.heading }));
  out.push(
    createBlock("text", {
      doc: { type: "doc", content: suggestion.paragraphs.map((text) => ({ type: "paragraph", content: inlineNodes(text) })) },
    })
  );
  return out;
}

export function applySuggestion(blocks, suggestion) {
  const headingIndex = suggestion.afterHeading
    ? blocks.findIndex((block) => block.type === "heading" && String(block.props?.text ?? "").trim() === suggestion.afterHeading)
    : -1;
  const at = headingIndex >= 0 ? sectionEnd(blocks, headingIndex) : articleEnd(blocks);
  const added = suggestionBlocks(suggestion);
  return { blocks: [...blocks.slice(0, at), ...added, ...blocks.slice(at)], at, added: added.map((block) => block.id) };
}
