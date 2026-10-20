import { safeHref, sanitizeDoc } from "../blog/content.js";

// Modelin ürettiği sade blok listesini editörün (Tiptap) JSON belgesine çevirir.
// Çıktı her zaman sanitizeDoc'tan geçer; editörün tanımadığı hiçbir şey kalmaz.

const INLINE = /(\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`)/g;

// **kalın**, *italik*, `kod` ve [metin](adres) işaretlerini Tiptap metin düğümlerine çevirir.
export function inlineNodes(value) {
  const source = String(value ?? "");
  const nodes = [];
  let cursor = 0;

  const push = (text, marks) => {
    if (!text) return;
    nodes.push(marks ? { type: "text", text, marks } : { type: "text", text });
  };

  for (const match of source.matchAll(INLINE)) {
    push(source.slice(cursor, match.index));
    cursor = match.index + match[0].length;

    if (match[2] !== undefined) push(match[2], [{ type: "bold" }]);
    else if (match[3] !== undefined) push(match[3], [{ type: "italic" }]);
    else if (match[6] !== undefined) push(match[6], [{ type: "code" }]);
    else {
      const href = safeHref(match[5]);
      // Güvensiz adresli bağlantı düz metne iner.
      push(match[4], href ? [{ type: "link", attrs: { href } }] : undefined);
    }
  }
  push(source.slice(cursor));
  return nodes;
}

const paragraph = (text) => ({ type: "paragraph", content: inlineNodes(text) });

function imageNode(image) {
  return {
    type: "image",
    attrs: {
      src: image.media.url,
      alt: image.alt ?? "",
      caption: "",
      width: image.media.width,
      height: image.media.height,
      size: "full",
      align: "center",
    },
  };
}

function blockToNode(block, imagesById) {
  switch (block.type) {
    case "h2":
    case "h3":
      // Sayfanın <h1>'i yazı başlığıdır; içerikte seviye 1 = <h2>, seviye 2 = <h3>.
      return { type: "heading", attrs: { level: Number(block.type[1]) - 1 }, content: [{ type: "text", text: block.text }] };
    case "p":
      return paragraph(block.text);
    case "quote":
      return { type: "blockquote", content: [paragraph(block.text)] };
    case "ul":
    case "ol": {
      const content = block.items.map((item) => ({ type: "listItem", content: [paragraph(item)] }));
      return block.type === "ol"
        ? { type: "orderedList", attrs: { start: 1 }, content }
        : { type: "bulletList", content };
    }
    case "table":
      return {
        type: "table",
        content: block.rows.map((cells, rowIndex) => ({
          type: "tableRow",
          content: cells.map((cell) => ({
            type: rowIndex === 0 ? "tableHeader" : "tableCell",
            attrs: { colspan: 1, rowspan: 1 },
            content: [paragraph(cell)],
          })),
        })),
      };
    case "image": {
      const image = imagesById.get(block.imageId);
      return image?.media?.url ? imageNode(image) : null;
    }
    default:
      return null;
  }
}

// Modelin yerleştirmediği görseller kaybolmaz: bölümlere (h2) eşit aralıkla,
// her birinin ilk paragrafından sonra eklenir.
function placeMissing(nodes, missing) {
  if (missing.length === 0) return nodes;

  const sectionStarts = [];
  nodes.forEach((node, index) => {
    if (node.type === "heading" && node.attrs.level === 1) sectionStarts.push(index);
  });

  const inserts = new Map();
  missing.forEach((image, order) => {
    let at = nodes.length;
    if (sectionStarts.length > 0) {
      const section = sectionStarts[Math.floor(((order + 1) * sectionStarts.length) / (missing.length + 1))];
      at = section + 1;
      while (at < nodes.length && nodes[at].type !== "paragraph") at += 1;
      at = Math.min(at + 1, nodes.length);
    }
    inserts.set(at, [...(inserts.get(at) ?? []), imageNode(image)]);
  });

  const out = [];
  for (let index = 0; index <= nodes.length; index += 1) {
    if (inserts.has(index)) out.push(...inserts.get(index));
    if (index < nodes.length) out.push(nodes[index]);
  }
  return out;
}

export function blocksToDoc(blocks, images, missingImageIds = []) {
  const imagesById = new Map(images.map((image) => [image.id, image]));
  const nodes = blocks.map((block) => blockToNode(block, imagesById)).filter(Boolean);
  const missing = missingImageIds.map((id) => imagesById.get(id)).filter((image) => image?.media?.url);
  return sanitizeDoc({ type: "doc", content: placeMissing(nodes, missing) });
}

// Belgedeki görsel düğümlerini sırasıyla döndürür (alt metin düzenleme ve denetim için).
export function docImages(doc) {
  const found = [];
  const visit = (node) => {
    if (node?.type === "image") found.push(node);
    for (const child of node?.content ?? []) visit(child);
  };
  visit(doc);
  return found;
}

export function setImageAlt(doc, src, alt) {
  const visit = (node) => {
    if (node.type === "image" && node.attrs?.src === src) return { ...node, attrs: { ...node.attrs, alt } };
    return node.content ? { ...node, content: node.content.map(visit) } : node;
  };
  return visit(doc);
}

// Yazının sonuna kaynağa atıf yapan kısa bir not ekler.
export function withSourceCredit(doc, url, label) {
  const href = safeHref(url);
  if (!href || !/^https?:\/\//i.test(href)) return doc;
  return {
    ...doc,
    content: [
      ...doc.content,
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Bu yazı hazırlanırken şu kaynaktan yararlanıldı: ", marks: [{ type: "italic" }] },
          { type: "text", text: String(label || new URL(href).hostname).slice(0, 120), marks: [{ type: "italic" }, { type: "link", attrs: { href } }] },
        ],
      },
    ],
  };
}
