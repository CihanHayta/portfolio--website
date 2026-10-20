// Blok tabanlı içerik modeli. blog_posts.content sütununda tek bir JSON belgesi
// durur: { type: "blocks", version: 1, blocks: [{ id, type, props }] }.
// Eski yazılar ({ type: "doc" }, Tiptap belgesi) okunurken bloklara çevrilir;
// veritabanındaki halleri kaydedilene kadar değişmez.

import {
  collectHeadings,
  docText,
  isMediaUrl,
  nodeText,
  safeHref,
  sanitizeDoc,
  youtubeId,
} from "../content.js";
import { slugify } from "../slug.js";
import { BLOCKS, fieldsFor } from "./registry.js";

export const MAX_BLOCKS = 200;
const ID_PATTERN = /^[a-z0-9]{6,16}$/;
const isId = (value) => typeof value === "string" && ID_PATTERN.test(value);
const RICH_NODES = new Set(["paragraph", "bulletList", "orderedList", "blockquote", "codeBlock", "table"]);
const VIMEO_ID = /vimeo\.com\/(?:video\/)?(\d{6,12})/;

export const EMPTY_RICH = { type: "doc", content: [{ type: "paragraph" }] };
export const EMPTY_CONTENT = { type: "blocks", version: 1, blocks: [] };

export function uid() {
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

export const richFromText = (...paragraphs) => ({
  type: "doc",
  content: paragraphs.map((value) =>
    value ? { type: "paragraph", content: [{ type: "text", text: value }] } : { type: "paragraph" }
  ),
});

// Yalnızca izin verilen sağlayıcıların gömme adresi üretilir.
export function videoEmbed(value) {
  const youtube = youtubeId(value);
  if (youtube) {
    return {
      provider: "youtube",
      url: `https://www.youtube.com/watch?v=${youtube}`,
      src: `https://www.youtube-nocookie.com/embed/${youtube}`,
    };
  }
  const vimeo = String(value ?? "").match(VIMEO_ID)?.[1];
  if (vimeo) {
    return {
      provider: "vimeo",
      url: `https://vimeo.com/${vimeo}`,
      src: `https://player.vimeo.com/video/${vimeo}?dnt=1`,
    };
  }
  return null;
}

// Blok içindeki zengin metin: başlık, görsel ve video düğümleri burada yer almaz
// (bunların kendi blokları var).
export function sanitizeRich(doc) {
  const clean = sanitizeDoc(doc);
  const content = clean.content.filter((node) => RICH_NODES.has(node.type));
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

function sanitizeImage(value) {
  if (!value || !isMediaUrl(value.url)) return null;
  const size = (n) => (Number.isInteger(n) && n > 0 && n <= 20000 ? n : null);
  return {
    url: value.url,
    alt: String(value.alt ?? "").slice(0, 300),
    width: size(value.width),
    height: size(value.height),
  };
}

function fieldDefault(field) {
  if (field.default !== undefined) return field.default;
  switch (field.type) {
    case "rich":
      return EMPTY_RICH;
    case "toggle":
      return false;
    case "image":
      return null;
    case "list":
      return Array.from({ length: field.min }, () => defaultProps(field.fields, true));
    case "lines":
      return [];
    case "select":
    case "align":
      return field.options[0][0];
    default:
      return "";
  }
}

export function defaultProps(fields, withId = false) {
  const props = withId ? { id: uid() } : {};
  for (const field of fields) props[field.key] = fieldDefault(field);
  return props;
}

function sanitizeField(field, value) {
  switch (field.type) {
    case "text":
      return String(value ?? "").replace(/\s+/g, " ").slice(0, field.max);
    case "textarea":
      return String(value ?? "").slice(0, field.max);
    case "rich":
      return sanitizeRich(value);
    case "url":
      if (field.video) return videoEmbed(value)?.url ?? "";
      return safeHref(value) ?? "";
    case "toggle":
      return Boolean(value);
    case "image":
      return sanitizeImage(value);
    case "select":
    case "align":
      return field.options.some(([option]) => option === value) ? value : fieldDefault(field);
    case "lines":
      return (Array.isArray(value) ? value : [])
        .map((line) => String(line ?? "").trim().slice(0, 200))
        .filter(Boolean)
        .slice(0, field.max);
    case "list": {
      const items = (Array.isArray(value) ? value : [])
        .filter((item) => item && typeof item === "object")
        .slice(0, field.max)
        .map((item) => ({
          id: isId(item.id) ? item.id : uid(),
          ...sanitizeProps(field.fields, item),
        }));
      while (items.length < field.min) items.push(defaultProps(field.fields, true));
      return items;
    }
    default:
      return null;
  }
}

function sanitizeProps(fields, props) {
  const out = {};
  for (const field of fields) out[field.key] = sanitizeField(field, props?.[field.key]);
  return out;
}

export function createBlock(type, props = {}) {
  const fields = fieldsFor(type);
  if (!fields) throw new Error(`Bilinmeyen blok türü: ${type}`);
  const merged = { ...defaultProps(fields), ...props };
  // Palet ve şablonlardan gelen liste öğelerine de kalıcı kimlik verilir;
  // React anahtarları ve sıralama kaydedilmeden önce de doğru çalışsın.
  for (const field of fields) {
    if (field.type === "list" && Array.isArray(merged[field.key])) {
      merged[field.key] = merged[field.key].map((item) => (isId(item.id) ? item : { ...item, id: uid() }));
    }
  }
  return { id: uid(), type, props: merged };
}

// Blokları (ve içlerindeki liste öğelerini) yeni kimliklerle kopyalar.
export function cloneBlock(block) {
  const fields = fieldsFor(block.type) ?? [];
  const props = { ...block.props };
  for (const field of fields) {
    if (field.type === "list") props[field.key] = (props[field.key] ?? []).map((item) => ({ ...item, id: uid() }));
  }
  return { id: uid(), type: block.type, props };
}

// Tanınmayan blok türlerini ve alanları atar; sunucuda kaydetmeden önce çalışır.
export function sanitizeBlocks(blocks) {
  const seen = new Set();
  const out = [];
  for (const block of Array.isArray(blocks) ? blocks : []) {
    const fields = fieldsFor(block?.type);
    if (!fields) continue;
    let id = isId(block.id) ? block.id : uid();
    if (seen.has(id)) id = uid();
    seen.add(id);
    out.push({ id, type: block.type, props: sanitizeProps(fields, block.props) });
    if (out.length === MAX_BLOCKS) break;
  }
  return out;
}

export function isBlocksContent(content) {
  return content?.type === "blocks" && Array.isArray(content.blocks);
}

// Eski Tiptap belgesini bloklara çevirir. Başlık, görsel, video ve ayırıcılar
// kendi bloklarına; aradaki metin düğümleri tek bir paragraf bloğuna dönüşür.
export function legacyToBlocks(doc) {
  const blocks = [];
  let run = [];
  const flush = () => {
    if (run.length) blocks.push(createBlock("text", { doc: { type: "doc", content: run } }));
    run = [];
  };

  for (const node of sanitizeDoc(doc).content) {
    if (RICH_NODES.has(node.type)) {
      run.push(node);
      continue;
    }
    flush();
    if (node.type === "heading") {
      const label = nodeText(node).trim();
      if (label) blocks.push(createBlock("heading", { text: label, level: String(Math.min((node.attrs?.level ?? 2) + 1, 4)) }));
    } else if (node.type === "image") {
      const { src, alt, caption, width, height, size, align } = node.attrs;
      blocks.push(createBlock("image", { image: { url: src, alt, width, height }, caption, size, align }));
    } else if (node.type === "youtube") {
      blocks.push(createBlock("video", { url: node.attrs.src }));
    } else if (node.type === "horizontalRule") {
      blocks.push(createBlock("divider"));
    }
  }
  flush();

  // Tamamen boş bir belge tek bir boş paragraf üretir; onu blok saymayız.
  if (blocks.length === 1 && blocks[0].type === "text" && docText(blocks[0].props.doc) === "") return [];
  return blocks;
}

export function toBlocks(content) {
  return isBlocksContent(content) ? content.blocks : legacyToBlocks(content);
}

export function sanitizeContent(content) {
  const blocks = isBlocksContent(content) ? content.blocks : legacyToBlocks(content);
  return { type: "blocks", version: 1, blocks: sanitizeBlocks(blocks) };
}

function propsText(fields, props) {
  const parts = [];
  for (const field of fields) {
    const value = props?.[field.key];
    if (field.type === "text" || field.type === "textarea") parts.push(value);
    else if (field.type === "rich") parts.push(docText(value));
    else if (field.type === "lines") parts.push(...(value ?? []));
    else if (field.type === "image") parts.push(value?.alt);
    else if (field.type === "list") for (const item of value ?? []) parts.push(propsText(field.fields, item));
  }
  return parts.filter(Boolean).join("\n");
}

function propsImages(fields, props) {
  const found = [];
  for (const field of fields) {
    const value = props?.[field.key];
    if (field.type === "image" && value?.url) found.push(value);
    else if (field.type === "list") for (const item of value ?? []) found.push(...propsImages(field.fields, item));
  }
  return found;
}

// İçerikteki bütün görselleri ({ url, alt, … }) blok sırasıyla döndürür.
export function contentImages(content) {
  if (!isBlocksContent(content)) return [];
  return content.blocks.flatMap((block) => (BLOCKS[block.type] ? propsImages(BLOCKS[block.type].fields, block.props) : []));
}

// Arama ve okuma süresi için içerikteki tüm metni düz metin olarak döndürür.
export function contentText(content) {
  if (!isBlocksContent(content)) return docText(content);
  return content.blocks
    .map((block) => (BLOCKS[block.type] ? propsText(BLOCKS[block.type].fields, block.props) : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

// İçindekiler ve sayfa içi bağlantılar için başlık listesi. Seviye 1–3 arasıdır
// (1 = sayfadaki <h2>).
export function contentHeadings(content) {
  if (!isBlocksContent(content)) {
    return collectHeadings(content).map(({ id, label, level }) => ({ id, label, level }));
  }
  const seen = new Map();
  const headings = [];
  for (const block of content.blocks) {
    if (block.type !== "heading") continue;
    const label = String(block.props.text ?? "").trim();
    if (!label) continue;
    const base = slugify(label, 60) || "bolum";
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    headings.push({
      id: count === 1 ? base : `${base}-${count}`,
      label,
      level: Number(block.props.level) - 1,
      blockId: block.id,
    });
  }
  return headings;
}

// Yalnızca yazarın açıkça işaretlediği FAQ bloklarından, sayfada gerçekten
// görünen soru-cevaplar yapılandırılmış veriye girer.
export function faqSchemaItems(content) {
  if (!isBlocksContent(content)) return [];
  return content.blocks
    .filter((block) => block.type === "faq" && block.props.schema)
    .flatMap((block) => block.props.items)
    .filter((item) => item.question.trim() && item.answer.trim())
    .map((item) => ({ question: item.question.trim(), answer: item.answer.trim() }));
}
