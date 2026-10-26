// Merkezi metin yönlendiricisi: ücretsiz sağlayıcılar arasında kontrollü geçiş.
// Gerçek API çağrısı yapılmaz; tüm yanıtlar sahtedir.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { generateJsonRouted, secondsUntilUtcMidnight, toJsonSchema } from "../lib/ai/textRouter.js";
import { cooldownFor, resetHealth } from "../lib/ai/providerHealth.js";
import { isFreeTextModel } from "../lib/ai/freePolicy.js";
import { createTestStore } from "../lib/ai/usageStore.js";

const SECRET = "test-anahtar-gizli-123";
const PROMPT = "GİZLİ TASLAK METNİ: bu metin loglara yazılmamalı";
const SCHEMA = { type: "OBJECT", properties: { ok: { type: "BOOLEAN" } }, required: ["ok"] };

const sse = (object) =>
  new Response(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(object) }] }, finishReason: "STOP" }] })}\n\n`, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
const jsonResponse = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const chat = (object, model) => jsonResponse(200, { model, choices: [{ message: { content: JSON.stringify(object) }, finish_reason: "stop" }] });

function makeFetch(handlers) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const host = new URL(url).host;
    const provider = host.includes("googleapis") ? "gemini" : host.includes("groq") ? "groq" : host.includes("openrouter") ? "openrouter" : host.includes("cloudflare") ? "cloudflare" : "other";
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ provider, url, body, headers: init.headers });
    const handler = handlers[provider];
    if (!handler) throw new Error(`beklenmeyen çağrı: ${url}`);
    return handler({ url, body, init, count: calls.filter((call) => call.provider === provider).length });
  };
  return { fetchImpl, calls };
}

const baseEnv = { GEMINI_API_KEY: SECRET };
// Her çağrı yalıtılmış bellek deposu kullanır (gerçek .data dosyasına yazılmaz).
// Ücret riski olan servisler (Groq, Cloudflare) testte açıkça "ücretsiz planda" onaylanır.
const ATTESTED = { "text:groq": { billingVerified: true }, "text:cloudflare": { billingVerified: true }, "image:cloudflare": { billingVerified: true } };
// Anahtarlı sağlayıcıların davranışı sınanır; anahtarsız servisler ayrı testlerde.
const KEYED = ["gemini", "groq", "cloudflare", "openrouter"];
const run = (options) => generateJsonRouted({ task: "test", system: "Sistem", prompt: PROMPT, schema: SCHEMA, budgetMs: 30_000, log: () => {}, order: KEYED, store: createTestStore({ overrides: ATTESTED }), ...options });

beforeEach(() => resetHealth());

test("Gemini başarılıysa yedek sağlayıcı çağrılmaz", async () => {
  const { fetchImpl, calls } = makeFetch({ gemini: () => sse({ ok: true }), groq: () => chat({ ok: false }) });
  const result = await run({ env: { ...baseEnv, GROQ_API_KEY: "g" }, fetchImpl });
  assert.equal(result.provider, "gemini");
  assert.deepEqual(result.data, { ok: true });
  assert.equal(calls.filter((call) => call.provider === "groq").length, 0);
});

test("Gemini kotası dolunca Groq'a geçer; loglarda istem ve anahtar yok", async () => {
  const logs = [];
  const { fetchImpl, calls } = makeFetch({
    gemini: () => jsonResponse(429, { error: { message: "Resource exhausted" } }),
    groq: () => chat({ ok: true }, "openai/gpt-oss-120b"),
  });
  const result = await run({ env: { ...baseEnv, GROQ_API_KEY: SECRET }, fetchImpl, log: (entry) => logs.push(JSON.stringify(entry)) });
  assert.equal(result.provider, "groq");
  assert.equal(result.model, "openai/gpt-oss-120b");
  assert.equal(result.attempts[0].kind, "quota");
  assert.equal(result.attempts.at(-1).fallback, true);
  const groqCall = calls.find((call) => call.provider === "groq");
  assert.equal(groqCall.body.response_format.type, "json_object");
  assert.match(groqCall.body.messages[0].content, /"type":"object"/); // şema JSON Schema'ya çevrildi
  for (const line of logs) {
    assert.ok(!line.includes(SECRET) && !line.includes("GİZLİ TASLAK"), line);
  }
});

test("429 + Retry-After: sağlayıcı bekleme süresinde atlanır, sonraki ücretsiz sağlayıcı denenir", async () => {
  let now = 1_000_000;
  const env = { GROQ_API_KEY: "g", OPENROUTER_API_KEY: "o" };
  const { fetchImpl, calls } = makeFetch({
    groq: () => jsonResponse(429, { error: { message: "Rate limit reached" } }, { "retry-after": "30" }),
    openrouter: () => chat({ ok: true }, "nvidia/nemotron-nano-9b-v2:free"),
  });
  const first = await run({ env, fetchImpl, now: () => now });
  assert.equal(first.provider, "openrouter");
  assert.ok(cooldownFor("text:groq", now));
  await run({ env, fetchImpl, now: () => now + 10_000 });
  assert.equal(calls.filter((call) => call.provider === "groq").length, 1, "bekleme süresinde Groq yeniden çağrılmadı");
  await run({ env, fetchImpl, now: () => now + 31_000 });
  assert.equal(calls.filter((call) => call.provider === "groq").length, 2, "süre dolunca yeniden denendi");
});

test("Yetki hatası (401) alan sağlayıcı tekrar tekrar çağrılmaz", async () => {
  const env = { GROQ_API_KEY: "yanlis", OPENROUTER_API_KEY: "o" };
  const { fetchImpl, calls } = makeFetch({
    groq: () => jsonResponse(401, { error: { message: "Invalid API Key" } }),
    openrouter: () => chat({ ok: true }, "x:free"),
  });
  await run({ env, fetchImpl });
  await run({ env, fetchImpl });
  await run({ env, fetchImpl });
  assert.equal(calls.filter((call) => call.provider === "groq").length, 1);
});

test("402 (ücretli kullanım) sağlayıcıyı devre dışı bırakır; havuz biterse ücretli modele geçmeden durur", async () => {
  const env = { OPENROUTER_API_KEY: "o" };
  const { fetchImpl, calls } = makeFetch({ openrouter: () => jsonResponse(402, { error: { message: "Insufficient credits" } }) });
  await assert.rejects(run({ env, fetchImpl }), (error) => {
    assert.match(error.message, /Ücretli bir modele geçilmedi/);
    assert.match(error.message, /ücretli kullanım gerektirdi/);
    return true;
  });
  await assert.rejects(run({ env, fetchImpl }));
  assert.equal(calls.length, 1, "ikinci istekte OpenRouter hiç çağrılmadı");
});

test("FREE_ONLY: ücretsiz olmayan model kimliği kullanılmaz, ücretsiz olmayan yanıt reddedilir", async () => {
  assert.equal(isFreeTextModel("openrouter", "openai/gpt-5"), false);
  assert.equal(isFreeTextModel("openrouter", "google/gemma-4-31b-it:free"), true);
  assert.equal(isFreeTextModel("gemini", "gemini-3.1-pro-preview"), false);
  const env = { OPENROUTER_API_KEY: "o", OPENROUTER_TEXT_MODELS: "openai/gpt-5" };
  const { fetchImpl, calls } = makeFetch({ openrouter: () => chat({ ok: true }, "openai/gpt-5") });
  await assert.rejects(run({ env, fetchImpl }), /Ücretli bir modele geçilmedi/);
  assert.equal(calls[0].body.model, "openrouter/free", "ücretli model kimliği istenmedi");
});

test("Görsel girdi gerektiren görev metin-only sağlayıcıya gitmez", async () => {
  const env = { ...baseEnv, GROQ_API_KEY: "g" };
  const { fetchImpl, calls } = makeFetch({ gemini: () => jsonResponse(503, { error: { message: "overloaded" } }), groq: () => chat({ ok: true }) });
  await assert.rejects(run({ env, fetchImpl, images: [{ mimeType: "image/png", data: "AAAA" }] }), /görsel girdi desteklenmiyor/);
  assert.equal(calls.filter((call) => call.provider === "groq").length, 0);
});

test("Ücretsiz plan kapasitesini aşan uzun istem Groq'a gönderilmez", async () => {
  const env = { GROQ_API_KEY: "g", OPENROUTER_API_KEY: "o" };
  const { fetchImpl, calls } = makeFetch({ groq: () => chat({ ok: true }), openrouter: () => chat({ ok: true }, "a:free") });
  const result = await run({ env, fetchImpl, prompt: "uzun ".repeat(8_000) });
  assert.equal(result.provider, "openrouter");
  assert.equal(calls.filter((call) => call.provider === "groq").length, 0);
});

test("Cloudflare günlük ücretsiz Neuron'u bitince 00:00 UTC'ye kadar beklenir", async () => {
  const now = Date.UTC(2026, 9, 23, 18, 0, 0);
  const env = { CLOUDFLARE_ACCOUNT_ID: "acc", CLOUDFLARE_API_TOKEN: "t" };
  const { fetchImpl } = makeFetch({ cloudflare: () => jsonResponse(429, { errors: [{ message: "You have used up your daily free allocation of 10,000 neurons" }] }) });
  await assert.rejects(run({ env, fetchImpl, now: () => now }), /kota/);
  const cooling = cooldownFor("text:cloudflare", now);
  assert.equal(cooling.kind, "quota");
  assert.equal(cooling.until, Date.UTC(2026, 9, 24, 0, 0, 0));
  assert.equal(secondsUntilUtcMidnight(now), 6 * 3600);
});

test("Zaman aşımında sıradaki sağlayıcıya geçilir", async () => {
  const env = { GROQ_API_KEY: "g", OPENROUTER_API_KEY: "o" };
  const { fetchImpl } = makeFetch({
    // AbortSignal.timeout olay döngüsünü canlı tutmaz; gerçek ağ isteği gibi bekleyen bir zamanlayıcı eklenir.
    groq: ({ init }) =>
      new Promise((resolve, reject) => {
        const pending = setTimeout(() => {}, 60_000);
        init.signal.addEventListener("abort", () => {
          clearTimeout(pending);
          reject(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
        });
      }),
    openrouter: () => chat({ ok: true }, "b:free"),
  });
  const result = await run({ env, fetchImpl, budgetMs: 4_500 * 3 });
  assert.equal(result.provider, "openrouter");
  assert.ok(result.attempts.some((attempt) => attempt.provider === "groq" && attempt.kind === "timeout"));
});

test("Yalnızca Gemini varsa bugünkü Gemini hata mesajı aynen korunur", async () => {
  const { fetchImpl } = makeFetch({ gemini: () => jsonResponse(429, { error: { message: "quota" } }) });
  await assert.rejects(run({ env: baseEnv, fetchImpl }), (error) => {
    assert.equal(error.kind, "quota");
    assert.match(error.message, /Gemini ücretsiz kotası doldu/);
    return true;
  });
});

test("Hiçbir anahtar yoksa yapılandırma hatası", async () => {
  await assert.rejects(run({ env: {}, fetchImpl: () => assert.fail("çağrı olmamalı") }), (error) => error.kind === "config");
});

test("Gemini şeması JSON Schema'ya çevrilir", () => {
  assert.deepEqual(toJsonSchema({ type: "OBJECT", properties: { a: { type: "ARRAY", items: { type: "STRING", enum: ["x"] } } }, required: ["a"] }), {
    type: "object",
    properties: { a: { type: "array", items: { type: "string", enum: ["x"] } } },
    required: ["a"],
  });
});

test("Ücret riski doğrulanmamış servis (Groq) rotasyona girmez; sıradaki ücretsiz servis kullanılır", async () => {
  const { fetchImpl, calls } = makeFetch({ groq: () => chat({ ok: true }), openrouter: () => chat({ ok: true }, "c:free") });
  const result = await run({ env: { GROQ_API_KEY: "g", OPENROUTER_API_KEY: "o" }, fetchImpl, store: createTestStore() });
  assert.equal(result.provider, "openrouter");
  assert.equal(calls.filter((call) => call.provider === "groq").length, 0);
  assert.match(result.attempts.find((attempt) => attempt.provider === "groq").skipped, /Ücret riski doğrulanmadı/);
});

test("Panelden verilen geçiş sırası uygulanır", async () => {
  const { fetchImpl, calls } = makeFetch({ gemini: () => sse({ ok: true }), openrouter: () => chat({ ok: true }, "d:free") });
  const store = createTestStore({ overrides: { "text:openrouter": { priority: 1 }, "text:gemini": { priority: 9 } } });
  const result = await run({ env: { ...baseEnv, OPENROUTER_API_KEY: "o" }, fetchImpl, store });
  assert.equal(result.provider, "openrouter");
  assert.equal(calls.filter((call) => call.provider === "gemini").length, 0);
});

test("Anahtarsız servis (OVHcloud anonim): yetki başlığı ve JSON modu gönderilmez; çıktı şemayla doğrulanır", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return chat({ ok: true }, "gpt-oss-120b");
  };
  const result = await run({ env: {}, fetchImpl, order: ["ovh"], store: createTestStore() });
  assert.equal(result.provider, "ovh");
  assert.match(calls[0].url, /oai\.endpoints\.kepler\.ai\.cloud\.ovh\.net\/v1\/chat\/completions$/);
  assert.equal(calls[0].init.headers.authorization, undefined);
  assert.equal(calls[0].body.response_format, undefined);
});

test("Varsayılan kapalı anahtarsız servisler (LLM7, Pollinations metin) çağrılmaz", async () => {
  const { fetchImpl, calls } = makeFetch({ other: () => chat({ ok: true }) });
  await assert.rejects(run({ env: {}, fetchImpl, order: ["llm7", "pollinations"], store: createTestStore() }), /panelden devre dışı/);
  assert.equal(calls.length, 0);
});

test("Türkçe içerik kalitesi zayıf olduğu bilinen model taslak görevine gönderilmez", async () => {
  const { TEXT_PROVIDERS } = await import("../lib/ai/freePolicy.js");
  const original = TEXT_PROVIDERS.ovh.turkish;
  TEXT_PROVIDERS.ovh.turkish = "weak";
  try {
    const { fetchImpl, calls } = makeFetch({ other: () => chat({ ok: true }) });
    await assert.rejects(run({ task: "draft", env: {}, fetchImpl, order: ["ovh"], store: createTestStore() }), /Türkçe içerik kalitesi yetersiz/);
    assert.equal(calls.length, 0);
  } finally {
    TEXT_PROVIDERS.ovh.turkish = original;
  }
});

test("kapalı servisler yedek sayılmaz: tek kullanılabilir servis bütçenin tamamını kullanır", async () => {
  // OVH 4,5 sn'de yanıt verir. LLM7 ve Pollinations varsayılan kapalıdır; yedek sayılsaydı
  // OVH'ye en fazla 4 sn verilir ve yanıt gelmeden zaman aşımı olurdu.
  const fetchImpl = (url, init) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(new Response(JSON.stringify({ model: "Meta-Llama-3_3-70B-Instruct", choices: [{ message: { content: JSON.stringify({ ok: true }) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200, headers: { "content-type": "application/json" } })), 4_500);
      init.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("aborted", "TimeoutError"));
      });
    });
  const result = await generateJsonRouted({ task: "visual-plan", system: "s", prompt: "p", schema: { type: "OBJECT", properties: { ok: { type: "BOOLEAN" } }, required: ["ok"] }, budgetMs: 6_000, env: {}, fetchImpl, order: ["ovh", "llm7", "pollinations"], store: createTestStore(), log: () => {} });
  assert.equal(result.provider, "ovh");
});

test("yedek için süre ayrılır: Gemini yanıt vermese de OVH yedeği yetişir", async () => {
  // Gemini hiç yanıt vermez (iptal edilene kadar bekler); OVH 4,5 sn'de yanıt verir.
  // Ayrılmış süre olmasa Gemini bütçenin %70'ini harcar ve OVH'ye deneme süresi kalmazdı.
  const hang = ({ init }) => new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  const slowOvh = () => new Promise((resolve) => setTimeout(() => resolve(chat({ ok: true }, "Meta-Llama-3_3-70B-Instruct")), 4_500));
  const { fetchImpl } = makeFetch({ gemini: hang, other: slowOvh });
  const result = await generateJsonRouted({ task: "visual-plan", system: "s", prompt: "p", schema: SCHEMA, budgetMs: 10_000, backupReserveMs: 5_000, env: baseEnv, fetchImpl, order: ["gemini", "ovh"], store: createTestStore(), log: () => {} });
  assert.equal(result.provider, "ovh");
});

