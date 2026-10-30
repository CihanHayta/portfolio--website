// Ücretsiz yapay zekâ sağlayıcılarının doğrulanmış kaydı ve FREE_ONLY politikası.
//
// Kural: Uygulama hiçbir koşulda ücretli bir modele ya da ücretli plana geçmez.
// Listede olmayan ya da ücretsiz kullanımı doğrulanamayan model çağrılmaz.
// Bu kayıt sağlayıcıların resmî sayfalarından elle doğrulanmıştır; ücretsiz
// koşullar değişebilir. Yeniden doğrulama: docs/AI_PROVIDERS_AND_LIMITS.md.
//
// Not: Uygulamanın tuttuğu sayaçlar ve bekleme süreleri sağlayıcının gerçek
// faturalandırma koruması değildir; kesin kalan kota hiçbir yerde uydurulmaz.

import { FREE_TEXT_MODELS } from "./gemini.js";

export const FREE_ONLY = true;
export const VERIFIED_AT = "2026-10-30";

// Türkçe içerik görevleri (taslak, makale, genişletme): Türkçe testi geçen modeller öne alınır.
export const CONTENT_TASKS = ["draft", "draft-expand", "article"];

// --- Metin sağlayıcıları (sıra = varsayılan deneme sırası) -------------------------
export const TEXT_PROVIDERS = {
  gemini: {
    label: "Google Gemini",
    env: ["GEMINI_API_KEY"],
    models: FREE_TEXT_MODELS,
    vision: true,
    maxInputTokens: 900_000,
    tasks: ["source-analysis", "article", "screenshot-read", "draft", "draft-expand", "similarity", "visual-plan", "image-describe"],
    limits: null, // Google hesap bazlı kotayı yayımlamıyor: uygulama yalnızca sayar, kalan "bilinmiyor"
    free: "Ücretsiz katman, kredi kartı yok. Dakikalık/günlük kota hesap bazındadır ve AI Studio'da görülür.",
    privacy: "Ücretsiz katmanda istemler Google ürünlerini geliştirmek için kullanılabilir.",
    source: "https://ai.google.dev/gemini-api/docs/pricing",
    turkish: "ok", // 2026-10-24 gerçek test: gemini-3.6-flash, doğru Türkçe JSON
    billingNote: "Kullanıcı 2026-10-24'te anahtarın AI Studio'da Free tier (faturalandırma kapalı) olduğunu bildirdi.",
  },
  groq: {
    label: "Groq",
    env: ["GROQ_API_KEY"],
    baseUrl: "https://api.groq.com/openai/v1",
    models: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"],
    vision: false,
    // Ücretsiz planda model başına 8K TPM: giriş + çıkış bu sınırın altında kalmalı.
    maxInputTokens: 5_000,
    maxOutputTokens: 2_500,
    tasks: ["visual-plan", "similarity", "source-analysis"],
    limits: { perModelRequestsPerDay: 950 }, // resmî 1.000 RPD; güvenlik payı
    free: "Ücretsiz plan, kredi kartı yok: model başına 30 RPM, 1.000 RPD, 8K TPM, 200K TPD.",
    terms: "Ticari kullanım koşulu resmî sözleşmede açıkça doğrulanamadı; anahtar eklemeden önce Groq Services Agreement'ı kontrol edin.",
    source: "https://console.groq.com/docs/rate-limits",
    turkish: "untested",
  },
  cloudflare: {
    label: "Cloudflare Workers AI",
    env: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"],
    models: ["@cf/openai/gpt-oss-120b", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"],
    vision: false,
    maxInputTokens: 20_000,
    maxOutputTokens: 4_000,
    tasks: ["visual-plan", "similarity", "source-analysis", "article", "draft", "draft-expand"],
    limits: { sharedNeuronsPerDay: 9_000 }, // resmî 10.000/gün (görsellerle paylaşılır); güvenlik payı
    // Resmî fiyat: milyon token başına Neuron [giriş, çıkış].
    neuronRates: { "@cf/openai/gpt-oss-120b": [31_818, 68_182], "@cf/meta/llama-3.3-70b-instruct-fp8-fast": [26_668, 204_805] },
    free: "Workers Free: günde 10.000 Neuron, tüm Workers AI kullanımıyla (görseller dahil) paylaşılır; aşılınca istek başarısız olur, ücret çıkmaz. Hesap Workers Paid plandaysa aşım ücretlendirilebilir.",
    source: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
    turkish: "untested",
  },
  openrouter: {
    label: "OpenRouter",
    env: ["OPENROUTER_API_KEY"],
    baseUrl: "https://openrouter.ai/api/v1",
    // Yalnızca ":free" modeller ve yalnızca ücretsiz modellere yönlendiren router.
    models: ["openrouter/free"],
    vision: false,
    maxInputTokens: 30_000,
    maxOutputTokens: 6_000,
    tasks: ["visual-plan", "similarity", "source-analysis", "article", "draft", "draft-expand"],
    limits: { perModelRequestsPerDay: 45 }, // resmî 50 RPD (kredi alınmamış hesap); güvenlik payı
    free: "Yalnızca ':free' modeller: model başına günde 50 istek (kredi alınmadıysa).",
    privacy: "Ücretsiz modellerin sağlayıcıları istemleri kaydedebilir ya da eğitimde kullanabilir.",
    source: "https://openrouter.ai/docs",
    turkish: "untested",
  },
  // --- Anahtarsız (anonim) servisler: hesap olmadığı için ücret oluşamaz -----------
  ovh: {
    label: "OVHcloud AI Endpoints (anonim)",
    env: [],
    baseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
    // 2026-10-25 gerçek görsel planı testi: Llama-3.3-70B 29,8 sn'de geçerli Türkçe plan;
    // gpt-oss-120b (akıl yürütme modeli) 55 sn'de yanıt vermedi. Llama önce denenir.
    models: ["Meta-Llama-3_3-70B-Instruct", "gpt-oss-120b"],
    vision: false,
    maxInputTokens: 30_000,
    maxOutputTokens: 4_000,
    // "similarity" çıkarıldı (2026-10-30, Preview gerçek testi): arşiv karşılaştırması iki
    // çağrı yapıp anonim dakikalık 2 isteği tüketiyor, ardından gelen taslak hız sınırına
    // takılıyordu. Gemini yoksa karşılaştırma yerel ölçümle yapılır; OVH taslağa ayrılır.
    // 2026-10-30 Preview gerçek testi: gerçek boyutlu taslak (≈900 sözcük, ~8k token girdi)
    // 53 sn ve 134 sn beklemede de yanıt vermedi (kısa 220 sözcük: 22–39 sn). Anonim katman
    // tam taslak için fazla yavaş: taslak/genişletme/makale görevlerinden çıkarıldı.
    tasks: ["visual-plan", "source-analysis"],
    limits: { perModelRequestsPerMinute: 2 },
    free: "Anahtarsız anonim katman: IP ve model başına dakikada 2 istek (resmî). Hesap olmadığı için ücret oluşmaz.",
    privacy: "OVHcloud: \"we do not store user data\" (resmî belge). Sunucular AB'de.",
    terms: "Anonim katman için ticari kullanım ayrıca belirtilmemiş; OVHcloud Public Cloud Özel Koşulları (Ek 10) geçerli. Yalnızca yedek olarak kullanılır.",
    source: "https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-getting-started",
    turkish: "ok", // 2026-10-24 gpt-oss-120b, 2026-10-25 Llama-3.3-70B: doğru Türkçe JSON
    jsonMode: false, // JSON modu zorlanmaz; çıktı şemayla doğrulanır
    // 2026-10-30 görev bazlı gerçek yoklama (scripts/ai/probe-tasks.mjs, Llama-3.3-70B):
    // kaynak analizi, benzerlik, genişletme ve görsel planı GEÇTİ; taslak iki denemede de
    // hedefin yaklaşık yarısında kaldı (117 ve 118 / 220 sözcük). Taslakta yalnızca Gemini
    // yanıt veremezse YEDEK olarak kalır; uygulamanın genişletme turu açığı kapatır ve
    // kalan açık taslak notunda gösterilir. Birincil yazar değildir.
    taskNotes: {
      draft: "Kullanılmaz: gerçek boyutlu taslakta 53 ve 134 sn'de yanıt vermedi (2026-10-30, Preview); kısa taslak da hedefin yarısında kaldı.",
      "draft-expand": "Kullanılmaz (taslakla aynı gerekçe).",
      similarity: "Kullanılmaz: dakikalık 2 istek sınırı; Gemini yoksa arşiv karşılaştırması yerel ölçümle yapılır.",
    },
  },
  llm7: {
    label: "LLM7.io (anonim)",
    env: [],
    baseUrl: "https://api.llm7.io/v1",
    models: ["default"],
    vision: false,
    maxInputTokens: 20_000,
    maxOutputTokens: 3_000,
    tasks: ["visual-plan", "similarity", "source-analysis"],
    limits: null,
    free: "Anonim erişim 2026-10-24 ve 2026-10-26'da gerçek istekle çalıştı (yanıt modeli: mistral-Nemo). Ana sayfa kendini ücretli bir API olarak tanıtıyor; anonim sınırlar yayımlanmıyor.",
    privacy: "Veri saklama ve kayıt politikası bulunamadı.",
    terms: "Kullanım şartları bulunamadı: varsayılan KAPALI; panelden bilinçli olarak açılabilir.",
    source: "https://docs.llm7.io/",
    jsonMode: false,
    turkish: "ok",
    defaultEnabled: false,
  },
  pollinations: {
    label: "Pollinations metin (anonim)",
    env: [],
    baseUrl: "https://text.pollinations.ai/openai",
    endpoint: "https://text.pollinations.ai/openai",
    models: ["openai"],
    vision: false,
    maxInputTokens: 8_000,
    maxOutputTokens: 2_000,
    tasks: ["visual-plan", "similarity"],
    limits: null,
    free: "Anahtarsız topluluk servisi; sıkı hız sınırı, kesintiye açık.",
    privacy: "Proje sıfır veri saklama iddia ediyor (resmî şart metni bulunamadı).",
    terms: "Ticari kullanım şartı doğrulanamadı (2026-10-26: şartlar sayfası okunabilir metin vermiyor): varsayılan KAPALI.",
    source: "https://pollinations.ai/",
    jsonMode: false,
    turkish: "ok",
    defaultEnabled: false,
  },
};

// Cloudflare Workers AI kullanıcı kararıyla iptal edildi (2026-10-30): sırada yok.
export const TEXT_ORDER = ["gemini", "groq", "openrouter", "ovh", "llm7", "pollinations"];

// --- Görsel sağlayıcıları ---------------------------------------------------------
export const IMAGE_PROVIDERS = {
  comfyui: {
    label: "ComfyUI",
    env: ["COMFYUI_URL", "COMFYUI_CHECKPOINT"],
    textToImage: true,
    imageToImage: true,
    free: "Yazılım ücretsizdir; GPU ve barındırma maliyeti çalıştırana aittir.",
    note: "Yerel ComfyUI'ye Vercel'deki canlı sunucu erişemez. Canlıda yalnızca https adresli ve COMFYUI_TOKEN ile korunan bir sunucu kullanılır.",
  },
  cloudflare: {
    label: "Cloudflare Workers AI",
    env: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"],
    models: {
      "@cf/black-forest-labs/flux-1-schnell": { label: "FLUX.1 [schnell]", textToImage: true, imageToImage: false, license: "Apache-2.0" },
      "@cf/black-forest-labs/flux-2-klein-4b": { label: "FLUX.2 [klein] 4B", textToImage: true, imageToImage: true, license: "Apache-2.0", maxReferences: 4, maxReferenceSide: 511 },
    },
    free: "Workers Free günlük 10.000 Neuron'dan harcar (metinle paylaşılır). FLUX.1 schnell ≈ 4,8 Neuron/512² karo + 9,6 Neuron/adım.",
    source: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
  },
  pollinations: {
    label: "Pollinations",
    env: [],
    models: { flux: { label: "flux (anonim uç nokta)", textToImage: true, imageToImage: false } },
    free: "Anahtarsız herkese açık uç nokta: düşük çözünürlük, filigran ve sıkı hız sınırı.",
    terms: "Ticari kullanım koşulları resmî olarak doğrulanamadı; yalnızca son çare olarak ve etiketiyle sunulur.",
  },
};

// Otomatik görsel üretimi YOK (2026-10-30): ComfyUI ve Cloudflare kullanıcı
// kararıyla iptal edildi; Pollinations görseli ücretsiz ve ticari kullanıma uygun
// olduğu doğrulanamadı; Gemini görsel modelleri ücretsiz katmanda yok. Yeni
// görseller kullanıcının kendi ChatGPT hesabıyla, açıkça "elle" etiketli akışla
// üretilir. Adaptörler yerinde durur ama hiçbir rota ve arayüz onları çağırmaz.
export const IMAGE_ORDER = [];

// Panelde ve yönlendiricide hiç gösterilmeyen/kullanılmayan servisler.
export const CANCELLED = new Set(["text:cloudflare", "image:comfyui", "image:cloudflare", "image:pollinations"]);

// Değerlendirilip bilinçli olarak kullanılmayanlar (arayüzde ve raporda gösterilir).
export const EXCLUDED = [
  { name: "Gemini görsel modelleri (Nano Banana)", reason: "Ücretsiz katmanda yok (fiyat sayfası: \"Not available\")." },
  { name: "Kilo Code ücretsiz havuzu", reason: "Ücretsiz plan tek bir gerçek kişiye verilir ve gönderilen veri hizmeti geliştirmek için kullanılabilir; müşteri içeriği için uygun değil. 2026-10-24 testinde JSON yanıtı yarıda kesildi." },
  { name: "Cohere Trial", reason: "Yalnızca ticari olmayan kullanıma izin veriyor." },
  { name: "Stability AI", reason: "Başlangıç kredisi; sürekli ücretsiz değil." },
  { name: "Hugging Face Inference Providers", reason: "Ücretsiz hesaplara aylık kredi verilmiyor (2026-10-30 fiyat sayfası: \"Free Users: None\"); kullanım kredi satın almayı gerektirir." },
  { name: "Arena.ai", reason: "Kullanım şartları otomatik erişimi, kazımayı ve çıktının ticari kullanımını yasaklıyor; yalnızca manuel bağlantı." },
  { name: "Design Arena", reason: "Yalnızca sıralama (leaderboard) API'si; görsel üretmez. Onaylı anahtar (DESIGN_ARENA_API_KEY) ve atıf gerekir." },
  { name: "DuckDuckGo görselleri", reason: "Resmî görsel arama API'si yok; otomatik görsel arama ve kazıma kullanılmaz (kullanıcı kararıyla iptal)." },
  { name: "Cloudflare Workers AI (metin ve görsel)", reason: "Kullanıcı kararıyla iptal edildi; anahtarı olsa bile yönlendiricide yok." },
  { name: "ComfyUI", reason: "Kullanıcı kararıyla iptal edildi." },
  { name: "Ollama", reason: "Kullanıcı kararıyla iptal edildi." },
  { name: "Pollinations görsel üretimi", reason: "Referanslı düzenleme ücret/kredi istiyor (402); ücretsiz uç noktanın ticari kullanım şartı doğrulanamadı ve görseller filigranlı." },
  { name: "Vercel AI Gateway", reason: "Yeni sağlayıcı altyapısı kurulmuyor (kullanıcı kararı)." },
];

const hasAll = (names, env) => names.every((name) => Boolean(env[name]));

// FREE_ONLY: model kayıtta ücretsiz olarak doğrulanmış mı?
export function isFreeTextModel(provider, model) {
  const entry = TEXT_PROVIDERS[provider];
  if (!entry) return false;
  if (provider === "openrouter") return model === "openrouter/free" || /:free$/.test(model);
  return entry.models.includes(model);
}

export function isFreeImageModel(provider, model) {
  if (provider === "comfyui") return true; // kendi sunucunuz; ücretli API değildir
  return Boolean(IMAGE_PROVIDERS[provider]?.models?.[model]);
}

// Ortam değişkeninden sıra/model seçimi yapılırsa ücretsiz olmayan değer reddedilir.
export function textModelsFor(provider, env = process.env) {
  const entry = TEXT_PROVIDERS[provider];
  const key = `${provider.toUpperCase()}_TEXT_MODELS`;
  const requested = String(env[key] ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const allowed = requested.filter((model) => isFreeTextModel(provider, model));
  return allowed.length ? allowed : provider === "gemini" ? entry.models : entry.models.slice();
}

export function textProviderStatus(provider, env = process.env) {
  const entry = TEXT_PROVIDERS[provider];
  if (!hasAll(entry.env, env)) return { available: false, reason: `Yapılandırılmamış (${entry.env.join(", ")})` };
  return { available: true, reason: "" };
}

const isHttps = (value) => /^https:\/\//i.test(String(value ?? ""));

export function imageProviderStatus(provider, env = process.env) {
  if (provider === "comfyui") {
    if (!env.COMFYUI_URL) return { available: false, reason: "Yapılandırılmamış (COMFYUI_URL, COMFYUI_CHECKPOINT)." };
    if (!env.COMFYUI_CHECKPOINT) return { available: false, reason: "COMFYUI_CHECKPOINT (kullanılacak model dosyası) tanımlı değil." };
    // Canlı ortamda kimlik doğrulamasız ya da düz http bir ComfyUI kullanılmaz.
    if (env.VERCEL && !(isHttps(env.COMFYUI_URL) && env.COMFYUI_TOKEN)) {
      return { available: false, reason: "Canlı ortamda yalnızca https ve COMFYUI_TOKEN ile korunan ComfyUI kullanılabilir." };
    }
    return { available: true, reason: "" };
  }
  const entry = IMAGE_PROVIDERS[provider];
  if (!entry) return { available: false, reason: "Bilinmeyen sağlayıcı." };
  if (!hasAll(entry.env, env)) return { available: false, reason: `Yapılandırılmamış (${entry.env.join(", ")})` };
  return { available: true, reason: "" };
}

// --- Uygulama içi limitler (sağlayıcının gerçek fatura korumasının yerine geçmez) ---
export const neuronBudget = (env = process.env) => {
  const value = Number(env.CLOUDFLARE_NEURON_BUDGET);
  // 10.000 ücretsiz Neuron'un üstüne hiçbir ayarla çıkılamaz.
  return Number.isFinite(value) && value > 0 ? Math.min(value, 10_000) : TEXT_PROVIDERS.cloudflare.limits.sharedNeuronsPerDay;
};

// Metin çağrısının Neuron tahmini (gerçek token sayısıyla çağrılırsa "gerçek token × resmî oran").
export function textNeurons(model, inputTokens, outputTokens) {
  const rate = TEXT_PROVIDERS.cloudflare.neuronRates[model];
  if (!rate) return null;
  return Math.ceil((inputTokens * rate[0] + outputTokens * rate[1]) / 1_000_000);
}

// Görsel çağrısının Neuron tahmini (resmî fiyat: 512x512 karo ve adım başına).
export function imageNeurons(model, width, height, { referenceTiles = 0 } = {}) {
  const tiles = Math.ceil((width * height) / (512 * 512));
  if (model === "@cf/black-forest-labs/flux-1-schnell") return Math.ceil(4 * 4.8 + 4 * 9.6); // çıktı 1024², 4 adım
  if (model === "@cf/black-forest-labs/flux-2-klein-4b") return Math.ceil(tiles * 26.05 + referenceTiles * 5.37);
  return null;
}

export function supportsTask(provider, task) {
  const tasks = TEXT_PROVIDERS[provider]?.tasks;
  return !tasks || task === "general" || task === "test" || tasks.includes(task);
}
