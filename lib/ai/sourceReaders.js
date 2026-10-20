// Kaynak URL'yi okuyan sağlayıcı zinciri: yerel okuyucu → Jina Reader →
// Firecrawl → tarayıcı (Playwright). Bir sağlayıcı yalnızca yeterli ve anlamlı
// makale metni döndürdüğünde başarılı sayılır; HTTP 200 tek başına yetmez.
// URL, hiçbir sağlayıcıya gönderilmeden önce herkese açık olduğu doğrulanır.
import { ExtractError, extractArticle, fitLines, sourceToText } from "./extract.js";
import { UnsafeUrlError } from "./netguard.js";
import { cooldownFor, markFailure, markSuccess } from "./providerHealth.js";
import { PageFetchError, assertPublicUrl, fetchPage } from "./safeFetch.js";

export class ReaderError extends Error {
  // kind: "notfound" | "blocked" | "unreachable" | "thin" | "quota" | "rate" | "server" | "timeout" | "config"
  constructor(message, kind, { retryAfter = null } = {}) {
    super(message);
    this.kind = kind;
    this.retryAfter = retryAfter;
  }
}

export const PROVIDERS = ["local", "jina", "firecrawl", "browser"];
export const PROVIDER_LABELS = {
  local: "Yerel okuyucu",
  jina: "Jina Reader",
  firecrawl: "Firecrawl",
  browser: "Tarayıcı (Playwright)",
};

export const MIN_WORDS = 250;
const MAX_CHARS = 36_000;
const MAX_IMAGES = 20;
const PROVIDER_TIMEOUT_MS = 20_000;

const countWords = (text) => (String(text ?? "").match(/[\p{L}\p{N}]+/gu) ?? []).length;

// Çerez bildirimi, giriş duvarı, "JavaScript'i etkinleştirin" gibi metinler
// makale sayılmaz. Uzun gerçek bir makalede bu ifadelerin geçmesi sorun değildir.
const NOISE = /(enable javascript|javascript'i etkinle|access denied|erişim engellendi|verify you are human|captcha|robot olmadığınızı|cookie|çerez|sign in to continue|oturum açın|subscribe to continue)/i;

export function assessText(text) {
  const words = countWords(text);
  if (words < MIN_WORDS) {
    return { ok: false, words, reason: `Yalnızca ${words} sözcük okunabildi; makale için yetersiz.` };
  }
  const paragraphs = String(text)
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const prose = paragraphs.filter((part) => !/^[#>|`-]|^\d+\./.test(part) && countWords(part) >= 12);
  if (prose.length < 3) {
    return { ok: false, words, reason: "Metin çoğunlukla menü, bağlantı ya da kısa satırlardan oluşuyor." };
  }
  if (words < 600 && NOISE.test(text)) {
    return { ok: false, words, reason: "Sayfa çerez bildirimi, giriş ya da doğrulama ekranı döndürüyor." };
  }
  return { ok: true, words, reason: "" };
}

function absolute(src, base) {
  try {
    const url = new URL(String(src ?? "").trim(), base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

// Görsel listesi: yalnızca http(s), tekrarsız, izleme pikselleri ve ikonlar atılır.
export function normalizeImages(images, base) {
  const seen = new Set();
  const out = [];
  for (const image of images ?? []) {
    const src = absolute(image?.src, base);
    if (!src || seen.has(src)) continue;
    if (/\.(svg|ico)(\?|$)|pixel|tracking|spacer|1x1|gravatar|logo/i.test(src)) continue;
    seen.add(src);
    out.push({
      src,
      alt: String(image.alt ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
      role: image.role === "og" ? "og" : "content",
      section: String(image.section ?? "").replace(/\s+/g, " ").trim().slice(0, 160),
    });
    if (out.length === MAX_IMAGES) break;
  }
  return out;
}

// Jina ve Firecrawl'ın Markdown çıktısını yerel okuyucunun metin biçimine çevirir:
// başlıklar, listeler ve tablolar korunur; bağlantılar metne iner; görseller ayrılır.
export function markdownToSource(markdown, base) {
  const images = [];
  // Her görsel, üstündeki en yakın H2-H6 başlığıyla (kaynaktaki bölümüyle) tutulur.
  let section = "";
  const withSections = String(markdown ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => {
      const heading = line.match(/^#{2,6}\s+(.+?)\s*#*$/);
      if (heading) section = heading[1].replace(/[*_`]/g, "").trim();
      return line.replace(/!\[/g, `!\u0000${section.replace(/[\u0000\]]/g, "")}\u0000[`);
    })
    .join("\n");
  const text = withSections
    // Bağlantılı görsel: [![alt](src)](href)
    .replace(/\[!\u0000([^\u0000]*)\u0000\[([^\]]*)\]\(([^)\s]+)[^)]*\)\]\([^)]*\)/g, (match, section, alt, src) => {
      images.push({ src, alt, role: "content", section });
      return alt ? `[Görsel: ${alt}]` : "";
    })
    .replace(/!\u0000([^\u0000]*)\u0000\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (match, section, alt, src) => {
      images.push({ src, alt, role: "content", section });
      return alt ? `[Görsel: ${alt}]` : "";
    })
    .replace(/!\u0000[^\u0000]*\u0000\[/g, "![")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/^(\s*[-*_]){3,}\s*$/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const fitted = fitLines(text.split(/\n{2,}/), MAX_CHARS);
  return { text: fitted.text, truncated: fitted.truncated, missingFrom: fitted.missingFrom, images: normalizeImages(images, base) };
}

// --- Sağlayıcılar ---------------------------------------------------------------

async function readLocal(url) {
  try {
    const page = await fetchPage(url.href);
    const article = extractArticle(page.html, page.finalUrl);
    const { text, truncated, missingFrom } = sourceToText(article, MAX_CHARS);
    return {
      url: article.canonicalUrl || page.finalUrl,
      title: article.title || article.metaTitle || "",
      text,
      truncated,
      missingFrom,
      images: normalizeImages(article.images, page.finalUrl),
    };
  } catch (error) {
    if (error instanceof UnsafeUrlError) throw new ReaderError(error.message, "blocked");
    if (error instanceof ExtractError) throw new ReaderError(error.message, "thin");
    if (error instanceof PageFetchError) {
      const kind = /bulunamadı/.test(error.message) || error.status === 404 || error.status === 410 ? "notfound" : /zamanında/.test(error.message) ? "timeout" : "unreachable";
      throw new ReaderError(error.message, kind);
    }
    throw error;
  }
}

function httpFailure(provider, response) {
  const retryAfter = response.headers.get("retry-after");
  const status = response.status;
  if (status === 429) return new ReaderError(`${PROVIDER_LABELS[provider]} hız sınırına takıldı.`, "rate", { retryAfter });
  if (status === 402) return new ReaderError(`${PROVIDER_LABELS[provider]} kotası ya da kredisi bitti.`, "quota");
  if (status === 401 || status === 403) return new ReaderError(`${PROVIDER_LABELS[provider]} anahtarı geçersiz ya da yetkisiz.`, "config");
  if (status >= 500) return new ReaderError(`${PROVIDER_LABELS[provider]} geçici bir sunucu hatası verdi (${status}).`, "server");
  return new ReaderError(`${PROVIDER_LABELS[provider]} sayfayı okuyamadı (${status}).`, "unreachable");
}

async function callJson(provider, fetchImpl, resource, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(resource, { ...init, signal: controller.signal });
    if (!response.ok) throw httpFailure(provider, response);
    return await response.json();
  } catch (error) {
    if (error instanceof ReaderError) throw error;
    if (controller.signal.aborted) throw new ReaderError(`${PROVIDER_LABELS[provider]} zamanında yanıt vermedi.`, "timeout");
    throw new ReaderError(`${PROVIDER_LABELS[provider]} hizmetine ulaşılamadı.`, "server");
  } finally {
    clearTimeout(timer);
  }
}

// Sağlayıcı sayfayı okudu ama hedef sunucu hata döndürdüyse (ör. 404 sayfası)
// içerik makale sayılmaz.
function targetFailure(provider, status) {
  if (!Number.isFinite(status) || status < 400) return;
  if (status === 404 || status === 410) throw new ReaderError(`${PROVIDER_LABELS[provider]}: hedef sayfa bulunamadı (${status}).`, "notfound");
  throw new ReaderError(`${PROVIDER_LABELS[provider]}: hedef sayfa hata döndürdü (${status}).`, "unreachable");
}

// Jina Reader: anahtar varsa kullanılır; yoksa anahtarsız ücretsiz erişim (düşük hız sınırı).
async function readJina(url, { fetchImpl, env, timeoutMs }) {
  const headers = {
    accept: "application/json",
    "x-return-format": "markdown",
    "x-with-images-summary": "true",
    // Menü, alt bilgi ve çerez bantları makale metnine karışmasın.
    "x-remove-selector": "header, nav, footer, aside, [role=navigation], [role=banner], [aria-label*=cookie i], [class*=cookie], [id*=cookie]",
    "x-timeout": String(Math.max(5, Math.floor(timeoutMs / 1000) - 2)),
  };
  if (env.JINA_API_KEY) headers.authorization = `Bearer ${env.JINA_API_KEY}`;
  const body = await callJson("jina", fetchImpl, `https://r.jina.ai/${url.href}`, { headers }, timeoutMs);
  const data = body?.data ?? {};
  targetFailure("jina", Number(data.httpStatus));
  const parsed = markdownToSource(data.content, url.href);
  const summary = data.images && typeof data.images === "object" ? data.images : {};
  const extra = Object.entries(summary).map(([label, src]) => ({ src, alt: String(label).replace(/^Image \d+:\s*/i, ""), role: "content" }));
  return {
    url: data.url || url.href,
    title: String(data.title ?? "").trim(),
    text: parsed.text,
    truncated: parsed.truncated,
    missingFrom: parsed.missingFrom,
    images: normalizeImages([...parsed.images, ...extra], url.href),
  };
}

// Firecrawl: yalnızca FIRECRAWL_API_KEY tanımlıysa denenir.
async function readFirecrawl(url, { fetchImpl, env, timeoutMs }) {
  const body = await callJson(
    "firecrawl",
    fetchImpl,
    "https://api.firecrawl.dev/v1/scrape",
    {
      method: "POST",
      headers: { authorization: `Bearer ${env.FIRECRAWL_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ url: url.href, formats: ["markdown"], onlyMainContent: true, timeout: Math.max(5000, timeoutMs - 2000) }),
    },
    timeoutMs
  );
  if (body?.success === false) throw new ReaderError(`Firecrawl sayfayı okuyamadı: ${String(body.error ?? "").slice(0, 160)}`, "unreachable");
  const data = body?.data ?? {};
  const meta = data.metadata ?? {};
  targetFailure("firecrawl", Number(meta.statusCode));
  const parsed = markdownToSource(data.markdown, meta.sourceURL || url.href);
  const og = meta.ogImage ? [{ src: meta.ogImage, alt: "", role: "og" }] : [];
  return {
    url: meta.sourceURL || url.href,
    title: String(meta.title ?? meta.ogTitle ?? "").trim(),
    text: parsed.text,
    truncated: parsed.truncated,
    missingFrom: parsed.missingFrom,
    images: normalizeImages([...og, ...parsed.images], url.href),
  };
}

async function readBrowserDefault(url, options) {
  const { readWithBrowser } = await import("./browserReader.js");
  return readWithBrowser(url, options);
}

export const DEFAULT_READERS = { local: readLocal, jina: readJina, firecrawl: readFirecrawl, browser: readBrowserDefault };

// Sağlayıcının bu ortamda denenip denenemeyeceği; denenemiyorsa nedeni.
export function availability(provider, env = process.env) {
  if (provider === "firecrawl" && !env.FIRECRAWL_API_KEY) return "FIRECRAWL_API_KEY tanımlı değil.";
  if (provider === "browser") {
    if (env.VERCEL) return "Bu barındırma ortamında (Vercel) tarayıcı okuyucusu kullanılamıyor.";
    if (env.PLAYWRIGHT_READER !== "1") return "Tarayıcı okuyucusu kapalı (PLAYWRIGHT_READER=1 değil).";
  }
  return null;
}

const minutes = (ms) => Math.max(1, Math.ceil(ms / 60_000));

// Arayüzdeki "Kaynak okuma yöntemi" seçenekleri: bu sunucuda hangi okuyucunun
// gerçekten kullanılabildiği ve kullanılamıyorsa nedeni (gizli değer içermez).
const FRIENDLY_REASON = {
  firecrawl: "Bu sunucuda Firecrawl anahtarı yapılandırılmamış.",
};
export function providerOptions(env = process.env) {
  return PROVIDERS.map((key) => {
    const reason = availability(key, env);
    return {
      key,
      label: PROVIDER_LABELS[key],
      available: !reason,
      reason: reason ? (FRIENDLY_REASON[key] ?? reason) : "",
      paid: key === "firecrawl",
    };
  });
}

// Zinciri çalıştırır. `onEvent` her aşamada { stage, status, message } alır:
// status: "start" | "ok" | "thin" | "failed" | "skipped".
export async function readSource(
  input,
  {
    onEvent = () => {},
    fetchImpl = fetch,
    env = process.env,
    budgetMs = 50_000,
    checkUrl = assertPublicUrl,
    readers = DEFAULT_READERS,
    now = () => Date.now(),
    only = null, // belirli bir okuyucu: yalnızca o denenir (zincir ilerlemez)
  } = {}
) {
  // Özel ağ ya da var olmayan bir adres hiçbir sağlayıcıya gönderilmez.
  let url;
  try {
    url = await checkUrl(input);
  } catch (error) {
    if (error instanceof UnsafeUrlError) throw new ReaderError(error.message, "blocked");
    if (error instanceof PageFetchError) throw new ReaderError(error.message, /bulunamadı/.test(error.message) ? "notfound" : "unreachable");
    throw error;
  }

  const deadline = now() + budgetMs;
  const attempts = [];
  const report = (stage, status, message = "", extra = {}) => {
    const event = { stage, label: PROVIDER_LABELS[stage], status, message, ...extra };
    if (status !== "start") attempts.push(event);
    onEvent(event);
  };

  if (only && !PROVIDERS.includes(only)) throw new ReaderError("Bilinmeyen okuma yöntemi.", "config");
  if (only) {
    const unavailable = availability(only, env);
    if (unavailable) throw new ReaderError(`${PROVIDER_LABELS[only]} bu sunucuda kullanılamıyor: ${FRIENDLY_REASON[only] ?? unavailable}`, "config");
  }

  for (const provider of only ? [only] : PROVIDERS) {
    const unavailable = availability(provider, env);
    if (unavailable) {
      report(provider, "skipped", unavailable);
      continue;
    }
    const cooling = cooldownFor(provider, now());
    if (cooling) {
      report(provider, "skipped", `Son denemede ${cooling.kind === "quota" ? "kota bitti" : "hız sınırına takıldı"}; yaklaşık ${minutes(cooling.until - now())} dk sonra yeniden denenecek.`);
      continue;
    }
    const remaining = deadline - now();
    if (remaining < 4_000) {
      report(provider, "skipped", "Süre bütçesi doldu.");
      continue;
    }

    report(provider, "start");
    try {
      const result = await readers[provider](url, { fetchImpl, env, timeoutMs: Math.min(PROVIDER_TIMEOUT_MS, remaining - 1_000) });
      const quality = assessText(result.text);
      if (!quality.ok) {
        report(provider, "thin", quality.reason, { words: quality.words });
        continue;
      }
      markSuccess(provider);
      report(provider, "ok", `${quality.words} sözcük okundu, ${result.images.length} görsel bulundu.`, { words: quality.words });
      return { source: { ...result, provider, wordCount: quality.words }, attempts };
    } catch (error) {
      if (!(error instanceof ReaderError)) {
        report(provider, "failed", "Beklenmeyen bir hata oluştu.");
        continue;
      }
      if (["rate", "quota", "server", "timeout"].includes(error.kind) && provider !== "local") {
        markFailure(provider, error.kind, { retryAfter: error.retryAfter, now: now() });
      }
      report(provider, "failed", error.message, { kind: error.kind });
      // Alan adı yoksa ya da adres engellendiyse diğer sağlayıcılar da sonuç veremez.
      if (provider === "local" && (error.kind === "notfound" || error.kind === "blocked")) throw error;
    }
  }

  return { source: null, attempts, fallback: "screenshots" };
}
