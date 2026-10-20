import assert from "node:assert/strict";
import { test } from "node:test";
import { AiError, FREE_TEXT_MODELS, generateJson, modelChain } from "@/lib/ai/gemini";

const env = { GEMINI_API_KEY: "test-key" };
const base = { system: "s", prompt: "p", schema: { type: "OBJECT" }, env };

function sse(events) {
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}
const ok = (text, extra = {}) =>
  sse([{ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP", ...extra }], usageMetadata: { totalTokenCount: 42 } }]);
const failure = (status, message = "hata") => Response.json({ error: { message } }, { status });

function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ model: url.match(/models\/([^:]+):/)[1], init });
    const next = responses[calls.length - 1];
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(init) : next;
  };
  return { impl, calls };
}

test("anahtar yalnızca başlıkta gönderilir, yapılandırılmış JSON döner", async () => {
  const { impl, calls } = fakeFetch([
    sse([
      { candidates: [{ content: { parts: [{ text: '{"a":' }] } }] },
      { candidates: [{ content: { parts: [{ text: "1}" }] }, finishReason: "STOP" }], usageMetadata: { totalTokenCount: 7 } },
    ]),
  ]);
  const result = await generateJson({ ...base, fetchImpl: impl });
  assert.deepEqual(result.data, { a: 1 });
  assert.equal(result.model, FREE_TEXT_MODELS[0]);
  assert.equal(result.usage.totalTokenCount, 7);
  assert.equal(calls[0].init.headers["x-goog-api-key"], "test-key");
  assert.ok(!calls[0].init.body.includes("test-key"));
  assert.equal(JSON.parse(calls[0].init.body).generationConfig.responseMimeType, "application/json");
});

test("yoğunluk ve kota hatasında sıradaki ÜCRETSİZ modele geçilir", async () => {
  const { impl, calls } = fakeFetch([failure(503), failure(429, "quota"), ok('{"ok":true}')]);
  const result = await generateJson({ ...base, fetchImpl: impl });
  assert.deepEqual(result.data, { ok: true });
  assert.deepEqual(calls.map((call) => call.model), FREE_TEXT_MODELS.slice(0, 3));
});

test("bütün ücretsiz modellerin kotası dolduysa kota hatası verir, ücretli modele geçmez", async () => {
  const { impl, calls } = fakeFetch(FREE_TEXT_MODELS.map(() => failure(429, "quota")));
  await assert.rejects(
    () => generateJson({ ...base, fetchImpl: impl }),
    (error) => error instanceof AiError && error.kind === "quota" && /Ücretli bir modele geçilmedi/.test(error.message)
  );
  assert.deepEqual(calls.map((call) => call.model), FREE_TEXT_MODELS);
  for (const { model } of calls) assert.ok(!/image|banana|pro|omni/.test(model), model);
});

test("geçersiz anahtar başka model denenmeden bildirilir", async () => {
  const { impl, calls } = fakeFetch([failure(400, "API key not valid. Please pass a valid API key.")]);
  await assert.rejects(() => generateJson({ ...base, fetchImpl: impl }), (error) => error.kind === "config");
  assert.equal(calls.length, 1);
});

test("anahtar yoksa istek atılmaz", async () => {
  const { impl, calls } = fakeFetch([]);
  await assert.rejects(() => generateJson({ ...base, env: {}, fetchImpl: impl }), (error) => error.kind === "config");
  assert.equal(calls.length, 0);
});

test("ücretsiz listede olmayan model yapılandırması reddedilir", () => {
  assert.throws(() => modelChain({ GEMINI_MODEL: "gemini-3.1-pro-preview" }), (error) => error.kind === "config");
  assert.throws(() => modelChain({ GEMINI_MODEL: "gemini-3.1-flash-image" }), (error) => error.kind === "config");
  assert.equal(modelChain({ GEMINI_MODEL: "gemini-3.6-flash" })[0], "gemini-3.6-flash");
  assert.deepEqual(modelChain({}), FREE_TEXT_MODELS);
});

test("bozuk, kesilmiş ve engellenmiş yanıtlar ayrı ayrı ele alınır", async () => {
  const all = (response) => FREE_TEXT_MODELS.map(() => response());

  let fake = fakeFetch(all(() => ok("JSON değil")));
  await assert.rejects(() => generateJson({ ...base, fetchImpl: fake.impl }), (error) => error.kind === "invalid");

  fake = fakeFetch(all(() => ok('{"a":', { finishReason: "MAX_TOKENS" })));
  await assert.rejects(() => generateJson({ ...base, fetchImpl: fake.impl }), (error) => error.kind === "truncated");

  fake = fakeFetch([ok("", { finishReason: "SAFETY" })]);
  await assert.rejects(() => generateJson({ ...base, fetchImpl: fake.impl }), (error) => error.kind === "blocked");
  assert.equal(fake.calls.length, 1);
});

test("yanıt vermeyen model zaman aşımına uğrar ve toplam süre bütçesi aşılmaz", async () => {
  const hang = (init) =>
    new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  const { impl, calls } = fakeFetch(FREE_TEXT_MODELS.map(() => hang));
  const started = Date.now();
  await assert.rejects(
    () => generateJson({ ...base, fetchImpl: impl, budgetMs: 4_300 }),
    (error) => error.kind === "timeout"
  );
  assert.ok(Date.now() - started < 6_000);
  assert.equal(calls.length, 1);
});

test("ağ hatası sıradaki modelle telafi edilir", async () => {
  const { impl } = fakeFetch([new TypeError("fetch failed"), ok('{"ok":1}')]);
  assert.deepEqual((await generateJson({ ...base, fetchImpl: impl })).data, { ok: 1 });
});
