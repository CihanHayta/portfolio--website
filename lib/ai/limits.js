// Uygulamanın kendi AI kullanım limitleri — TEK merkezi yapılandırma.
// Admin panelinden yalnızca bu varsayılanların üzerine yazılan değerler saklanır.
// Her limit sağlayıcının resmî üst sınırıyla (ceiling) kırpılır; sağlayıcının
// kendi limiti daha düşükse o da aşılamaz. Ücretsiz mod kilitlidir: kapatılamaz.
//
// Anahtarlar "kategori:sağlayıcı" biçimindedir; metin ve görsel ayrı sayılır.
// Uygulama limitlerinin günü Europe/Istanbul'dur (gece yarısı İstanbul saatiyle
// sıfırlanır). Cloudflare'in paylaşılan Neuron tahmini ise sağlayıcının kendi
// sıfırlamasına (00:00 UTC) göre tutulur.

export const FREE_MODE_LOCKED = true;

export const LIMIT_FIELDS = {
  enabled: { label: "Aktif", type: "boolean" },
  dailyRequests: { label: "Günlük istek", type: "count" },
  dailyTokens: { label: "Günlük token", type: "count", requires: "tokens" },
  dailyImages: { label: "Günlük görsel", type: "count", requires: "images" },
  maxConcurrent: { label: "Aynı anda iş", type: "count", min: 1 },
  maxAttempts: { label: "İstek başına deneme", type: "count", min: 1 },
  priority: { label: "Geçiş sırası (1 = önce)", type: "count", min: 1, max: 99 },
  // Yalnızca hesap ayarına göre ücret çıkabilecek servislerde: kullanıcı hesabın
  // ücretsiz planda (faturalandırma kapalı) olduğunu doğrulamadan rotasyona girmez.
  billingVerified: { label: "Hesabın ücretsiz planda olduğunu doğruladım", type: "boolean", requiresBilling: "account" },
};

// reports: sağlayıcının gerçekten bildirdiği metrikler (bildirilmeyen tahmin edilmez).
export const SERVICES = {
// billing: "account" → hesapta faturalandırma açıksa ücret çıkabilir (uygulama bunu
// göremez); "none" → bu kullanım biçiminde ücret oluşmaz.
  "text:gemini": { category: "text", provider: "gemini", label: "Google Gemini", reports: ["requests", "tokens"], billing: "account", billingNote: "Google Cloud projesinde faturalandırma açıksa ücretlendirilir." },
  "text:groq": { category: "text", provider: "groq", label: "Groq", reports: ["requests", "tokens"], billing: "account", billingNote: "Ödeme yöntemi eklenmiş (Developer) hesapta ücretlendirilir." },
  "text:cloudflare": { category: "text", provider: "cloudflare", label: "Cloudflare Workers AI (metin)", reports: ["requests", "tokens"], billing: "account", billingNote: "Workers Paid planda 10.000 Neuron üstü ücretlendirilir." },
  "text:openrouter": { category: "text", provider: "openrouter", label: "OpenRouter (yalnızca :free)", reports: ["requests", "tokens"], billing: "none", billingNote: "Yalnızca :free modeller istenir; ücretli model yanıtı reddedilir." },
  "text:ovh": { category: "text", provider: "ovh", label: "OVHcloud AI Endpoints (anonim)", reports: ["requests", "tokens"], billing: "none", billingNote: "Anahtarsız anonim katman; hesap olmadığı için ücret oluşamaz." },
  "text:llm7": { category: "text", provider: "llm7", label: "LLM7.io (anonim)", reports: ["requests", "tokens"], billing: "none", billingNote: "Anahtarsız anonim erişim; ücret oluşamaz. Kullanım şartları doğrulanamadı." },
  "text:pollinations": { category: "text", provider: "pollinations", label: "Pollinations metin (anonim)", reports: ["requests", "tokens"], billing: "none", billingNote: "Anahtarsız; ücret oluşamaz. Ticari şart doğrulanamadı." },
  "image:comfyui": { category: "image", provider: "comfyui", label: "ComfyUI", reports: ["requests", "images"], billing: "none", billingNote: "Kendi sunucunuz; API ücreti yok (GPU/barındırma maliyeti size ait)." },
  "image:cloudflare": { category: "image", provider: "cloudflare", label: "Cloudflare Workers AI (görsel)", reports: ["requests", "images"], billing: "account", billingNote: "Workers Paid planda 10.000 Neuron üstü ücretlendirilir." },
  "image:pollinations": { category: "image", provider: "pollinations", label: "Pollinations (anonim)", reports: ["requests", "images"], billing: "none", billingNote: "Anahtarsız anonim kullanım; ödeme istenirse (402) çağrı durdurulur." },
};

// billingVerified: Gemini için kullanıcı 2026-10-24'te Free tier'ı doğruladı. Groq ve
// Cloudflare hesabı görülmeden ücretsiz kabul edilmez (panelden onaylanır).
export const DEFAULT_LIMITS = {
  "text:gemini": { enabled: true, priority: 1, billingVerified: true, dailyRequests: 300, dailyTokens: 3_000_000, maxConcurrent: 3, maxAttempts: 5 },
  "text:groq": { enabled: true, priority: 2, billingVerified: false, dailyRequests: 900, dailyTokens: 180_000, maxConcurrent: 2, maxAttempts: 2 },
  "text:cloudflare": { enabled: true, priority: 3, billingVerified: false, dailyRequests: 150, dailyTokens: 150_000, maxConcurrent: 2, maxAttempts: 2 },
  "text:openrouter": { enabled: true, priority: 4, dailyRequests: 45, dailyTokens: 300_000, maxConcurrent: 2, maxAttempts: 1 },
  "text:ovh": { enabled: true, priority: 5, dailyRequests: 200, dailyTokens: 400_000, maxConcurrent: 1, maxAttempts: 1 },
  "text:llm7": { enabled: false, priority: 6, dailyRequests: 100, dailyTokens: 200_000, maxConcurrent: 1, maxAttempts: 1 },
  "text:pollinations": { enabled: false, priority: 7, dailyRequests: 50, dailyTokens: 100_000, maxConcurrent: 1, maxAttempts: 1 },
  "image:comfyui": { enabled: true, priority: 1, dailyRequests: 200, dailyImages: 200, maxConcurrent: 1, maxAttempts: 1 },
  "image:cloudflare": { enabled: true, priority: 2, billingVerified: false, dailyRequests: 100, dailyImages: 100, maxConcurrent: 2, maxAttempts: 1 },
  "image:pollinations": { enabled: true, priority: 3, dailyRequests: 40, dailyImages: 40, maxConcurrent: 1, maxAttempts: 1 },
};

// Sağlayıcının yayımlanmış ücretsiz üst sınırları (null: yayımlanmamış/bilinmiyor).
export const CEILINGS = {
  "text:gemini": { dailyRequests: null, dailyTokens: null, maxConcurrent: 5, maxAttempts: 5 },
  "text:groq": { dailyRequests: 1_000, dailyTokens: 200_000, maxConcurrent: 5, maxAttempts: 3 },
  "text:cloudflare": { dailyRequests: null, dailyTokens: null, maxConcurrent: 5, maxAttempts: 2 },
  "text:openrouter": { dailyRequests: 50, dailyTokens: null, maxConcurrent: 5, maxAttempts: 2 },
  "text:ovh": { dailyRequests: 2_880, dailyTokens: null, maxConcurrent: 2, maxAttempts: 2 }, // 2 istek/dk × 1440 dk
  "text:llm7": { dailyRequests: null, dailyTokens: null, maxConcurrent: 2, maxAttempts: 2 },
  "text:pollinations": { dailyRequests: null, dailyTokens: null, maxConcurrent: 1, maxAttempts: 1 },
  "image:comfyui": { dailyRequests: null, dailyImages: null, maxConcurrent: 4, maxAttempts: 2 },
  "image:cloudflare": { dailyRequests: null, dailyImages: null, maxConcurrent: 4, maxAttempts: 2 },
  "image:pollinations": { dailyRequests: null, dailyImages: null, maxConcurrent: 2, maxAttempts: 2 },
};

// Cloudflare'in 10.000 ücretsiz Neuron'u metin ve görselle paylaşılır. Neuron'u
// API bildirmez: değer resmî fiyatla hesaplanan TAHMİNDİR ve öyle gösterilir.
export const SHARED_NEURONS = { key: "cloudflare", default: 9_000, ceiling: 10_000 };

const clampCount = (value, { min = 0, max = null } = {}) => {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return null;
  const bounded = Math.max(min, number);
  return max === null ? bounded : Math.min(bounded, max);
};

// Admin girdisini doğrular: bilinmeyen alan atılır, sayılar resmî üst sınıra kırpılır.
export function sanitizeOverride(key, input) {
  if (!Object.hasOwn(SERVICES, key)) return null;
  const service = SERVICES[key];
  const ceiling = CEILINGS[key] ?? {};
  const out = {};
  for (const [field, spec] of Object.entries(LIMIT_FIELDS)) {
    if (input?.[field] === undefined) continue;
    if (spec.requires && !service.reports.includes(spec.requires)) continue;
    if (spec.requiresBilling && service.billing !== spec.requiresBilling) continue;
    if (spec.type === "boolean") out[field] = Boolean(input[field]);
    else {
      const value = clampCount(input[field], { min: spec.min ?? 0, max: ceiling[field] ?? spec.max ?? null });
      if (value !== null) out[field] = value;
    }
  }
  return out;
}

export function sanitizeNeuronBudget(value) {
  return clampCount(value, { min: 0, max: SHARED_NEURONS.ceiling });
}

// Varsayılan + admin değerleri → geçerli limitler.
export function effectiveLimits(overrides = {}) {
  const result = {};
  for (const key of Object.keys(SERVICES)) {
    const merged = { ...DEFAULT_LIMITS[key], ...sanitizeOverride(key, overrides[key] ?? {}) };
    const ceiling = CEILINGS[key] ?? {};
    for (const [field, max] of Object.entries(ceiling)) {
      if (max !== null && typeof merged[field] === "number") merged[field] = Math.min(merged[field], max);
    }
    result[key] = { ...merged, freeOnly: FREE_MODE_LOCKED };
  }
  const neurons = sanitizeNeuronBudget(overrides[SHARED_NEURONS.key]?.dailyNeurons);
  result[SHARED_NEURONS.key] = { dailyNeurons: neurons ?? SHARED_NEURONS.default };
  return result;
}

// --- Günlük dönem: Europe/Istanbul -------------------------------------------------
export const LIMIT_TIME_ZONE = "Europe/Istanbul";
const DATE_PARTS = new Intl.DateTimeFormat("en-CA", { timeZone: LIMIT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const OFFSET_PARTS = new Intl.DateTimeFormat("en-US", { timeZone: LIMIT_TIME_ZONE, timeZoneName: "longOffset" });

// İstanbul takvim günü (YYYY-MM-DD).
export const limitDay = (now = Date.now()) => DATE_PARTS.format(new Date(now));
// Sağlayıcı (UTC) günü — yalnızca Cloudflare Neuron tahmini için.
export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

function offsetMs(instant) {
  const name = OFFSET_PARTS.formatToParts(new Date(instant)).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!match) return 0;
  return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) * 60_000;
}

// Verilen İstanbul gününün yerel 00:00 anı (saat değişikliklerine dayanıklı: iki tur).
function startOfLimitDay(day) {
  const [year, month, date] = day.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, date);
  let instant = guess - offsetMs(guess);
  instant = guess - offsetMs(instant);
  return instant;
}

// Günlük pencere: [başlangıç, bitiş). Sınır anındaki istek yeni güne sayılır.
export function limitWindow(now = Date.now()) {
  const day = limitDay(now);
  const start = startOfLimitDay(day);
  const nextDay = limitDay(start + 36 * 3_600_000);
  return { day, start: new Date(start).toISOString(), end: new Date(startOfLimitDay(nextDay)).toISOString() };
}

export const nextReset = (now = Date.now()) => limitWindow(now).end;
