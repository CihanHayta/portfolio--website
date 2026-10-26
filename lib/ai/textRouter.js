// Merkezi metin üretim yönlendiricisi. Tüm yapay zekâ metin görevleri (kaynak
// analizi, taslak, genişletme, SEO, benzerlik, görsel planı, ekran görüntüsü
// okuma) buradan geçer.
//
// Her sağlayıcı denemesi: uygunluk (anahtar, görev, görsel girdi, kapasite) →
// aktiflik + ücret koruması + bekleme süresi → eşzamanlı iş kilidi → ATOMİK
// rezervasyon (istek + muhafazakâr token tahmini [+ Neuron tahmini]) → çağrı →
// şema doğrulaması → gerçek token ile uzlaştırma → güvenli kayıt → kilit bırakma.
//
// Kota, hız sınırı, zaman aşımı, geçici sunucu hatası, geçersiz çıktı ya da
// yetenek eksikliğinde sıradaki uygun ÜCRETSİZ sağlayıcıya geçilir. Anahtar/
// yetki hatası alan sağlayıcı bir süre çağrılmaz. Ücretli modele asla geçilmez.
// Rezervasyon iade politikası: istek gönderildiyse sayılır (sağlayıcı da saymış
// olabilir); token tahmini gerçek değerle uzlaştırılır, bilinmiyorsa tahmin kalır.

import { AiError, generateJson as geminiJson } from "./gemini.js";
import { CONTENT_TASKS, FREE_ONLY, TEXT_ORDER, TEXT_PROVIDERS, isFreeTextModel, supportsTask, textModelsFor, textNeurons, textProviderStatus } from "./freePolicy.js";
import { cooldownFor, markFailure, markSuccess } from "./providerHealth.js";
import { checkSchema } from "./schemaCheck.js";
import { billingGuard, getUsageStore, safeEvent } from "./usageStore.js";

const MIN_ATTEMPT_MS = 4_000;
const MAX_TOTAL_ATTEMPTS = 6; // tek iş için tüm sağlayıcılarda toplam gerçek çağrı sınırı
const AUTH_COOLDOWN_SECONDS = 60 * 60;
const RESERVE_OUTPUT_CAP = 8_000; // token rezervasyonunda çıktı payı (sonra gerçek değerle uzlaştırılır)

// Türkçe metinde kabaca 1 token ≈ 3,2 karakter (yalnızca ön tahmin).
export const estimateTokens = (text) => Math.ceil(String(text ?? "").length / 3.2);

// Gemini şeması (OpenAPI alt kümesi, büyük harfli tipler) → JSON Schema.
export function toJsonSchema(schema) {
  if (!schema || typeof schema !== "object") return schema;
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "type") out.type = String(value).toLowerCase();
    else if (key === "properties") out.properties = Object.fromEntries(Object.entries(value).map(([name, sub]) => [name, toJsonSchema(sub)]));
    else if (key === "items") out.items = toJsonSchema(value);
    else if (["enum", "required", "description", "minItems", "maxItems", "nullable"].includes(key)) out[key] = value;
  }
  return out;
}

const parseJson = (text) => JSON.parse(String(text ?? "").replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));

function classifyHttp(status, message = "") {
  if (status === 402) return "paid";
  if (status === 429) return /daily|quota|allocation|exhaust|neuron/i.test(message) ? "quota" : "rate";
  if (status === 401) return "auth";
  if (status === 403) return /model|access|permission/i.test(message) ? "forbidden" : "auth";
  if (status === 404) return "missing";
  if (status === 413 || (status === 400 && /context|too (large|long)|tokens|max_tokens|request too large/i.test(message))) return "capability";
  if (status === 400 || status === 422) return "badrequest";
  if (status >= 500) return "server";
  return "error";
}

// Cloudflare'in günlük ücretsiz Neuron'u 00:00 UTC'de yenilenir.
export function secondsUntilUtcMidnight(now = Date.now()) {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(60, Math.round((next.getTime() - now) / 1000));
}

function endpointFor(provider, env) {
  if (provider === "cloudflare") return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/ai/v1/chat/completions`;
  return TEXT_PROVIDERS[provider].endpoint ?? `${TEXT_PROVIDERS[provider].baseUrl}/chat/completions`;
}

const keyFor = (provider, env) => ({ groq: env.GROQ_API_KEY, cloudflare: env.CLOUDFLARE_API_TOKEN, openrouter: env.OPENROUTER_API_KEY })[provider];

// OpenAI uyumlu sohbet uç noktası (Groq, Cloudflare, OpenRouter).
async function callCompatible(provider, model, { system, prompt, schema, temperature, maxOutputTokens }, { env, fetchImpl, timeoutMs }) {
  const entry = TEXT_PROVIDERS[provider];
  const schemaText = schema ? `\n\nYanıtı YALNIZCA bu JSON şemasına uyan tek bir JSON nesnesi olarak ver, başka metin ekleme:\n${JSON.stringify(toJsonSchema(schema))}` : "";
  const body = {
    model,
    messages: [
      { role: "system", content: `${system}${schemaText}` },
      { role: "user", content: prompt },
    ],
    temperature,
    max_tokens: Math.min(maxOutputTokens, entry.maxOutputTokens ?? maxOutputTokens),
    ...(entry.jsonMode === false ? {} : { response_format: { type: "json_object" } }),
  };
  const key = keyFor(provider, env);
  // Anahtarsız (anonim) servislere yetki başlığı gönderilmez.
  const headers = { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) };
  if (provider === "openrouter") headers["x-title"] = "Persona Blog Studio";

  let response;
  try {
    response = await fetchImpl(endpointFor(provider, env), { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    return { kind: error?.name === "TimeoutError" || error?.name === "AbortError" ? "timeout" : "server" };
  }
  const raw = await response.text().catch(() => "");
  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    // gövde JSON değil
  }
  const remaining = response.headers.get("x-ratelimit-remaining-requests");
  const providerRemaining = remaining === null ? null : Number(remaining);
  if (!response.ok) {
    const message = String(payload?.error?.message ?? payload?.errors?.[0]?.message ?? raw).slice(0, 300);
    return { kind: classifyHttp(response.status, message), retryAfter: response.headers.get("retry-after"), detail: `HTTP ${response.status}`, providerRemaining };
  }
  const usage = payload?.usage ? { inputTokens: payload.usage.prompt_tokens ?? null, outputTokens: payload.usage.completion_tokens ?? null } : null;
  const content = payload?.choices?.[0]?.message?.content ?? payload?.result?.response;
  const served = String(payload?.model ?? model);
  // OpenRouter'ın ücretsiz yönlendiricisi yalnızca ücretsiz model seçer; yine de
  // yanıttaki gerçek model ücretsiz değilse sonuç kullanılmaz.
  if (provider === "openrouter" && served !== model && !/:free$/.test(served)) {
    return { kind: "paid", detail: `ücretsiz olmayan model döndü: ${served}`, usage };
  }
  if (payload?.choices?.[0]?.finish_reason === "length") return { kind: "truncated", usage, providerRemaining };
  try {
    return { kind: "ok", data: typeof content === "object" ? content : parseJson(content), model: served, usage, providerRemaining };
  } catch {
    return { kind: "invalid", detail: "JSON çözülemedi", usage, providerRemaining };
  }
}

export const KIND_TEXT = {
  quota: "ücretsiz kota doldu",
  rate: "hız sınırı",
  busy: "yoğun",
  server: "geçici sunucu hatası",
  timeout: "zaman aşımı",
  truncated: "yanıt yarıda kesildi",
  invalid: "geçersiz ya da şemaya uymayan yanıt",
  capability: "görev için kapasitesi/yeteneği yetersiz",
  missing: "model bulunamadı",
  auth: "anahtar geçersiz",
  forbidden: "model erişim yetkisi yok",
  badrequest: "geçersiz istek",
  config: "anahtar tanımlı değil",
  paid: "ücretli kullanım gerektirdi (devre dışı)",
  blocked: "içerik reddedildi",
  limit: "uygulama günlük limiti doldu",
  disabled: "panelden devre dışı bırakıldı",
  concurrency: "eşzamanlı iş sınırı dolu",
  billing: "ücret koruması (kalıcı limit deposu yok)",
  store: "limit deposuna ulaşılamadı (güvenli durdurma)",
  error: "başarısız",
};

function defaultLog(entry) {
  // Hiçbir zaman istem, yanıt metni, anahtar ya da çerez yazılmaz.
  console.info(`[ai-router] ${JSON.stringify(entry)}`);
}

const BLOCK_KIND = { requests: "limit", tokens: "limit", images: "limit", neurons: "limit", disabled: "disabled", store: "store", unknown: "config" };

// Gemini generateJson ile aynı imza + { task, opId, store, db }. Dönüş: { data, model, provider, attempts }.
export async function generateJsonRouted({
  task = "general",
  opId = null,
  system,
  prompt,
  schema,
  temperature = 0.6,
  maxOutputTokens = 32_768,
  budgetMs = 52_000,
  // Yedek servis varsa ona en az bu kadar süre bırakılır (ör. görsel planında OVH
  // Llama ~30 sn sürer). 2026-10-26 canlı: Gemini yoğunken 4 model ~30 sn harcadı,
  // OVH'ye 9 sn kaldı ve plan üretilemedi.
  backupReserveMs = 0,
  images = [],
  env = process.env,
  fetchImpl = fetch,
  now = Date.now,
  log = defaultLog,
  order = TEXT_ORDER,
  db = null,
  store = getUsageStore({ env, db }),
}) {
  if (!FREE_ONLY) throw new AiError("Ücretsiz politika kapalı; bu sürümde desteklenmez.", "config");
  const deadline = now() + budgetMs;
  const needsVision = images.length > 0;
  const inputTokens = estimateTokens(`${system}\n${prompt}`) + (schema ? estimateTokens(JSON.stringify(schema)) : 0);
  const limits = await store.limits().catch(() => null);
  // Sıra panelden belirlenen önceliğe göredir (eşitse kayıttaki sıra).
  const configured = order
    .filter((provider) => textProviderStatus(provider, env).available)
    .map((provider, index) => ({ provider, rank: limits?.[`text:${provider}`]?.priority ?? 100 + index, index }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.provider);
  // "Yedek var mı?" yalnızca bu görevde gerçekten denenebilecek servislere göre
  // hesaplanır. Kapalı, onaysız ya da görevi desteklemeyen servis yedek sayılmaz;
  // sayılırsa tek kullanılabilir servise sürenin yalnızca bir kısmı verilir ve
  // yanıt gelmeden zaman aşımı oluşur (2026-10-25, Preview: OVH 28 sn'de kesildi).
  const eligible = configured.filter((provider) => {
    const entry = TEXT_PROVIDERS[provider];
    const service = `text:${provider}`;
    if (!supportsTask(provider, task)) return false;
    if (CONTENT_TASKS.includes(task) && entry.turkish === "weak") return false;
    if (needsVision && !entry.vision) return false;
    if (inputTokens > entry.maxInputTokens) return false;
    if (!limits?.[service]?.enabled) return false;
    return billingGuard(service, store, env, limits).allowed;
  });
  const attempts = [];
  let calls = 0;
  let firstGeminiError = null;
  let lastKind = "error";

  const write = async (entry) => {
    const safe = safeEvent({ ...entry, opId }, now());
    attempts.push(safe);
    if (!entry.skipped) log(safe);
    await store.record(safe).catch(() => {});
  };
  const skip = (provider, kind, why) => write({ service: `text:${provider}`, task, provider, ok: false, kind, skipped: why });

  for (const provider of configured) {
    const service = `text:${provider}`;
    const entry = TEXT_PROVIDERS[provider];
    const limit = limits?.[service];
    const healthKey = service;
    const position = eligible.indexOf(provider);
    const hasBackup = position !== -1 && position < eligible.length - 1;
    if (calls >= MAX_TOTAL_ATTEMPTS) break;
    if (!supportsTask(provider, task)) {
      await skip(provider, "capability", "bu görev için doğrulanmadı");
      continue;
    }
    if (CONTENT_TASKS.includes(task) && entry.turkish === "weak") {
      await skip(provider, "capability", "Türkçe içerik kalitesi yetersiz (test sonucu)");
      continue;
    }
    if (needsVision && !entry.vision) {
      await skip(provider, "capability", "görsel girdi desteklenmiyor");
      continue;
    }
    if (inputTokens > entry.maxInputTokens) {
      await skip(provider, "capability", `istem çok uzun (~${inputTokens} token)`);
      continue;
    }
    if (!limits) {
      await skip(provider, "store", KIND_TEXT.store);
      lastKind = "store";
      continue;
    }
    if (!limit?.enabled) {
      await skip(provider, "disabled", KIND_TEXT.disabled);
      continue;
    }
    const guard = billingGuard(service, store, env, limits);
    if (!guard.allowed) {
      await skip(provider, "billing", guard.reason);
      lastKind = "billing";
      continue;
    }
    const cooling = cooldownFor(healthKey, now());
    if (cooling) {
      await skip(provider, cooling.kind, "bekleme süresinde");
      continue;
    }
    if (deadline - now() < MIN_ATTEMPT_MS) break;

    const lease = await store.acquire(service, limit.maxConcurrent).catch(() => ({ ok: false }));
    if (!lease.ok) {
      await skip(provider, "concurrency", KIND_TEXT.concurrency);
      continue;
    }
    try {
      const outputReserve = Math.min(maxOutputTokens, entry.maxOutputTokens ?? RESERVE_OUTPUT_CAP, RESERVE_OUTPUT_CAP);
      const reserveFor = (model) => ({
        requests: 1,
        tokens: inputTokens + outputReserve,
        neurons: provider === "cloudflare" ? textNeurons(model, inputTokens, outputReserve) ?? 0 : 0,
      });
      // Gerçek kullanımla uzlaştırma: tahmin ile gerçek token farkı sayaçlara yansır.
      const settle = async (model, reserved, usage) => {
        if (!usage || usage.inputTokens === null || usage.inputTokens === undefined) return;
        const actualTokens = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
        const deltas = { tokens: actualTokens - reserved.tokens };
        if (provider === "cloudflare") deltas.neurons = (textNeurons(model, usage.inputTokens ?? 0, usage.outputTokens ?? 0) ?? 0) - reserved.neurons;
        await store.settle(service, deltas).catch(() => {});
      };

      if (provider === "gemini") {
        const remaining = deadline - now();
        const share = hasBackup ? Math.max(MIN_ATTEMPT_MS, Math.min(Math.round(remaining * 0.7), remaining - backupReserveMs)) : remaining;
        let blockedBy = null;
        const pending = new Map();
        try {
          const result = await geminiJson({
            system, prompt, schema, temperature, maxOutputTokens, budgetMs: share, fetchImpl, env, images,
            maxModels: Math.min(limit.maxAttempts, MAX_TOTAL_ATTEMPTS - calls),
            beforeAttempt: async (model) => {
              const amounts = reserveFor(model);
              const reserved = await store.reserve(service, amounts).catch(() => ({ ok: false, blockedBy: "store" }));
              if (!reserved.ok) {
                blockedBy = reserved.blockedBy;
                return false;
              }
              calls += 1;
              pending.set(model, amounts);
              return true;
            },
            afterAttempt: (model, result, ms) => {
              const usage = result.usage ? { inputTokens: result.usage.promptTokenCount ?? null, outputTokens: (result.usage.candidatesTokenCount ?? 0) + (result.usage.thoughtsTokenCount ?? 0) } : null;
              const reserved = pending.get(model);
              pending.set(model, { reserved, usage, kind: result.kind, ms });
            },
          });
          // Başarılı yanıtın şemaya uyduğu doğrulanır.
          const errors = schema ? checkSchema(result.data, schema) : [];
          for (const [model, info] of pending) {
            if (!info?.reserved) continue;
            await settle(model, info.reserved, info.usage);
            const ok = info.kind === "ok" && errors.length === 0;
            await write({ service, task, provider, model, ok, kind: info.kind === "ok" && errors.length ? "invalid" : info.kind, ms: info.ms, attempt: calls, fallback: attempts.some((attempt) => !attempt.skipped), inputTokens: info.usage?.inputTokens, outputTokens: info.usage?.outputTokens, ...(info.kind === "ok" && errors.length ? { detail: errors[0] } : {}) });
          }
          if (errors.length === 0) {
            markSuccess(healthKey);
            return { ...result, provider, attempts };
          }
          lastKind = "invalid";
          continue; // geçersiz çıktı: sıradaki sağlayıcı (sınırlı deneme)
        } catch (error) {
          if (!(error instanceof AiError)) throw error;
          for (const [model, info] of pending) {
            if (!info?.reserved) continue;
            await settle(model, info.reserved, info.usage);
            await write({ service, task, provider, model, ok: false, kind: info.kind, ms: info.ms, attempt: calls, fallback: attempts.some((attempt) => !attempt.skipped) });
          }
          if (blockedBy) {
            await skip(provider, BLOCK_KIND[blockedBy] ?? "limit", `${KIND_TEXT[BLOCK_KIND[blockedBy] ?? "limit"]} (${blockedBy})`);
            lastKind = BLOCK_KIND[blockedBy] ?? "limit";
            continue;
          }
          firstGeminiError ??= error;
          const kind = error.kind === "config" ? "auth" : error.kind;
          lastKind = kind;
          if (kind === "blocked") throw error; // içerik reddi başka modelde de sorun çıkarabilir
          if (kind === "quota") markFailure(healthKey, "rate", { retryAfter: 120, now: now() });
          if (kind === "auth") markFailure(healthKey, "quota", { retryAfter: AUTH_COOLDOWN_SECONDS, now: now() });
          continue;
        }
      }

      let modelAttempts = 0;
      for (const model of textModelsFor(provider, env)) {
        if (!isFreeTextModel(provider, model)) continue; // FREE_ONLY
        if (modelAttempts >= limit.maxAttempts || calls >= MAX_TOTAL_ATTEMPTS) break;
        const left = deadline - now();
        if (left < MIN_ATTEMPT_MS) break;
        const amounts = reserveFor(model);
        const reserved = await store.reserve(service, amounts).catch(() => ({ ok: false, blockedBy: "store" }));
        if (!reserved.ok) {
          const kind = BLOCK_KIND[reserved.blockedBy] ?? "limit";
          await skip(provider, kind, `${KIND_TEXT[kind]} (${reserved.blockedBy})`);
          lastKind = kind;
          break;
        }
        calls += 1;
        modelAttempts += 1;
        const timeoutMs = hasBackup ? Math.max(MIN_ATTEMPT_MS, Math.min(Math.round(left * 0.6), left - backupReserveMs)) : left;
        const startedAt = now();
        const result = await callCompatible(provider, model, { system, prompt, schema, temperature, maxOutputTokens }, { env, fetchImpl, timeoutMs });
        await settle(model, amounts, result.usage);
        let kind = result.kind;
        let detail = result.detail;
        if (kind === "ok" && schema) {
          const errors = checkSchema(result.data, schema);
          if (errors.length) {
            kind = "invalid";
            detail = errors[0];
          }
        }
        await write({ service, task, provider, model: result.model ?? model, ok: kind === "ok", kind, ms: now() - startedAt, attempt: calls, fallback: attempts.some((attempt) => !attempt.skipped), inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens, rateLimited: kind === "rate" || kind === "quota", ...(result.providerRemaining !== null && result.providerRemaining !== undefined ? { remaining: result.providerRemaining } : {}), ...(detail ? { detail } : {}) });
        if (kind === "ok") {
          markSuccess(healthKey);
          return { data: result.data, model: result.model, provider, attempts };
        }
        lastKind = kind;
        if (kind === "paid") {
          markFailure(healthKey, "quota", { retryAfter: 24 * 60 * 60, now: now() });
          break;
        }
        if (kind === "auth" || kind === "forbidden") {
          markFailure(healthKey, "quota", { retryAfter: AUTH_COOLDOWN_SECONDS, now: now() });
          break;
        }
        if (kind === "quota") {
          markFailure(healthKey, "quota", { retryAfter: provider === "cloudflare" ? secondsUntilUtcMidnight(now()) : result.retryAfter, now: now() });
          break;
        }
        if (kind === "rate") {
          markFailure(healthKey, "rate", { retryAfter: result.retryAfter, now: now() });
          break;
        }
        if (kind === "timeout" || kind === "server") {
          markFailure(healthKey, kind, { now: now() });
          break;
        }
        if (kind === "badrequest") break; // aynı istek başka modelde de geçersiz olabilir
        // capability / missing / invalid / truncated: aynı sağlayıcının sıradaki modeli (deneme sınırı içinde)
      }
    } finally {
      await store.release(service, lease.lease).catch(() => {});
    }
  }

  // Yalnızca Gemini yapılandırılmışsa ve tek sorun Gemini'nin kendi hatasıysa bugünkü mesaj korunur.
  if (firstGeminiError && attempts.every((attempt) => attempt.provider === "gemini" && !attempt.skipped)) throw firstGeminiError;
  if (configured.length === 0) throw new AiError("Hiçbir ücretsiz metin sağlayıcısı yapılandırılmamış (GEMINI_API_KEY).", "config");
  const tried = attempts.filter((attempt) => !attempt.ok);
  const summary = [...new Map(tried.map((attempt) => [attempt.provider, `${TEXT_PROVIDERS[attempt.provider]?.label ?? attempt.provider}: ${attempt.skipped ?? KIND_TEXT[attempt.kind] ?? attempt.kind}`])).values()].join("; ");
  const kind = tried.some((attempt) => ["quota", "rate", "limit"].includes(attempt.kind)) ? "quota" : lastKind === "timeout" ? "timeout" : ["billing", "store"].includes(lastKind) ? "config" : "busy";
  throw new AiError(`Ücretsiz metin sağlayıcılarının hiçbiri yanıt veremedi${summary ? ` (${summary})` : ""}. Ücretli bir modele geçilmedi; taslağın korunuyor, biraz sonra yeniden dene.`, kind);
}
