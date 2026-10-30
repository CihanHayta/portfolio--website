import { extractArticle, fitLines, sourceToText } from "@/lib/ai/extract";
import { AiError } from "@/lib/ai/gemini";
import { generateJsonRouted as generateJson } from "@/lib/ai/textRouter";
import { errorResponse, json, readAdminRequest } from "@/lib/ai/http";
import { fetchPage } from "@/lib/ai/safeFetch";
import {
  FILL_SYSTEM,
  GOALS,
  LENGTHS,
  STATIC_LINKS,
  TONES,
  applyFill,
  buildExpandPrompt,
  buildFillPrompt,
  buildFillSchema,
  coverageReport,
  extraShareFor,
  normalizeFillFields,
  reviewFill,
  slotKey,
  slotsFromResponse,
  slotsToExpand,
  sourceOutline,
  targetWordsFor,
  templateSlots,
} from "@/lib/ai/templateFill";
import { verifiedSectionMap } from "@/lib/blog/blocks/imageSections";
import { uniqueSlug } from "@/lib/ai/uniqueSlug";
import { contentText, sanitizeBlocks } from "@/lib/blog/blocks/model";
import { instantiateTemplate, templateByKey } from "@/lib/blog/blocks/templates";
import { readApproaches } from "@/lib/ai/approaches";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SOURCE_CHARS = 36_000;
const MAX_TOTAL_SOURCE_CHARS = 40_000;
const SOURCE_KINDS = new Set(["url", "screenshots", "text"]);
const LENGTH_CHOICES = { ...LENGTHS, auto: null };
// Tek istekte üretilen en fazla sözcük: uzun hedeflerde ilk tur bu kadarını
// yazar, kalan kısım genişletme turlarıyla tamamlanır. Böylece her istek
// Vercel'in 60 saniyelik sınırının güvenle altında kalır (ölçüm: 2.500 sözcük
// istenen tek istek ~48 sn, 1.800 istenen ~45 sn sürdü).
const FIRST_PASS_MAX_WORDS = 1500;

const clip = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const pick = (value, options, fallback) => (Object.hasOwn(options, value) ? value : fallback);
const countWords = (text) => (String(text ?? "").match(/[\p{L}\p{N}]+/gu) ?? []).length;

// Stüdyonun önceden okuduğu kaynaklar (URL, ekran görüntüsü, kullanıcı metni).
// Güvenilmeyen veridir: tür, uzunluk ve adres biçimi burada sınırlanır. Uzun
// metin paragraf sınırında kesilir ve alınamayan ilk başlık bildirilir.
function readSources(value) {
  let budget = MAX_TOTAL_SOURCE_CHARS;
  const out = [];
  for (const raw of Array.isArray(value) ? value.slice(0, 3) : []) {
    if (!raw || !SOURCE_KINDS.has(raw.kind)) continue;
    const full = String(raw.text ?? "").trim();
    if (full.length < 40 || budget < 40) continue;
    const fitted = fitLines(full.split(/\n{2,}/), Math.min(MAX_SOURCE_CHARS, budget));
    budget -= fitted.text.length;
    let url = "";
    try {
      const parsed = new URL(String(raw.url ?? ""));
      if (parsed.protocol === "https:" || parsed.protocol === "http:") url = parsed.href;
    } catch {
      // adres yoksa ya da geçersizse boş kalır
    }
    out.push({
      kind: raw.kind,
      title: clip(raw.title, 200),
      url,
      text: fitted.text,
      // Okuyucunun bildirdiği gerçek kaynak uzunluğu (otomatik hedef için).
      wordCount: Math.min(50_000, Math.max(0, Number.parseInt(raw.wordCount, 10) || countWords(full))),
      truncated: Boolean(raw.truncated) || fitted.truncated,
      missingFrom: clip(fitted.missingFrom || raw.missingFrom, 160),
      unreadable: (Array.isArray(raw.unreadable) ? raw.unreadable : []).map((item) => clip(item, 200)).filter(Boolean).slice(0, 12),
    });
  }
  return out;
}

// Taslağa yerleştirilecek, kullanıcının seçtiği görseller (yalnızca kimlik,
// alt metin ve kaynaktaki bölüm; dosya adresi istemciye kalır).
function readImages(value) {
  return (Array.isArray(value) ? value.slice(0, 12) : [])
    .map((image) => ({ id: clip(image?.id, 64), alt: clip(image?.alt, 300), section: clip(image?.section, 160) }))
    .filter((image) => /^[\w-]{1,64}$/.test(image.id));
}

// Arşiv karşılaştırmasından gelen, örtüşen mevcut yazılar (yalnızca başlık ve konu adları).
function readRelated(value) {
  const topics = (items) => (Array.isArray(items) ? items : []).map((item) => clip(item, 120)).filter(Boolean).slice(0, 8);
  return (Array.isArray(value) ? value.slice(0, 5) : [])
    .map((item) => ({ title: clip(item?.title, 160), covered: topics(item?.covered), gaps: topics(item?.gaps), focus: item?.focus === true }))
    .filter((item) => item.title);
}

function readBrief(body) {
  return {
    topic: clip(body.topic, 200),
    keyword: clip(body.keyword, 80),
    audience: clip(body.audience, 160),
    goal: pick(body.goal, GOALS, "inform"),
    tone: pick(body.tone, TONES, "friendly"),
    cta: clip(body.cta, 200),
    length: pick(body.length, LENGTH_CHOICES, "medium"),
  };
}

// Şablonun bloklarını (ya da editördeki yapıyı) yapay zekâyla doldurur.
// `mode: "expand"`: hedefin altında kalan bölümleri genişletir (en fazla iki
// tur, istemci yönetir). Hiçbir şey kaydetmez ya da yayımlamaz.
export async function POST(request) {
  const { admin, body, response } = await readAdminRequest(request);
  if (!admin) return response;
  return body.mode === "expand" ? expand(admin, body) : fill(admin, body);
}

async function fill(admin, body) {
  const postId = body.postId ? String(body.postId) : null;
  const template = body.templateKey ? templateByKey(String(body.templateKey)) : null;
  const brief = readBrief(body);
  const sourceUrl = clip(body.sourceUrl, 2000);
  const given = readSources(body.sources);
  const images = readImages(body.images);
  const related = readRelated(body.related);
  const angle = body.angle === true && related.some((item) => item.focus);
  const approaches = readApproaches(body.approaches);

  if ((postId && !UUID.test(postId)) || (body.templateKey && !template)) {
    return json({ error: "Geçersiz istek." }, 400);
  }
  if (brief.topic.length < 3 && !sourceUrl && given.length === 0) {
    return json({ error: "Bir konu yazın ya da kaynak bağlantısı ekleyin." }, 400);
  }

  // Editördeki yapı gönderildiyse o doldurulur (eklenen/silinen bloklar korunur);
  // yoksa seçilen şablonun temiz blokları kullanılır.
  const sent = sanitizeBlocks(body.blocks);
  const blocks = sent.length ? sent : template ? instantiateTemplate(template) : [];
  const slots = templateSlots(blocks);
  if (slots.length === 0) {
    return json({ error: "Doldurulacak bölüm bulunamadı. Önce bir şablon seçin." }, 400);
  }

  try {
    const sources = [...given];
    if (sourceUrl && !given.some((source) => source.kind === "url")) {
      const page = await fetchPage(sourceUrl);
      const article = extractArticle(page.html, page.finalUrl);
      const { text, truncated, missingFrom } = sourceToText(article, MAX_SOURCE_CHARS);
      sources.unshift({ kind: "url", url: article.canonicalUrl || page.finalUrl, title: article.title, siteName: article.siteName, sectionUrl: article.section?.url, sectionLabel: article.section?.label, text, truncated, missingFrom, wordCount: article.wordCount });
    }

    const now = new Date().toISOString();
    const [{ data: posts, error: postError }, { data: categories, error: categoryError }] = await Promise.all([
      admin.supabase
        .from("blog_posts")
        .select("title, slug")
        .eq("status", "published")
        .is("deleted_at", null)
        .lte("published_at", now)
        .order("published_at", { ascending: false })
        .limit(40),
      admin.supabase.from("blog_categories").select("id, name, slug").order("position").order("name"),
    ]);
    if (postError) throw postError;
    if (categoryError) throw categoryError;

    // İç bağlantılar yalnızca gerçekten var olan sayfalardan seçilebilir.
    const links = [
      ...STATIC_LINKS,
      ...posts.filter((post) => post.slug).map((post) => ({ href: `/blog/${post.slug}`, label: clip(post.title, 120) })),
      ...sources.filter((source) => source.url).map((source) => ({ href: source.url, label: `Kaynak: ${clip(source.title, 100) || source.url}` })),
    ];

    const targetWords = targetWordsFor(brief.length, sources);
    const hasSourceText = sources.some((source) => source.kind !== "text");
    const extraShare = hasSourceText ? extraShareFor(slots, sources) : 0;
    const result = await generateJson({
      task: "draft",
      db: admin.supabase,
      system: FILL_SYSTEM,
      prompt: buildFillPrompt({ brief, template, slots, links, categories, sources, targetWords: Math.min(targetWords, FIRST_PASS_MAX_WORDS), extraShare, images, related, angle, approaches }),
      schema: buildFillSchema(slots, { extra: extraShare > 0, coverage: hasSourceText, images: images.length > 0, mapping: hasSourceText }),
      temperature: 0.6,
      maxOutputTokens: 32_768,
      budgetMs: 52_000,
    });

    const fields = normalizeFillFields(result.data, { categorySlugs: categories.map((category) => category.slug) });
    const filled = applyFill(blocks, slotsFromResponse(result.data, slots), { links, extraSections: result.data?.extraSections });
    if (!fields || filled.filled === 0) {
      throw new AiError("Gemini şablonu dolduramadı. Yeniden dene.", "invalid");
    }

    const text = contentText({ type: "blocks", version: 1, blocks: filled.blocks });
    const sourceText = sources.map((source) => source.text).join("\n");
    const review = reviewFill({ text, targetWords, sourceText });
    const coverage = hasSourceText
      ? coverageReport({ modelCoverage: result.data?.coverage, sourceText: sources.filter((source) => source.kind !== "text").map((source) => source.text).join("\n\n"), draftText: text })
      : null;
    if (coverage && coverage.total && coverage.covered < coverage.total) {
      review.warnings.push(`Kaynağın ${coverage.total} konusundan ${coverage.total - coverage.covered} tanesi taslakta işlenmedi (aşağıdaki listeye bakın).`);
    }

    // Model, görselleri slot anahtarıyla yerleştirir; slot kimliği yeni blok kimliğine çevrilir.
    const keyToBlock = new Map(slots.map((slot) => [slotKey(slot), filled.idMap[slot.id]]));
    const imagePlacements = (Array.isArray(result.data?.imagePlacements) ? result.data.imagePlacements : [])
      .map((item) => ({ imageId: clip(item?.imageId, 64), afterBlockId: keyToBlock.get(String(item?.afterSlot ?? "")) }))
      .filter((item) => item.afterBlockId && images.some((image) => image.id === item.imageId));

    // Bölüm eşlemesi: yalnızca kaynakta GERÇEKTEN geçen başlıklar kalır (görsellerin
    // hangi bölüme ait olduğu bununla doğrulanır; uydurma eşleşme sayılmaz).
    const rawMap = {};
    for (const item of Array.isArray(result.data?.sectionSources) ? result.data.sectionSources : []) {
      const blockId = keyToBlock.get(String(item?.slot ?? ""));
      if (blockId && item?.sourceHeading) rawMap[blockId] = clip(item.sourceHeading, 160);
    }
    for (const item of filled.extraHeadings) rawMap[item.blockId] = item.sourceHeading;
    const outlineHeadings = sources.filter((source) => source.kind !== "text").flatMap((source) => sourceOutline(source.text, 200).map((heading) => heading.text));
    const sectionMap = verifiedSectionMap(rawMap, outlineHeadings);

    const { categorySlug, ...rest } = fields;
    return json({
      blocks: filled.blocks,
      fields: {
        ...rest,
        slug: await uniqueSlug(admin.supabase, rest.slug || "yazi", postId),
        categoryId: categories.find((category) => category.slug === categorySlug)?.id ?? "",
      },
      stats: {
        filled: filled.filled,
        unfilled: filled.unfilled,
        dropped: filled.dropped,
        extraSections: filled.extra,
        words: review.words,
        targetWords,
        auto: brief.length === "auto",
      },
      warnings: review.warnings,
      coverage,
      imagePlacements,
      sectionMap,
      source: sources[0] ? { url: sources[0].url, title: sources[0].title } : null,
      sources: sources.map(({ kind, url, title, siteName, sectionUrl, sectionLabel, unreadable, truncated, missingFrom, wordCount }) => ({ kind, url, title, siteName, sectionUrl, sectionLabel, unreadable, truncated, missingFrom, wordCount })),
      model: result.model,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

// Hedefin altında kalan slotları genişletir. Yalnızca bu slotlar istenir ve
// değişir; diğer bölümler olduğu gibi kalır.
async function expand(admin, body) {
  const template = body.templateKey ? templateByKey(String(body.templateKey)) : null;
  const brief = readBrief(body);
  const blocks = sanitizeBlocks(body.blocks);
  const targetWords = Math.min(3000, Math.max(300, Number.parseInt(body.targetWords, 10) || 0));
  const sources = readSources(body.sources);
  const missingTopics = (Array.isArray(body.missingTopics) ? body.missingTopics : []).map((item) => clip(item, 160)).filter(Boolean).slice(0, 12);
  if (!blocks.length || !targetWords) return json({ error: "Geçersiz istek." }, 400);

  const items = slotsToExpand(blocks, targetWords);
  const before = countWords(contentText({ type: "blocks", version: 1, blocks }));
  if (!items.length) {
    return json({ blocks, stats: { words: before, targetWords, expanded: 0 }, warnings: [] });
  }

  try {
    const links = [
      ...STATIC_LINKS,
      ...(Array.isArray(body.links) ? body.links : [])
        .map((link) => ({ href: clip(link?.href, 500), label: clip(link?.label, 120) }))
        .filter((link) => /^(\/blog\/[\w-]+|https?:\/\/\S+)$/.test(link.href)),
      ...sources.filter((source) => source.url).map((source) => ({ href: source.url, label: `Kaynak: ${clip(source.title, 100) || source.url}` })),
    ];
    const selected = items.map((item) => item.slot);
    const result = await generateJson({
      task: "draft-expand",
      db: admin.supabase,
      system: FILL_SYSTEM,
      prompt: buildExpandPrompt({ brief, template, items, blocks, missingTopics, links, sources }),
      schema: buildFillSchema(selected, { seo: false, append: true }),
      temperature: 0.5,
      maxOutputTokens: 32_768,
      budgetMs: 52_000,
    });
    const filled = applyFill(blocks, slotsFromResponse(result.data, selected), { links, keepIds: true });
    const text = contentText({ type: "blocks", version: 1, blocks: filled.blocks });
    const review = reviewFill({ text, targetWords, sourceText: sources.map((source) => source.text).join("\n") });
    // Genişletme metni kısaltmışsa (beklenmeyen) önceki taslak korunur.
    if (review.words < before) {
      return json({ blocks, stats: { words: before, targetWords, expanded: 0 }, warnings: ["Genişletme önceki taslaktan kısa çıktı; önceki taslak korundu."] });
    }
    return json({ blocks: filled.blocks, stats: { words: review.words, targetWords, expanded: filled.filled }, warnings: review.warnings, model: result.model });
  } catch (error) {
    return errorResponse(error);
  }
}
