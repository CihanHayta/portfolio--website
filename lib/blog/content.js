import { slugify } from "./slug.js";
import { SUPABASE_URL, MEDIA_BUCKET } from "../supabase/env.js";

// Editörün ürettiği Tiptap JSON belgesi için ortak yardımcılar. Hem sunucuda
// (kaydetme, sayfa render) hem istemcide (önizleme) kullanılır.

export const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

export const MEDIA_URL_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/`;

const IMAGE_SIZES = ["sm", "md", "lg", "full"];
const IMAGE_ALIGNS = ["left", "center", "right"];
const MARKS = ["bold", "italic", "underline", "strike", "code", "link", "accent"];
const YOUTUBE_ID =
  /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/;

export function safeHref(value) {
  const href = String(value ?? "").trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(href)) return href;
  if (/^[/#](?!\/)/.test(href)) return href;
  return null;
}

export function isMediaUrl(value) {
  return typeof value === "string" && SUPABASE_URL !== "" && value.startsWith(MEDIA_URL_PREFIX);
}

export function youtubeId(value) {
  return String(value ?? "").match(YOUTUBE_ID)?.[1] ?? null;
}

const text = (value, max) => String(value ?? "").slice(0, max);
const int = (value, min, max) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

function cleanMarks(marks) {
  if (!Array.isArray(marks)) return undefined;
  const out = [];
  for (const mark of marks) {
    if (!MARKS.includes(mark?.type)) continue;
    if (mark.type === "link") {
      const href = safeHref(mark.attrs?.href);
      if (href) out.push({ type: "link", attrs: { href } });
    } else {
      out.push({ type: mark.type });
    }
  }
  return out.length ? out : undefined;
}

function cleanChildren(node, depth) {
  if (!Array.isArray(node.content)) return [];
  return node.content.map((child) => cleanNode(child, depth + 1)).filter(Boolean);
}

function cleanCellAttrs(attrs) {
  return {
    colspan: int(attrs?.colspan, 1, 20) ?? 1,
    rowspan: int(attrs?.rowspan, 1, 50) ?? 1,
  };
}

// Tanınmayan düğüm, işaret ve öznitelikleri atar. Sunucuda kaydetmeden önce
// çalıştırılır; böylece veritabanına yalnızca render edebildiğimiz içerik girer.
function cleanNode(node, depth) {
  if (!node || typeof node !== "object" || depth > 12) return null;

  switch (node.type) {
    case "text": {
      if (typeof node.text !== "string" || node.text === "") return null;
      const marks = cleanMarks(node.marks);
      return marks ? { type: "text", text: node.text, marks } : { type: "text", text: node.text };
    }
    case "paragraph":
    case "blockquote":
    case "bulletList":
    case "listItem":
    case "tableRow":
    case "table":
      return { type: node.type, content: cleanChildren(node, depth) };
    case "orderedList":
      return {
        type: "orderedList",
        attrs: { start: int(node.attrs?.start, 1, 9999) ?? 1 },
        content: cleanChildren(node, depth),
      };
    case "heading":
      return {
        type: "heading",
        attrs: { level: int(node.attrs?.level, 1, 3) ?? 2 },
        content: cleanChildren(node, depth),
      };
    case "codeBlock":
      return {
        type: "codeBlock",
        attrs: { language: text(node.attrs?.language, 30).replace(/[^\w+#-]/g, "") || null },
        content: cleanChildren(node, depth).filter((child) => child.type === "text"),
      };
    case "tableHeader":
    case "tableCell":
      return {
        type: node.type,
        attrs: cleanCellAttrs(node.attrs),
        content: cleanChildren(node, depth),
      };
    case "horizontalRule":
    case "hardBreak":
      return { type: node.type };
    case "image": {
      if (!isMediaUrl(node.attrs?.src)) return null;
      return {
        type: "image",
        attrs: {
          src: node.attrs.src,
          alt: text(node.attrs.alt, 300),
          caption: text(node.attrs.caption, 300),
          width: int(node.attrs.width, 1, 20000),
          height: int(node.attrs.height, 1, 20000),
          size: IMAGE_SIZES.includes(node.attrs.size) ? node.attrs.size : "full",
          align: IMAGE_ALIGNS.includes(node.attrs.align) ? node.attrs.align : "center",
        },
      };
    }
    case "youtube": {
      const id = youtubeId(node.attrs?.src);
      return id
        ? { type: "youtube", attrs: { src: `https://www.youtube.com/watch?v=${id}` } }
        : null;
    }
    default:
      return null;
  }
}

export function sanitizeDoc(doc) {
  if (!doc || doc.type !== "doc") return EMPTY_DOC;
  const content = cleanChildren(doc, 0);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

export function nodeText(node) {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (node.type === "image") return [node.attrs?.alt, node.attrs?.caption].filter(Boolean).join(" ");
  return (node.content ?? []).map(nodeText).join(BLOCK_TYPES.has(node.type) ? "\n" : "");
}

const BLOCK_TYPES = new Set([
  "doc", "blockquote", "bulletList", "orderedList", "listItem", "table", "tableRow",
]);

export function docText(doc) {
  return nodeText(doc).replace(/\n{2,}/g, "\n").trim();
}

export function countWords(value) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

export function readingMinutes(value) {
  return Math.max(1, Math.round(countWords(value) / 200));
}

// Başlıklara benzersiz id atar; içindekiler listesi ve sayfa içi bağlantılar
// aynı listeden üretilir.
export function collectHeadings(doc) {
  const seen = new Map();
  const headings = [];

  for (const node of doc?.content ?? []) {
    if (node.type !== "heading") continue;
    const label = nodeText(node).trim();
    if (!label) continue;
    const base = slugify(label, 60) || "bolum";
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    headings.push({
      id: count === 1 ? base : `${base}-${count}`,
      label,
      level: node.attrs?.level ?? 2,
      node,
    });
  }

  return headings;
}
