// Ücretsiz görsel üretim yönlendiricisi (metin yönlendiricisinden ayrıdır).
// Sıra: ComfyUI (erişilebiliyorsa) → Cloudflare Workers AI → Pollinations.
// Referans görselden üretimde yalnızca bunu gerçekten destekleyen sağlayıcılar
// denenir. Bozuk ya da boş çıktı başarılı sayılmaz. Ücretli servise geçilmez.

import { createHash } from "node:crypto";
import sharp from "sharp";
import { ImageError } from "./images.js";
import { FREE_ONLY, IMAGE_ORDER, IMAGE_PROVIDERS, imageNeurons, imageProviderStatus } from "./freePolicy.js";
import { CF_REFERENCE_MODEL, CF_TEXT_MODEL, IMAGE_ADAPTERS, sizeFor, supportsReference } from "./imageProviders.js";
import { cooldownFor, markFailure, markSuccess } from "./providerHealth.js";
import { secondsUntilUtcMidnight } from "./textRouter.js";
import { billingGuard, getUsageStore, safeEvent } from "./usageStore.js";

const PROVIDER_TIMEOUT_MS = { comfyui: 50_000, cloudflare: 30_000, pollinations: 40_000 };
const MIN_ATTEMPT_MS = 5_000;
const CACHE_TTL_MS = 30 * 60_000;
const CACHE_MAX = 24;
const MAX_OUTPUT_WIDTH = 1600;
const cache = new Map();

const KIND_TEXT = {
  rate: "hız sınırı",
  quota: "ücretsiz kota doldu",
  paid: "ücretli kullanım gerektirdi (devre dışı)",
  auth: "anahtar geçersiz ya da yetkisiz",
  server: "geçici sunucu hatası",
  timeout: "zaman aşımı",
  invalid: "bozuk ya da boş görsel döndü",
  capability: "bu işlemi desteklemiyor",
  limit: "uygulama günlük limiti doldu",
  disabled: "panelden devre dışı bırakıldı",
  concurrency: "eşzamanlı iş sınırı dolu",
  billing: "ücret koruması (kalıcı limit deposu yok)",
  store: "limit deposuna ulaşılamadı (güvenli durdurma)",
  config: "yapılandırılmamış",
  error: "başarısız",
};
const BLOCK_KIND = { requests: "limit", images: "limit", neurons: "limit", tokens: "limit", disabled: "disabled", store: "store", unknown: "config" };

export function clearImageCache() {
  cache.clear();
}

export function listImageProviders(env = process.env, order = IMAGE_ORDER) {
  return order.map((id) => {
    const entry = IMAGE_PROVIDERS[id];
    const status = imageProviderStatus(id, env);
    return {
      id,
      label: entry.label,
      available: status.available,
      reason: status.reason,
      textToImage: entry.textToImage ?? Object.values(entry.models ?? {}).some((model) => model.textToImage),
      imageToImage: supportsReference(id),
      models: id === "comfyui" ? (env.COMFYUI_CHECKPOINT ? [{ id: env.COMFYUI_CHECKPOINT, label: env.COMFYUI_CHECKPOINT }] : []) : Object.entries(entry.models ?? {}).map(([model, spec]) => ({ id: model, label: spec.label })),
      free: entry.free,
      note: entry.note ?? entry.terms ?? "",
    };
  });
}

// Çıktıyı doğrular (gerçek görsel mi, tek renk/boş mu) ve hedef orana kırpar.
export async function finishImage(buffer, aspect) {
  if (!buffer?.length || buffer.length < 512) return { error: "boş çıktı" };
  try {
    const image = sharp(buffer, { limitInputPixels: 50_000_000 });
    const meta = await image.metadata();
    if (!meta.width || !meta.height || meta.width < 64 || meta.height < 64) return { error: "geçersiz boyut" };
    const stats = await sharp(buffer).stats();
    if (stats.channels.slice(0, 3).every((channel) => channel.stdev < 2)) return { error: "tek renk (boş) görsel" };
    const [width, height] = sizeFor(aspect);
    const targetWidth = Math.min(MAX_OUTPUT_WIDTH, width);
    const output = await sharp(buffer)
      .rotate()
      .resize({ width: targetWidth, height: Math.round((targetWidth * height) / width), fit: "cover", position: "attention", withoutEnlargement: false })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { output };
  } catch {
    return { error: "çözülemeyen görsel" };
  }
}

const cacheKey = (parts) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");

function defaultLog(entry) {
  console.info(`[image-router] ${JSON.stringify(entry)}`);
}

// Dönüş: { output: { data, info }, provider, providerLabel, model, modelLabel, mode, cached, attempts }
export async function generateImage({
  prompt,
  negative = "",
  aspect = "16:9",
  seed = 1,
  reference = null, // { buffer, mime, id? }
  strength = 0.6,
  provider = null, // belirli bir sağlayıcıdan alternatif istenirse
  model = null,
  exclude = [],
  // Varsayılan sıra BOŞ (otomatik görsel üretimi kapalı). Testler adaptörleri
  // açık bir sırayla dener; açıkça istenen sağlayıcı da bu sırada değilse çalışmaz.
  order = IMAGE_ORDER,
  task = "image",
  opId = null,
  budgetMs = 55_000,
  env = process.env,
  fetchImpl = fetch,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = defaultLog,
  db = null,
  store = getUsageStore({ env, db }),
}) {
  if (!FREE_ONLY) throw new ImageError("Ücretsiz politika kapalı; bu sürümde desteklenmez.");
  const text = String(prompt ?? "").trim();
  if (!text) throw Object.assign(new ImageError("Görsel istemi boş."), { kind: "invalid" });

  const key = cacheKey({ provider, model, text, negative, aspect, seed, strength, reference: reference ? createHash("sha256").update(reference.buffer).digest("hex") : null });
  const hit = cache.get(key);
  if (hit && hit.expires > now()) return { ...hit.value, cached: true, attempts: [] };

  const limitsForOrder = await store.limits().catch(() => null);
  // Sıra panelden belirlenen önceliğe göredir (eşitse kayıttaki sıra).
  if (order.length === 0) {
    throw Object.assign(new ImageError("Otomatik ücretsiz görsel servisi yok. Görseli ChatGPT'de kendi hesabınla üretip yükleyebilirsin."), { kind: "config", attempts: [] });
  }
  const wanted = provider
    ? [provider].filter((id) => order.includes(id))
    : order.filter((id) => !exclude.includes(id))
        .map((id, index) => ({ id, rank: limitsForOrder?.[`image:${id}`]?.priority ?? 100 + index, index }))
        .sort((a, b) => a.rank - b.rank || a.index - b.index)
        .map((entry) => entry.id);
  const attempts = [];
  const write = async (entry) => {
    const safe = safeEvent({ ...entry, opId }, now());
    attempts.push(safe);
    if (!entry.skipped) log(safe);
    await store.record(safe).catch(() => {});
  };
  const skip = (id, kind, why) => write({ service: `image:${id}`, task, provider: id, ok: false, kind, skipped: why });
  const limits = await store.limits().catch(() => null);
  const candidates = [];
  for (const id of wanted) {
    if (!IMAGE_ADAPTERS[id]) {
      skip(id, "capability", "bilinmeyen sağlayıcı");
      continue;
    }
    const status = imageProviderStatus(id, env);
    const service = `image:${id}`;
    if (!status.available) await skip(id, "config", status.reason);
    else if (reference && !supportsReference(id)) await skip(id, "capability", "referans görselden üretimi desteklemiyor");
    else if (!limits) await skip(id, "store", KIND_TEXT.store);
    else if (!limits[service]?.enabled) await skip(id, "disabled", KIND_TEXT.disabled);
    else {
      const guard = billingGuard(service, store, env, limits);
      if (!guard.allowed) await skip(id, "billing", guard.reason);
      else candidates.push(id);
    }
  }

  if (candidates.length === 0) {
    const onlySetup = attempts.every((attempt) => attempt.kind === "config" || attempt.kind === "capability");
    const reasons = [...new Map(attempts.map((attempt) => [attempt.provider, `${IMAGE_PROVIDERS[attempt.provider]?.label ?? attempt.provider}: ${attempt.skipped}`])).values()].join("; ");
    const message = reference && onlySetup
      ? "Bu ortamda referans görselden üretim yapabilen ücretsiz bir sağlayıcı yapılandırılmamış (ComfyUI ya da Cloudflare Workers AI). Metinden üretimi deneyebilir ya da görseli olduğu gibi kullanabilirsin."
      : provider
        ? `${IMAGE_PROVIDERS[provider]?.label ?? provider} şu anda kullanılamıyor: ${attempts[0]?.skipped ?? "yapılandırılmamış"}.`
        : `Şu anda kullanılabilir ücretsiz bir görsel sağlayıcısı yok (${reasons}). Ücretli bir servise geçilmedi.`;
    throw Object.assign(new ImageError(message), { kind: onlySetup ? "config" : "quota", attempts });
  }

  const deadline = now() + budgetMs;
  for (const [index, id] of candidates.entries()) {
    const service = `image:${id}`;
    const healthKey = service;
    const cooling = cooldownFor(healthKey, now());
    if (cooling) {
      await skip(id, cooling.kind, "bekleme süresinde");
      continue;
    }
    const remaining = deadline - now();
    if (remaining < MIN_ATTEMPT_MS) break;
    const lease = await store.acquire(service, limits[service].maxConcurrent).catch(() => ({ ok: false }));
    if (!lease.ok) {
      await skip(id, "concurrency", KIND_TEXT.concurrency);
      continue;
    }
    let result;
    let kind;
    let finished = null;
    let startedAt;
    try {
      // Cloudflare Neuron'u bildirmez: resmî fiyatla hesaplanan TAHMİN rezerve edilir.
      const [width, height] = sizeFor(aspect);
      const neurons = id === "cloudflare" ? imageNeurons(reference ? CF_REFERENCE_MODEL : model ?? CF_TEXT_MODEL, width, height, { referenceTiles: reference ? 1 : 0 }) ?? 0 : 0;
      const reserved = await store.reserve(service, { requests: 1, images: 1, neurons }).catch(() => ({ ok: false, blockedBy: "store" }));
      if (!reserved.ok) {
        const blocked = BLOCK_KIND[reserved.blockedBy] ?? "limit";
        await skip(id, blocked, `${KIND_TEXT[blocked]} (${reserved.blockedBy})`);
        continue;
      }
      const hasBackup = index < candidates.length - 1;
      const timeoutMs = Math.min(PROVIDER_TIMEOUT_MS[id], hasBackup ? Math.max(MIN_ATTEMPT_MS, Math.round(remaining * 0.65)) : remaining);
      startedAt = now();
      result = await IMAGE_ADAPTERS[id]({ prompt: text, negative, aspect, seed, reference, strength, model }, { env, fetchImpl, timeoutMs, sleep });
      kind = result.kind ?? "ok";
      if (!result.kind) {
        finished = await finishImage(result.buffer, aspect);
        if (finished.error) kind = "invalid";
      }
      // Görsel üretilmediyse görsel sayacı geri alınır; istek sayılı kalır.
      if (kind !== "ok") await store.settle(service, { images: -1 }).catch(() => {});
      await write({ service, task, provider: id, model: result.model ?? null, ok: kind === "ok", kind, ms: now() - startedAt, attempt: attempts.filter((attempt) => !attempt.skipped).length + 1, fallback: attempts.some((attempt) => !attempt.skipped), mode: reference ? "reference" : "text", images: kind === "ok" ? 1 : 0, ...(neurons ? { neuronsEstimate: neurons } : {}), rateLimited: kind === "rate" || kind === "quota", ...(finished?.error ? { detail: finished.error } : result.detail ? { detail: result.detail } : {}) });
    } finally {
      await store.release(service, lease.lease).catch(() => {});
    }

    if (kind === "ok") {
      markSuccess(healthKey);
      const value = {
        output: finished.output,
        provider: id,
        providerLabel: IMAGE_PROVIDERS[id].label,
        model: result.model ?? null,
        modelLabel: result.modelLabel,
        mode: result.mode,
      };
      cache.set(key, { value, expires: now() + CACHE_TTL_MS });
      while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
      return { ...value, cached: false, attempts };
    }

    if (kind === "paid") markFailure(healthKey, "quota", { retryAfter: 24 * 60 * 60, now: now() });
    else if (kind === "auth") markFailure(healthKey, "quota", { retryAfter: 60 * 60, now: now() });
    else if (kind === "quota") markFailure(healthKey, "quota", { retryAfter: id === "cloudflare" ? secondsUntilUtcMidnight(now()) : result.retryAfter, now: now() });
    else if (kind === "rate") markFailure(healthKey, "rate", { retryAfter: result.retryAfter, now: now() });
    else if (kind === "server" || kind === "timeout") markFailure(healthKey, kind, { now: now() });
  }

  const summary = [...new Map(attempts.filter((attempt) => !attempt.ok).map((attempt) => [attempt.provider, `${IMAGE_PROVIDERS[attempt.provider]?.label ?? attempt.provider}: ${attempt.skipped ?? KIND_TEXT[attempt.kind] ?? attempt.kind}`])).values()].join("; ");
  const kind = attempts.some((attempt) => attempt.kind === "quota" || attempt.kind === "rate") ? "quota" : "busy";
  throw Object.assign(new ImageError(`Ücretsiz görsel sağlayıcılarının hiçbiri görsel üretemedi (${summary}). Ücretli bir servise geçilmedi.`), { kind, attempts });
}
