import "server-only";
// "AI Servisleri ve Limitler" ekranının verisi: sağlayıcı durumu, uygulama limiti,
// uygulamada kullanılan miktar, sağlayıcının bildirdiği kota (varsa) ve tahminler.
// Gizli anahtar değerleri asla dönmez; yalnızca yapılandırılıp yapılandırılmadığı.

import { CANCELLED, EXCLUDED, FREE_ONLY, IMAGE_PROVIDERS, TEXT_PROVIDERS, VERIFIED_AT, imageProviderStatus, textProviderStatus } from "./freePolicy.js";
import { CEILINGS, DEFAULT_LIMITS, LIMIT_FIELDS, SERVICES, SHARED_NEURONS, nextReset } from "./limits.js";
import { cooldownFor } from "./providerHealth.js";
import { billingGuard, getUsageStore, storeMode } from "./usageStore.js";
import { designArenaInfo } from "./designArena.js";

export async function servicesStatus({ db = null, env = process.env, now = Date.now() } = {}) {
  const store = getUsageStore({ env, db });
  const snapshot = await store.snapshot();
  const mode = storeMode(env);
  const production = env.VERCEL_ENV === "production";

  const services = Object.entries(SERVICES).filter(([key]) => !CANCELLED.has(key)).map(([key, service]) => {
    const provider = service.category === "text" ? TEXT_PROVIDERS[service.provider] : IMAGE_PROVIDERS[service.provider];
    const configured = service.category === "text" ? textProviderStatus(service.provider, env) : imageProviderStatus(service.provider, env);
    const limit = snapshot.limits[key];
    const used = snapshot.today[key] ?? { requests: 0, tokens: 0, images: 0 };
    const cooling = cooldownFor(key, now);
    const guard = billingGuard(key, store, env, snapshot.limits);
    const lastProviderReport = snapshot.events.find((event) => event.service === key && event.remaining !== undefined);
    const remaining = (field, usedValue) => (typeof limit[field] === "number" ? Math.max(0, limit[field] - usedValue) : null);
    let state = "active";
    if (!configured.available) state = "missing-key";
    else if (!limit.enabled) state = "disabled";
    else if (!guard.allowed) state = "blocked";
    else if (cooling) state = cooling.kind === "quota" ? "quota" : "cooldown";
    else if (typeof limit.dailyRequests === "number" && used.requests >= limit.dailyRequests) state = "limit";
    else if (service.category === "image" && typeof limit.dailyImages === "number" && used.images >= limit.dailyImages) state = "limit";

    return {
      key,
      label: service.label,
      category: service.category,
      provider: service.provider,
      models: service.category === "text" ? provider?.models ?? [] : Object.entries(provider?.models ?? {}).map(([id, spec]) => `${spec.label} (${id})`),
      tasks: service.category === "text" ? provider?.tasks ?? [] : ["görsel üretimi"],
      taskNotes: service.category === "text" ? provider?.taskNotes ?? null : null,
      configured: configured.available,
      configuredReason: configured.reason,
      envNames: provider?.env ?? [],
      state,
      stateReason: !guard.allowed ? guard.reason : cooling ? `Bekleme süresi: ${new Date(cooling.until).toISOString()}` : "",
      limit,
      defaults: DEFAULT_LIMITS[key],
      ceilings: CEILINGS[key],
      used,
      usedMonth: snapshot.month[key] ?? { requests: 0, tokens: 0, images: 0 },
      remainingApp: { requests: remaining("dailyRequests", used.requests), tokens: remaining("dailyTokens", used.tokens), images: remaining("dailyImages", used.images) },
      // Sağlayıcının kendi bildirdiği değer (ör. Groq x-ratelimit-remaining-requests). Yoksa null = bilinmiyor.
      providerReported: lastProviderReport ? { remainingRequests: lastProviderReport.remaining, at: lastProviderReport.at } : null,
      reports: service.reports,
      billing: service.billing,
      billingNote: provider?.billingNote ?? service.billingNote,
      billingVerified: service.billing === "account" ? Boolean(limit.billingVerified) : null,
      turkish: provider?.turkish ?? null,
      priority: limit.priority ?? null,
      free: provider?.free ?? "",
      privacy: provider?.privacy ?? "",
      terms: provider?.terms ?? provider?.note ?? "",
      health: snapshot.health[key] ?? {},
      active: snapshot.active[key] ?? 0,
    };
  });

  const ready = (category) => services.filter((service) => service.category === category && service.state === "active").length;
  return {
    freeOnly: FREE_ONLY,
    // Kullanılabilir ücretsiz servis kalmadıysa panel ve stüdyo uyarı gösterir.
    available: { text: ready("text"), image: ready("image") },
    verifiedAt: VERIFIED_AT,
    store: {
      mode: store.mode,
      requested: mode,
      persistent: store.persistent,
      atomicAcrossInstances: store.mode === "supabase",
      production,
      editable: store.persistent && (store.mode === "supabase" || !production),
      note:
        store.mode === "supabase"
          ? "Sayaçlar ve limitler Supabase'te kalıcı ve atomik."
          : store.mode === "file"
            ? "Yerel geliştirme: sayaçlar .data/ai-usage.json dosyasında kalıcı (tek sunucu süreci). Canlı ortam için Supabase migration gerekir."
            : "Kalıcı depo etkin değil: sayaçlar yalnızca bu sunucu örneğinin belleğinde ve yeniden başlatmada sıfırlanır. Limitler düzenlenemez. Supabase'de AI migration'ı (supabase/migrations/20261023000000_ai_usage_jobs.sql) uygulanmış olmalı ve sunucu ortamında AI_USAGE_STORE=supabase tanımlanmalı.",
    },
    window: snapshot.window,
    nextReset: nextReset(now),
    neurons: { used: snapshot.neuronsToday, limit: snapshot.limits[SHARED_NEURONS.key].dailyNeurons, ceiling: SHARED_NEURONS.ceiling, estimate: true },
    fields: LIMIT_FIELDS,
    services,
    excluded: EXCLUDED,
    designArena: await designArenaInfo({ env, now }),
    events: snapshot.events.slice(0, 30).map((event) => ({ at: event.at, service: event.service, task: event.task, provider: event.provider, model: event.model, ok: event.ok, kind: event.kind, ms: event.ms, skipped: event.skipped, fallback: event.fallback, inputTokens: event.inputTokens, outputTokens: event.outputTokens, images: event.images })),
  };
}

// Üretim yapmayan, kota harcamayan sağlık kontrolleri (yalnızca kullanıcı isteğiyle).
const CHECKS = {
  "text:gemini": (env) => env.GEMINI_API_KEY && { url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", headers: { "x-goog-api-key": env.GEMINI_API_KEY } },
  "text:groq": (env) => env.GROQ_API_KEY && { url: "https://api.groq.com/openai/v1/models", headers: { authorization: `Bearer ${env.GROQ_API_KEY}` } },
  "text:openrouter": (env) => env.OPENROUTER_API_KEY && { url: "https://openrouter.ai/api/v1/key", headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}` }, reportsQuota: true },
  "text:cloudflare": (env) => env.CLOUDFLARE_API_TOKEN && { url: "https://api.cloudflare.com/client/v4/user/tokens/verify", headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` } },
  "image:cloudflare": (env) => CHECKS["text:cloudflare"](env),
  "image:comfyui": (env) => env.COMFYUI_URL && { url: `${String(env.COMFYUI_URL).replace(/\/+$/, "")}/system_stats`, headers: env.COMFYUI_TOKEN ? { authorization: `Bearer ${env.COMFYUI_TOKEN}` } : {} },
  "image:pollinations": () => ({ url: "https://image.pollinations.ai/models", headers: {} }),
};

export async function checkService(key, { env = process.env, db = null, fetchImpl = fetch, now = Date.now() } = {}) {
  if (!Object.hasOwn(CHECKS, key)) return { ok: false, detail: "Bilinmeyen servis." };
  const spec = CHECKS[key](env);
  if (!spec) return { ok: false, detail: "Anahtar tanımlı değil; kontrol yapılmadı." };
  let result;
  try {
    const response = await fetchImpl(spec.url, { headers: spec.headers, signal: AbortSignal.timeout(8_000) });
    const payload = await response.json().catch(() => null);
    result = { ok: response.ok, status: response.status, detail: response.ok ? "Erişim doğrulandı (üretim yapılmadı, kota harcanmadı)." : response.status === 401 || response.status === 403 || response.status === 400 ? "Anahtar geçersiz ya da yetkisiz." : `Servis yanıt vermedi (HTTP ${response.status}).` };
    // OpenRouter anahtar uç noktası GERÇEK kullanım/limit bilgisini bildirir.
    if (spec.reportsQuota && response.ok && payload?.data) {
      result.provider = { usage: payload.data.usage ?? null, limit: payload.data.limit ?? null, limitRemaining: payload.data.limit_remaining ?? null, isFreeTier: payload.data.is_free_tier ?? null };
    }
  } catch {
    result = { ok: false, detail: "Servise ulaşılamadı (ağ ya da zaman aşımı)." };
  }
  await getUsageStore({ env, db }).noteHealth(key, { checkedAt: new Date(now).toISOString(), check: result }).catch(() => {});
  return result;
}
