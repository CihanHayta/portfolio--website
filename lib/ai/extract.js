// Bir HTML sayfasından makalenin ana içeriğini çıkarır. Harici bağımlılık
// kullanmaz; etiketler tek geçişte taranır, gezinme / yan panel / yorum gibi
// alanlar atlanır. Yalnızca sayfada gerçekten bulunan içerik döner.

export class ExtractError extends Error {}

const MIN_WORDS = 120;

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…", laquo: "«", raquo: "»",
  copy: "©", reg: "®", trade: "™", bull: "•", middot: "·", deg: "°", euro: "€",
  ccedil: "ç", Ccedil: "Ç", ouml: "ö", Ouml: "Ö", uuml: "ü", Uuml: "Ü",
};

export function decodeEntities(value) {
  return String(value ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, code) => {
    if (code[0] === "#") {
      const point = code[1] === "x" || code[1] === "X" ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
      if (!Number.isInteger(point) || point <= 0 || point > 0x10ffff) return " ";
      try {
        return String.fromCodePoint(point);
      } catch {
        return " ";
      }
    }
    return NAMED_ENTITIES[code] ?? match;
  });
}

const squash = (value) => value.replace(/[\s ]+/g, " ").trim();
const countWords = (value) => (value.trim() ? value.trim().split(/\s+/).length : 0);

function parseAttrs(source) {
  const attrs = {};
  const pattern = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match;
  while ((match = pattern.exec(source))) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function metaContent(head, key) {
  const pattern = /<meta\b([^>]*)>/gi;
  let match;
  while ((match = pattern.exec(head))) {
    const attrs = parseAttrs(match[1]);
    if ((attrs.name ?? attrs.property ?? "").toLowerCase() === key && attrs.content) {
      return squash(attrs.content);
    }
  }
  return "";
}

function readJsonLd(html) {
  const found = { articleBody: "", headline: "", author: "", datePublished: "" };
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    let data;
    try {
      data = JSON.parse(match[1].trim());
    } catch {
      continue;
    }
    const queue = [data];
    while (queue.length) {
      const item = queue.shift();
      if (Array.isArray(item)) queue.push(...item);
      else if (item && typeof item === "object") {
        if (Array.isArray(item["@graph"])) queue.push(...item["@graph"]);
        const type = [].concat(item["@type"] ?? []).join(" ");
        if (/Article|BlogPosting|NewsArticle/i.test(type)) {
          if (typeof item.articleBody === "string" && item.articleBody.length > found.articleBody.length) {
            found.articleBody = item.articleBody;
          }
          if (typeof item.headline === "string") found.headline ||= item.headline;
          if (typeof item.datePublished === "string") found.datePublished ||= item.datePublished;
          const author = [].concat(item.author ?? [])[0];
          if (author) found.author ||= typeof author === "string" ? author : String(author.name ?? "");
        }
      }
    }
  }
  return found;
}

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
]);
// İçeriği hiçbir koşulda makaleye ait olmayan öğeler.
const SKIP_TAGS = new Set([
  "nav", "footer", "aside", "form", "button", "select", "option", "textarea", "label",
  "dialog", "menu", "video", "audio", "canvas", "object", "map", "figcaption",
]);
const SKIP_HINT =
  /(^|[\s_-])(comments?|sidebar|related|share|sharing|social|newsletter|subscribe|cookie|consent|breadcrumbs?|promo|advert|ads?|banner|popup|modal|menu|nav|navbar|footer|author-bio|byline|toc|table-of-contents|widget|recommend|pagination)([\s_-]|$)/i;
const BLOCK_TAGS = new Set([
  "p", "div", "section", "article", "main", "header", "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "dl", "dt", "dd", "table", "thead", "tbody", "tfoot", "tr", "td", "th",
  "blockquote", "pre", "figure", "hr", "address", "details", "summary", "body", "html",
]);
const HEADING = /^h[1-6]$/;

function resolveUrl(value, base) {
  try {
    const url = new URL(value, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function imageSource(attrs) {
  const candidates = [attrs.src, attrs["data-src"], attrs["data-lazy-src"], attrs["data-original"]];
  const srcset = attrs.srcset ?? attrs["data-srcset"];
  if (srcset) candidates.push(srcset.split(",").pop().trim().split(/\s+/)[0]);
  return candidates.find((value) => value && !value.startsWith("data:")) ?? null;
}

function walk(bodyHtml, baseUrl) {
  const blocks = [];
  const stack = []; // { tag, skip }
  let skipDepth = 0;
  let buffer = "";
  let bufferScope = { article: false, main: false };
  let articleDepth = 0;
  let mainDepth = 0;
  let preDepth = 0;

  const context = () => {
    let heading = 0;
    let listItem = false;
    let ordered = false;
    let quote = false;
    let cell = null;
    let listId = null;
    let tableId = null;
    let rowId = null;
    for (const entry of stack) {
      if (HEADING.test(entry.tag)) heading = Number(entry.tag[1]);
      else if (entry.tag === "li") listItem = true;
      else if (entry.tag === "ul" || entry.tag === "ol") {
        ordered = entry.tag === "ol";
        listId = entry.id;
        listItem = false;
      } else if (entry.tag === "blockquote") quote = true;
      else if (entry.tag === "table") tableId = entry.id;
      else if (entry.tag === "tr") rowId = entry.id;
      else if (entry.tag === "td" || entry.tag === "th") cell = entry.tag;
    }
    return { heading, listItem, ordered, quote, cell, listId, tableId, rowId };
  };

  const flush = () => {
    const raw = buffer;
    buffer = "";
    const text = preDepth > 0 ? raw.replace(/\s+$/g, "") : squash(raw);
    if (!text) return;
    const ctx = context();
    const scope = { ...bufferScope };

    if (ctx.cell && ctx.tableId !== null) {
      let table = blocks.findLast((block) => block.type === "table" && block.id === ctx.tableId);
      if (!table) {
        table = { type: "table", id: ctx.tableId, rows: [], rowIds: [], ...scope };
        blocks.push(table);
      }
      let rowIndex = table.rowIds.indexOf(ctx.rowId);
      if (rowIndex === -1) {
        table.rowIds.push(ctx.rowId);
        table.rows.push([]);
        rowIndex = table.rows.length - 1;
      }
      table.rows[rowIndex].push(text);
    } else if (ctx.heading) {
      blocks.push({ type: "heading", level: ctx.heading, text, ...scope });
    } else if (preDepth > 0) {
      blocks.push({ type: "code", text, ...scope });
    } else if (ctx.listItem && ctx.listId !== null) {
      const last = blocks.at(-1);
      if (last?.type === "list" && last.id === ctx.listId) last.items.push(text);
      else blocks.push({ type: "list", id: ctx.listId, ordered: ctx.ordered, items: [text], ...scope });
    } else if (ctx.quote) {
      blocks.push({ type: "quote", text, ...scope });
    } else {
      blocks.push({ type: "paragraph", text, ...scope });
    }
  };

  const tokens = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let cursor = 0;
  let nextId = 1;
  let match;

  const pushText = (text) => {
    if (skipDepth > 0 || !text) return;
    if (!buffer.trim()) bufferScope = { article: articleDepth > 0, main: mainDepth > 0 };
    buffer += decodeEntities(text);
  };

  const closeEntry = (entry) => {
    if (BLOCK_TAGS.has(entry.tag) && skipDepth === 0) flush();
    if (entry.skip) skipDepth -= 1;
    if (entry.tag === "article") articleDepth -= 1;
    if (entry.tag === "main") mainDepth -= 1;
    if (entry.tag === "pre") preDepth -= 1;
  };

  while ((match = tokens.exec(bodyHtml))) {
    pushText(bodyHtml.slice(cursor, match.index));
    cursor = tokens.lastIndex;
    if (!match[2]) continue; // yorum

    const closing = match[1] === "/";
    const tag = match[2].toLowerCase();

    if (closing) {
      const index = stack.findLastIndex((entry) => entry.tag === tag);
      if (index === -1) continue;
      // Öğe yığından çıkmadan önce kapatılır; içindeki metin doğru bağlamla (başlık,
      // liste maddesi, hücre) kaydedilir.
      while (stack.length > index) {
        closeEntry(stack.at(-1));
        stack.pop();
      }
      continue;
    }

    const attrs = parseAttrs(match[3]);

    if (tag === "br") {
      if (skipDepth === 0) buffer += preDepth > 0 ? "\n" : " ";
      continue;
    }
    if (tag === "img") {
      if (skipDepth > 0) continue;
      const rawSrc = imageSource(attrs);
      const src = rawSrc ? resolveUrl(rawSrc, baseUrl) : null;
      const width = Number.parseInt(attrs.width, 10);
      const height = Number.parseInt(attrs.height, 10);
      const tiny = (width > 0 && width < 120) || (height > 0 && height < 90);
      if (src && !tiny && !/\.(svg|gif)(\?|$)/i.test(src) && !/(avatar|logo|icon|emoji|pixel|spacer)/i.test(src)) {
        flush();
        blocks.push({
          type: "image",
          src,
          alt: squash(attrs.alt ?? ""),
          article: articleDepth > 0,
          main: mainDepth > 0,
        });
      }
      continue;
    }
    if (VOID_TAGS.has(tag) || /\/\s*$/.test(match[3])) {
      if (tag === "hr" && skipDepth === 0) flush();
      continue;
    }

    if (BLOCK_TAGS.has(tag) && skipDepth === 0) flush();

    const hint = `${attrs.class ?? ""} ${attrs.id ?? ""} ${attrs.role ?? ""}`;
    const skip =
      SKIP_TAGS.has(tag) ||
      (tag === "header" && articleDepth === 0) ||
      attrs.hidden !== undefined ||
      attrs["aria-hidden"] === "true" ||
      // Makalenin kendi kapsayıcısı ipucu sözcüğü taşısa bile atlanmaz.
      (!["article", "main", "body", "html"].includes(tag) && SKIP_HINT.test(hint));

    if (skip) skipDepth += 1;
    if (tag === "article") articleDepth += 1;
    if (tag === "main") mainDepth += 1;
    if (tag === "pre") preDepth += 1;
    stack.push({ tag, skip, id: nextId++ });
  }
  pushText(bodyHtml.slice(cursor));
  flush();

  return blocks;
}

const blockWords = (block) => {
  if (block.type === "list") return countWords(block.items.join(" "));
  if (block.type === "table") return countWords(block.rows.flat().join(" "));
  if (block.type === "image") return 0;
  return countWords(block.text);
};

function pickScope(blocks) {
  const total = blocks.reduce((sum, block) => sum + blockWords(block), 0);
  for (const key of ["article", "main"]) {
    const scoped = blocks.filter((block) => block[key]);
    const words = scoped.reduce((sum, block) => sum + blockWords(block), 0);
    if (words >= MIN_WORDS && words >= total * 0.4) return scoped;
  }
  return blocks;
}

function cleanBlocks(blocks) {
  const out = [];
  const seenText = new Set();
  for (const block of blocks) {
    const rest = { ...block };
    for (const key of ["article", "main", "id", "rowIds"]) delete rest[key];
    if (rest.type === "paragraph" || rest.type === "quote") {
      // Tek sözcüklük kırıntılar (paylaş düğmesi artıkları vb.) alınmaz.
      if (rest.text.length < 25 && countWords(rest.text) < 4) continue;
      if (seenText.has(rest.text)) continue;
      seenText.add(rest.text);
    }
    if (rest.type === "heading") {
      if (rest.text.length > 200) rest.type = "paragraph";
      else if (out.at(-1)?.type === "heading" && out.at(-1).text === rest.text) continue;
    }
    if (rest.type === "table") {
      rest.rows = rest.rows.filter((row) => row.length > 0);
      if (rest.rows.length < 2) {
        const text = rest.rows.flat().join(" — ");
        if (text) out.push({ type: "paragraph", text });
        continue;
      }
    }
    out.push(rest);
  }
  // Sondaki sahipsiz başlıklar (içeriği atlanmış bölümler) düşer.
  while (out.at(-1)?.type === "heading") out.pop();
  return out;
}

// Kaynağın kendi blog/araştırma bölümü: yalnızca sayfada GERÇEKTEN bulunan,
// aynı alan adındaki tek seviyeli bir bağlantıdan alınır (ör. menüdeki "Blog").
// Adres tahmin edilmez; bulunamazsa boş döner.
const SECTION_PATH = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(blog|bloglar|insights|research|arastirma|arastirmalar|makaleler|yazilar|haberler|news|resources|kaynaklar|journal|articles)\/?$/i;
export function sectionLink(html, pageUrl) {
  let page;
  try {
    page = new URL(pageUrl);
  } catch {
    return null;
  }
  const host = page.hostname.replace(/^www\./, "");
  for (const match of String(html ?? "").matchAll(/<a\b([^>]*)>([\s\S]{0,200}?)<\/a>/gi)) {
    const href = parseAttrs(`<a ${match[1]}>`).href;
    if (!href) continue;
    let url;
    try {
      url = new URL(decodeEntities(href), page);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    if (url.hostname.replace(/^www\./, "") !== host || !SECTION_PATH.test(url.pathname)) continue;
    if (url.pathname.replace(/\/$/, "") === page.pathname.replace(/\/$/, "")) continue;
    const label = squash(decodeEntities(match[2].replace(/<[^>]+>/g, " "))).slice(0, 60);
    url.hash = "";
    url.search = "";
    return { url: url.toString(), label: label || url.pathname.replace(/\//g, "") };
  }
  return null;
}

export function extractArticle(html, pageUrl) {
  const source = String(html ?? "");
  const head = source.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? source.slice(0, 20000);
  const jsonLd = readJsonLd(source);

  const titleTag = squash(decodeEntities(head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""));
  const canonicalTag = head.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)?.[0];
  const canonical = canonicalTag ? resolveUrl(parseAttrs(canonicalTag).href ?? "", pageUrl) : null;

  const stripped = source
    .replace(/<(script|style|noscript|template|svg|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, " ");

  const blocks = cleanBlocks(pickScope(walk(stripped, pageUrl)));

  let words = blocks.reduce((sum, block) => sum + blockWords(block), 0);
  // Gövde betikle çiziliyorsa (boş HTML), sayfanın kendi JSON-LD metni kullanılır.
  if (words < MIN_WORDS && countWords(jsonLd.articleBody) >= MIN_WORDS) {
    blocks.length = 0;
    for (const part of jsonLd.articleBody.split(/\n{1,}/)) {
      const text = squash(part);
      if (text) blocks.push({ type: "paragraph", text });
    }
    words = blocks.reduce((sum, block) => sum + blockWords(block), 0);
  }

  if (words < MIN_WORDS) {
    throw new ExtractError(
      "Bu sayfadan yeterli makale içeriği çıkarılamadı. Sayfa giriş gerektiriyor, içeriğini tarayıcıda betikle yüklüyor ya da bir makale sayfası değil olabilir."
    );
  }

  const firstH1 = blocks.find((block) => block.type === "heading" && block.level === 1)?.text ?? "";
  const ogTitle = metaContent(head, "og:title");
  const title = firstH1 || ogTitle || squash(jsonLd.headline) || titleTag;

  const images = [];
  const seenImages = new Set();
  const ogImage = resolveUrl(metaContent(head, "og:image"), pageUrl);
  if (ogImage) {
    images.push({ src: ogImage, alt: "", role: "og" });
    seenImages.add(ogImage);
  }
  // Her görsel, üstündeki en yakın başlıkla (kaynaktaki bölümüyle) birlikte tutulur.
  let section = "";
  for (const block of blocks) {
    if (block.type === "heading" && block.level >= 2) section = block.text;
    if (block.type !== "image" || seenImages.has(block.src)) continue;
    seenImages.add(block.src);
    images.push({ src: block.src, alt: block.alt, role: "content", section });
  }

  return {
    url: pageUrl,
    canonicalUrl: canonical,
    title,
    metaTitle: titleTag || ogTitle,
    metaDescription: metaContent(head, "description") || metaContent(head, "og:description"),
    siteName: metaContent(head, "og:site_name"),
    section: sectionLink(source, pageUrl),
    author: squash(jsonLd.author) || metaContent(head, "author"),
    publishedAt: jsonLd.datePublished || metaContent(head, "article:published_time"),
    language: (source.match(/<html\b[^>]*\blang=["']?([a-zA-Z-]+)/i)?.[1] ?? "").toLowerCase(),
    wordCount: words,
    headings: blocks
      .filter((block) => block.type === "heading")
      .map(({ level, text }) => ({ level, text })),
    images: images.slice(0, 20),
    blocks,
  };
}

// Çıkarılan içeriği modele verilecek düz metne çevirir.
// Uzun kaynak blok sınırında kesilir (cümle ortasında değil); kesildiyse
// alınamayan ilk başlık `missingFrom` olarak bildirilir.
export function sourceToText(article, maxChars = 30_000) {
  const lines = [];
  for (const block of article.blocks) {
    if (block.type === "heading") lines.push(`${"#".repeat(Math.min(Math.max(block.level, 1), 6))} ${block.text}`);
    else if (block.type === "paragraph") lines.push(block.text);
    else if (block.type === "quote") lines.push(`> ${block.text}`);
    else if (block.type === "code") lines.push("```\n" + block.text + "\n```");
    else if (block.type === "list") {
      lines.push(block.items.map((item, index) => (block.ordered ? `${index + 1}. ${item}` : `- ${item}`)).join("\n"));
    } else if (block.type === "table") {
      lines.push(block.rows.map((row) => `| ${row.join(" | ")} |`).join("\n"));
    } else if (block.type === "image" && block.alt) lines.push(`[Görsel: ${block.alt}]`);
  }
  return fitLines(lines, maxChars);
}

export function fitLines(lines, maxChars) {
  const text = lines.join("\n\n");
  if (text.length <= maxChars) return { text, truncated: false, missingFrom: "" };
  const kept = [];
  let size = 0;
  let index = 0;
  for (; index < lines.length; index += 1) {
    const extra = lines[index].length + (kept.length ? 2 : 0);
    if (size + extra > maxChars) break;
    kept.push(lines[index]);
    size += extra;
  }
  // Tek blok bile sığmıyorsa en azından baş kısmı verilir.
  if (kept.length === 0) return { text: text.slice(0, maxChars), truncated: true, missingFrom: "" };
  const missingFrom = lines.slice(index).find((line) => /^#{1,6} /.test(line))?.replace(/^#+ /, "") ?? "";
  return { text: kept.join("\n\n"), truncated: true, missingFrom };
}
