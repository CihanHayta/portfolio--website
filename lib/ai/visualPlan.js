// Makalenin görsel planı: hangi bölüme hangi tür görsel gerektiği, neden ve
// nasıl üretileceği. Saf yardımcılar istemci, sunucu ve testlerce kullanılır;
// yapay zekâ çağrısı API rotasındadır.

import { contentText } from "../blog/blocks/model.js";

export const VISUAL_KINDS = {
  cover: "Kapak",
  section: "Bölüm görseli",
  infographic: "İnfografik / şema",
  comparison: "Karşılaştırma",
  example: "Örnek",
};
export const VISUAL_ASPECTS = ["16:9", "3:2", "4:3", "1:1", "9:16"];
const DEFAULT_NEGATIVE = "text, letters, words, watermark, logo, signature, brand names, blurry, distorted faces, extra fingers";
const CLOSING = /sonuç|özet|son söz|toparla|sık sorulan|\bsss\b|ilgili yazı|kaynaklar|kaynakça|iletişim/i;

const clip = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const words = (text) => (String(text ?? "").match(/[\p{L}\p{N}]+/gu) ?? []).length;
const fold = (text) => String(text ?? "").toLocaleLowerCase("tr-TR").replace(/[^\p{L}\p{N}\s]/gu, " ");

// Editördeki bloklardan H2/H3 bölümleri: { id, level, heading, text, words }.
export function draftSections(blocks = []) {
  const sections = [];
  let current = null;
  for (const block of blocks) {
    if (block.type === "heading" && (block.props?.level === "2" || block.props?.level === "3")) {
      current = { id: block.id, level: Number(block.props.level), heading: clip(block.props.text, 160), blocks: [] };
      sections.push(current);
    } else if (current) {
      current.blocks.push(block);
    }
  }
  return sections.map(({ blocks: inner, ...section }) => {
    const text = contentText({ type: "blocks", version: 1, blocks: inner });
    return { ...section, text: clip(text, 600), words: words(text) };
  });
}

// Görsel sayısı makaleye göre değişir: kapak + uzunluk/bölüm sayısına göre bölüm görselleri.
export function visualBudget(totalWords, sectionCount) {
  const inline = Math.min(sectionCount, Math.max(0, Math.round(totalWords / 450)));
  return Math.max(1, Math.min(8, 1 + inline));
}

export const VISUAL_PLAN_SCHEMA = {
  type: "OBJECT",
  properties: {
    analysis: {
      type: "OBJECT",
      properties: {
        topic: { type: "STRING" },
        subtopics: { type: "ARRAY", items: { type: "STRING" } },
        audience: { type: "STRING" },
        intent: { type: "STRING", enum: ["bilgi", "nasıl yapılır", "karşılaştırma", "ticari", "haber"] },
        sections: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: { sectionId: { type: "STRING" }, question: { type: "STRING" }, mainIdea: { type: "STRING" }, concepts: { type: "ARRAY", items: { type: "STRING" } } },
            required: ["sectionId", "question", "mainIdea"],
          },
        },
      },
      required: ["topic", "audience", "intent", "sections"],
    },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          target: { type: "STRING", description: "\"cover\" ya da bölüm kimliği (sectionId)" },
          kind: { type: "STRING", enum: Object.keys(VISUAL_KINDS) },
          purpose: { type: "STRING" },
          description: { type: "STRING" },
          composition: { type: "STRING" },
          aspect: { type: "STRING", enum: VISUAL_ASPECTS },
          prompt: { type: "STRING", description: "İngilizce, metin içermeyen özgün görsel üretim istemi" },
          negative: { type: "STRING" },
          alt: { type: "STRING" },
          caption: { type: "STRING" },
          sourceImage: { type: "INTEGER", description: "Kaynak görsel numarası; yoksa -1" },
          priority: { type: "INTEGER", description: "1 en önemli, 3 isteğe bağlı" },
        },
        required: ["target", "kind", "purpose", "composition", "aspect", "prompt", "alt", "priority"],
      },
    },
    skip: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { sectionId: { type: "STRING" }, reason: { type: "STRING" } }, required: ["sectionId", "reason"] },
    },
  },
  required: ["analysis", "items"],
};

export const VISUAL_PLAN_SYSTEM = `Sen bir Türk dijital pazarlama blogunun görsel editörüsün. Görevin makalenin görsel planını çıkarmak.
Kurallar:
- Her bölüme zorla görsel koyma. Görsel yalnızca okuyucunun anlamasına yardım ediyorsa önerilir; gereksiz bölümleri "skip" listesine gerekçesiyle yaz.
- Kapak görseli ana konuyu ilk bakışta anlatır; en fazla bir kapak önerilir (target: "cover").
- Karmaşık bir kavram için infografik/şema, iki yaklaşım için karşılaştırma görseli öner.
- "prompt" İngilizce, özgün ve metinsiz (yazı, logo, marka adı, filigran yok) bir sahne tarifidir; gerçek kişi ya da marka taklidi yok.
- "alt" ve "caption" Türkçe, görseli tarif eder; anahtar kelime doldurma yapma.
- Kaynak görsel uygunsa "sourceImage" alanına numarasını yaz; lisans durumu ayrıca kontrol edilecektir.
- Yalnızca verilen bölüm kimliklerini kullan.`;

export function buildVisualPlanPrompt({ title, sections, source, budget }) {
  const outline = sections.map((section) => `- [${section.id}] H${section.level} "${section.heading}" (${section.words} sözcük): ${section.text}`).join("\n");
  const images = (source?.images ?? []).slice(0, 20).map((image, index) => `${index}. "${clip(image.alt, 120) || "alt metin yok"}" — bölüm: ${clip(image.section, 80) || "bilinmiyor"}`).join("\n");
  const sourceHeadings = (String(source?.text ?? "").match(/^#{1,6}\s+.+$/gm) ?? []).slice(0, 60).join("\n");
  return [
    `Yazı başlığı: ${clip(title, 200) || "(başlıksız)"}`,
    `En fazla ${budget} görsel öner (kapak dahil). Daha azı yeterliyse daha az öner.`,
    `\nTaslaktaki bölümler (kimlik, seviye, başlık, özet):\n${outline || "(bölüm yok — yalnızca kapak öner)"}`,
    source?.url ? `\nKaynak makale: ${source.url}${source.title ? ` — "${clip(source.title, 160)}"` : ""} (${source.wordCount ?? "?"} sözcük${source.truncated ? `, kısmen okundu; eksik kısım: ${clip(source.missingFrom, 120)} sonrası` : ""})` : "\nKaynak makale yok.",
    sourceHeadings ? `\nKaynağın başlık iskeleti:\n${sourceHeadings}` : "",
    source?.text ? `\nKaynak metin (ilk bölüm):\n${String(source.text).slice(0, 12_000)}` : "",
    images ? `\nKaynak görseller (numara, alt metin, bölüm):\n${images}` : "",
  ].filter(Boolean).join("\n");
}

// Kaynak görseli bölüm başlığına en çok benzeyen bölümle eşleştirir.
function matchSourceImage(section, images) {
  if (!section) return -1;
  const target = new Set(fold(section.heading).split(/\s+/).filter((word) => word.length > 3));
  let best = -1;
  let bestScore = 0;
  images.forEach((image, index) => {
    const score = fold(image.section).split(/\s+/).filter((word) => target.has(word)).length;
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}

// Modelin yanıtını doğrular: bilinmeyen bölüm, ikinci kapak, aynı bölüme aynı
// türde tekrar ve bütçe aşımı atılır. Kaynak görsel dizini gerçek görsele çevrilir.
export function normalizeVisualPlan(raw, { sections = [], sourceImages = [], budget = 4 } = {}) {
  const byId = new Map(sections.map((section) => [section.id, section]));
  const seen = new Set();
  let hasCover = false;
  const items = [];
  const rawItems = Array.isArray(raw?.items) ? raw.items : [];
  const sorted = [...rawItems].sort((a, b) => (a?.target === "cover" ? -1 : b?.target === "cover" ? 1 : (Number(a?.priority) || 3) - (Number(b?.priority) || 3)));

  for (const item of sorted) {
    if (!item || typeof item !== "object") continue;
    const target = item.target === "cover" ? "cover" : byId.has(item.target) ? item.target : null;
    if (!target) continue;
    if (target === "cover") {
      if (hasCover) continue;
      hasCover = true;
    } else if (CLOSING.test(byId.get(target).heading)) {
      continue; // Sonuç/SSS/İletişim gibi kapanış bölümlerine görsel konmaz
    }
    const kind = target === "cover" ? "cover" : Object.hasOwn(VISUAL_KINDS, item.kind) && item.kind !== "cover" ? item.kind : "section";
    const dedupe = `${target}|${kind}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const prompt = clip(item.prompt, 900);
    if (!prompt) continue;

    const section = byId.get(target) ?? null;
    let index = Number.isInteger(item.sourceImage) && item.sourceImage >= 0 && item.sourceImage < sourceImages.length ? item.sourceImage : -1;
    if (index < 0 && target !== "cover") index = matchSourceImage(section, sourceImages);
    const sourceImage = index >= 0 ? sourceImages[index] : null;

    items.push({
      id: `v${items.length + 1}`,
      target,
      heading: section?.heading ?? "Kapak",
      kind,
      purpose: clip(item.purpose, 220),
      description: clip(item.description, 400),
      composition: clip(item.composition, 300),
      aspect: VISUAL_ASPECTS.includes(item.aspect) ? item.aspect : target === "cover" ? "16:9" : "3:2",
      prompt,
      negative: clip(item.negative, 300) || DEFAULT_NEGATIVE,
      alt: clip(item.alt, 300),
      caption: clip(item.caption, 300),
      sourceImage: sourceImage ? { src: sourceImage.src, alt: clip(sourceImage.alt, 300), section: clip(sourceImage.section, 160) } : null,
      priority: Math.min(3, Math.max(1, Number(item.priority) || 2)),
      status: "planned",
    });
    if (items.length >= budget) break;
  }

  const skipped = (Array.isArray(raw?.skip) ? raw.skip : [])
    .filter((entry) => byId.has(entry?.sectionId))
    .map((entry) => ({ sectionId: entry.sectionId, heading: byId.get(entry.sectionId).heading, reason: clip(entry.reason, 200) }));

  const analysis = raw?.analysis && typeof raw.analysis === "object"
    ? {
        topic: clip(raw.analysis.topic, 200),
        subtopics: (raw.analysis.subtopics ?? []).map((value) => clip(value, 120)).filter(Boolean).slice(0, 10),
        audience: clip(raw.analysis.audience, 200),
        intent: clip(raw.analysis.intent, 40),
        sections: (raw.analysis.sections ?? []).filter((entry) => byId.has(entry?.sectionId)).map((entry) => ({ sectionId: entry.sectionId, question: clip(entry.question, 200), mainIdea: clip(entry.mainIdea, 300), concepts: (entry.concepts ?? []).map((value) => clip(value, 60)).slice(0, 8) })),
      }
    : null;

  return { items, skipped, analysis };
}

// --- Kaynak görselden özgün görsel: kullanıcı seçenekleri ---------------------------
export const REFERENCE_OPTIONS = {
  inspire: { label: "Kompozisyondan ilham al", text: "Use the reference only as loose inspiration for composition; create a new original scene." },
  palette: { label: "Renk paletini koru", text: "Keep the reference image's color palette." },
  background: { label: "Arka planı değiştir", text: "Replace the background with a new, different setting." },
  angle: { label: "Farklı açı / kadraj", text: "Use a different camera angle and framing than the reference." },
  environment: { label: "Başka bir ortamda", text: "Place the main idea in a different environment." },
  idea: { label: "Ana fikri koru, yeni kompozisyon", text: "Keep the core idea but build a completely new composition." },
};
export const REFERENCE_FORMATS = {
  cover: { label: "Blog kapağı", aspect: "16:9" },
  inline: { label: "Bölüm içi", aspect: "3:2" },
  social: { label: "Dikey sosyal medya", aspect: "9:16" },
};

// Referans istemi: kopyalama değil, yeni bir görsel. Filigran/logo/marka taşınmaz.
export function buildReferencePrompt(basePrompt, options = [], format = "inline") {
  const chosen = options.filter((key) => Object.hasOwn(REFERENCE_OPTIONS, key));
  const lines = [
    clip(basePrompt, 700),
    ...(chosen.length ? chosen : ["inspire"]).map((key) => REFERENCE_OPTIONS[key].text),
    "Do not copy the reference pixel by pixel. Do not reproduce any watermark, logo, brand mark, text or identifiable person from the reference.",
  ];
  return { prompt: lines.join(" "), aspect: (REFERENCE_FORMATS[format] ?? REFERENCE_FORMATS.inline).aspect };
}

// --- DuckDuckGo: yalnızca kullanıcının açtığı arama bağlantısı ------------------------
const STOP = new Set(["ve", "ile", "için", "bir", "bu", "da", "de", "mi", "nasıl", "nedir", "olan", "gibi", "daha", "en", "çok"]);
export function imageSearchQuery(item, title = "") {
  const base = item?.target === "cover" ? title : `${item?.heading ?? ""} ${title}`;
  const terms = fold(base).split(/\s+/).filter((word) => word.length > 1 && !STOP.has(word));
  return [...new Set(terms)].slice(0, 7).join(" ");
}
export function duckDuckGoImagesUrl(query) {
  return `https://duckduckgo.com/?${new URLSearchParams({ q: query, iax: "images", ia: "images" })}`;
}
export const ARENA_COMPARE_URL = "https://arena.ai/";
