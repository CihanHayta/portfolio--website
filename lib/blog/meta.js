// Yazının içerik dışı ayarları: tema ve kaynakça. blog_posts.content belgesinde
// `meta` alanında durur ({ type: "blocks", version: 1, blocks, meta }); böylece
// otomatik kayıt, sürüm denetimi, yedek ve geri yükleme ek şema olmadan kapsar.
//
// Kaynakça yalnızca gerçekten kullanılan kaynakları tutar. Sistem kaynak
// uydurmaz: bir kaynak ya okunan sayfadan (okuyucu sonucu) ya da yazarın elle
// girdiği adresten gelir. Kaynağı olmayan yazı yalnızca yazarın açık beyanıyla
// ("kendi deneyimime dayanıyor") yayımlanabilir.

export const THEMES = ["light", "dark"];
export const MAX_SOURCES = 30;
const SOURCE_KINDS = ["source", "research", "user"];

const clip = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// Yalnızca http/https; kullanıcı adı/şifre içeren ya da çok uzun adres reddedilir.
export function cleanUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > 2000) return "";
  let url;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "";
  if (url.username || url.password || !url.hostname.includes(".")) return "";
  url.hash = url.hash.length > 200 ? "" : url.hash;
  return url.toString();
}

export function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function cleanSource(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const url = cleanUrl(raw.url);
  if (!url) return null;
  const sectionUrl = cleanUrl(raw.sectionUrl);
  const accessed = typeof raw.accessedAt === "string" && !Number.isNaN(Date.parse(raw.accessedAt)) ? raw.accessedAt.slice(0, 30) : null;
  return {
    id: /^[a-z0-9-]{4,40}$/.test(String(raw.id ?? "")) ? raw.id : `k${index + 1}`,
    title: clip(raw.title, 200),
    siteName: clip(raw.siteName, 80),
    url,
    ...(sectionUrl && sectionUrl !== url ? { sectionUrl, sectionLabel: clip(raw.sectionLabel, 60) } : {}),
    kind: SOURCE_KINDS.includes(raw.kind) ? raw.kind : "user",
    ...(accessed ? { accessedAt: accessed } : {}),
  };
}

// Aynı adres iki kez yazılmaz; sıra korunur (atıf numaraları sıraya bağlıdır).
export function sanitizeSources(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const source = cleanSource(raw, out.length);
    if (!source) continue;
    const key = source.url.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(source);
    if (out.length >= MAX_SOURCES) break;
  }
  // Kimlikler benzersiz olmalı (tekrar varsa sırayla yeniden üretilir).
  const ids = new Set();
  return out.map((source, index) => {
    const id = ids.has(source.id) ? `k${index + 1}` : source.id;
    ids.add(id);
    return id === source.id ? source : { ...source, id };
  });
}

export function sanitizeMeta(meta) {
  if (!meta || typeof meta !== "object") return null;
  const out = {};
  if (THEMES.includes(meta.theme)) out.theme = meta.theme;
  const sources = sanitizeSources(meta.sources);
  if (sources.length) out.sources = sources;
  if (meta.sourcesWaived === true && sources.length === 0) out.sourcesWaived = true;
  return Object.keys(out).length ? out : null;
}

export function readMeta(content) {
  return sanitizeMeta(content?.meta) ?? {};
}

export const postTheme = (content) => (readMeta(content).theme === "dark" ? "dark" : "light");

// Yayın kuralı: en az bir gerçek kaynak ya da yazarın açık beyanı.
export function sourcesReady(meta) {
  const clean = sanitizeMeta(meta) ?? {};
  return (clean.sources?.length ?? 0) > 0 || clean.sourcesWaived === true;
}

export const SOURCES_REQUIRED_MESSAGE =
  "Yayınlamadan önce kaynakçayı tamamla: kullandığın kaynağı ekle ya da yazı kendi deneyimine dayanıyorsa bunu işaretle.";

// Okuyucu/şablon sonucundaki gerçek kaynakları kaynakça girdisine çevirir.
// Yalnızca gerçekten okunan sayfalar gelir; adres tahmin edilmez.
export function sourcesFromReader(items, accessedAt = new Date().toISOString()) {
  return sanitizeSources(
    (Array.isArray(items) ? items : []).map((item, index) => ({
      id: `k${index + 1}`,
      title: item?.title,
      siteName: item?.siteName,
      url: item?.url,
      sectionUrl: item?.sectionUrl,
      sectionLabel: item?.sectionLabel,
      kind: item?.kind === "research" ? "research" : "source",
      accessedAt,
    }))
  );
}

// Var olan kaynakçaya yenilerini ekler (aynı adres tekrar edilmez).
export function mergeSources(current, incoming) {
  return sanitizeSources([...(current ?? []), ...(incoming ?? [])]);
}
