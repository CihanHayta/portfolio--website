// Uygulamanın kendi AI limitleri: rezervasyon, eşzamanlılık, günlük sıfırlama,
// kalıcılık, admin doğrulaması, ücret koruması ve yönlendiricilerle birlikte çalışma.
// Gerçek API ya da veritabanı kullanılmaz.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import sharp from "sharp";
import { CEILINGS, DEFAULT_LIMITS, effectiveLimits, limitDay, limitWindow, sanitizeOverride } from "../lib/ai/limits.js";
import { billingGuard, createTestStore, getUsageStore, storeMode } from "../lib/ai/usageStore.js";
import { generateJsonRouted } from "../lib/ai/textRouter.js";
import { generateImage, clearImageCache } from "../lib/ai/imageRouter.js";
import { resetHealth } from "../lib/ai/providerHealth.js";
import { checkSchema } from "../lib/ai/schemaCheck.js";

beforeEach(() => {
  resetHealth();
  clearImageCache();
});

test("Limite kadar istek kabul edilir, sonrası engellenir", async () => {
  const store = createTestStore();
  await store.setOverride("text:groq", { dailyRequests: 3 });
  const results = [];
  for (let i = 0; i < 5; i += 1) results.push(await store.reserve("text:groq", { requests: 1 }));
  assert.deepEqual(results.map((result) => result.ok), [true, true, true, false, false]);
  assert.equal(results[3].blockedBy, "requests");
});

test("Eşzamanlı 20 istek limiti (5) aşamaz", async () => {
  const store = createTestStore();
  await store.setOverride("image:pollinations", { dailyRequests: 100, dailyImages: 5 });
  const results = await Promise.all(Array.from({ length: 20 }, () => store.reserve("image:pollinations", { requests: 1, images: 1 })));
  assert.equal(results.filter((result) => result.ok).length, 5);
  const snapshot = await store.snapshot();
  assert.equal(snapshot.today["image:pollinations"].images, 5);
});

test("Metin ve görsel sayaçları ayrıdır; Cloudflare Neuron tahmini ortaktır", async () => {
  const store = createTestStore();
  await store.setOverride("cloudflare", { dailyNeurons: 100 });
  assert.equal((await store.reserve("text:cloudflare", { requests: 1, tokens: 500, neurons: 60 })).ok, true);
  const image = await store.reserve("image:cloudflare", { requests: 1, images: 1, neurons: 60 });
  assert.equal(image.ok, false);
  assert.equal(image.blockedBy, "neurons");
  assert.equal((await store.reserve("image:cloudflare", { requests: 1, images: 1, neurons: 40 })).ok, true);
  const snapshot = await store.snapshot();
  assert.deepEqual(snapshot.today["text:cloudflare"], { requests: 1, tokens: 500, images: 0 });
  assert.deepEqual(snapshot.today["image:cloudflare"], { requests: 1, tokens: 0, images: 1 });
  assert.equal(snapshot.neuronsToday, 100);
});

test("Günlük sayaç Europe/Istanbul gece yarısında sıfırlanır (UTC'de değil)", async () => {
  let now = Date.parse("2026-10-23T20:59:59Z"); // İstanbul 23:59:59
  const store = createTestStore({ now: () => now });
  await store.setOverride("text:openrouter", { dailyRequests: 1 });
  assert.equal((await store.reserve("text:openrouter", { requests: 1 })).ok, true);
  assert.equal((await store.reserve("text:openrouter", { requests: 1 })).ok, false);
  now = Date.parse("2026-10-23T21:00:00Z"); // İstanbul 00:00:00 — yeni gün (UTC hâlâ 23 Ekim)
  assert.equal((await store.reserve("text:openrouter", { requests: 1 })).ok, true);
  assert.equal(limitDay(now), "2026-10-24");
  assert.deepEqual(limitWindow(now), { day: "2026-10-24", start: "2026-10-23T21:00:00.000Z", end: "2026-10-24T21:00:00.000Z" });
});

test("Pasif servis rezervasyon alamaz; admin değerleri resmî üst sınıra kırpılır", async () => {
  const store = createTestStore();
  await store.setOverride("text:groq", { enabled: false });
  assert.equal((await store.reserve("text:groq", { requests: 1 })).blockedBy, "disabled");
  assert.deepEqual(sanitizeOverride("text:groq", { dailyRequests: 5000, maxConcurrent: 0, freeOnly: false, bilinmeyen: 1 }), { dailyRequests: CEILINGS["text:groq"].dailyRequests, maxConcurrent: 1 });
  assert.deepEqual(sanitizeOverride("image:pollinations", { dailyTokens: 10, dailyImages: 3 }), { dailyImages: 3 }, "görsel servisinde token limiti olmaz");
  assert.equal(sanitizeOverride("text:yok", { dailyRequests: 1 }), null);
  const limits = effectiveLimits({ "text:openrouter": { dailyRequests: 9999 } });
  assert.equal(limits["text:openrouter"].dailyRequests, 50, "OpenRouter'ın 50/gün sınırı aşılamaz");
  assert.equal(limits["text:gemini"].freeOnly, true, "ücretsiz mod kilitli");
  assert.equal(limits.cloudflare.dailyNeurons, 9_000);
  assert.equal(effectiveLimits({ cloudflare: { dailyNeurons: 50_000 } }).cloudflare.dailyNeurons, 10_000);
});

test("Dosya deposu yeniden başlatmada sayaçları ve limitleri korur; gizli alan yazmaz", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-usage-"));
  const filePath = join(dir, "usage.json");
  try {
    const first = createTestStore({ filePath });
    await first.setOverride("text:gemini", { dailyRequests: 7 });
    await first.reserve("text:gemini", { requests: 1, tokens: 1200 });
    await first.reserve("text:gemini", { requests: 1, tokens: 800 });
    await first.record({ at: new Date().toISOString(), service: "text:gemini", provider: "gemini", ok: true, kind: "ok" });
    await first.flush();
    const restarted = createTestStore({ filePath }); // yeni süreç gibi
    const snapshot = await restarted.snapshot();
    assert.equal(snapshot.persistent, true);
    assert.deepEqual(snapshot.today["text:gemini"], { requests: 2, tokens: 2000, images: 0 });
    assert.equal(snapshot.limits["text:gemini"].dailyRequests, 7);
    assert.ok(snapshot.health["text:gemini"].lastOkAt);
    const raw = readFileSync(filePath, "utf8");
    assert.ok(!/key|token=|cookie|prompt/i.test(raw.replace(/"tokens"/g, "")), "dosyada anahtar/istem yok");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Eşzamanlı iş sınırı: kilit dolunca yeni iş başlamaz, bırakınca açılır, süre aşımıyla düşer", async () => {
  let now = 1_000_000;
  const store = createTestStore({ now: () => now });
  const a = await store.acquire("image:comfyui", 1);
  assert.equal(a.ok, true);
  assert.equal((await store.acquire("image:comfyui", 1)).ok, false);
  await store.release("image:comfyui", a.lease);
  const b = await store.acquire("image:comfyui", 1);
  assert.equal(b.ok, true);
  now += 4 * 60_000; // kilit 3 dk sonra kendiliğinden düşer (çöken iş takılı kalmaz)
  assert.equal((await store.acquire("image:comfyui", 1)).ok, true);
});

test("İş kaydı: aynı anahtarla ikinci iş açılmaz; başarısız iş güvenle yeniden başlatılabilir", async () => {
  const store = createTestStore();
  const first = await store.beginJob("op-12345678", "visual-plan");
  const second = await store.beginJob("op-12345678", "visual-plan");
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  await store.updateJob("op-12345678", { status: "failed", errorKind: "quota" });
  const retry = await store.beginJob("op-12345678", "visual-plan");
  assert.equal(retry.created, true);
  assert.equal(retry.job.attempts, 2);
  assert.equal(await store.updateJob("op-12345678", { status: "uydurma" }), null);
});

test("Ücret koruması: canlıda kalıcı Supabase deposu yoksa faturalandırma riski olan servis durur", () => {
  const memory = createTestStore();
  const file = createTestStore({ filePath: join(tmpdir(), "yok", "x.json") });
  const prod = { VERCEL_ENV: "production" };
  assert.equal(billingGuard("text:gemini", memory, prod).allowed, false);
  assert.equal(billingGuard("text:gemini", file, prod).allowed, false, "dosya deposu çok örnekli canlıda geçerli değil");
  assert.equal(billingGuard("text:openrouter", memory, prod).allowed, true, ":free modeller ücret oluşturmaz");
  assert.equal(billingGuard("text:gemini", memory, {}).allowed, true, "yerelde serbest");
  assert.equal(billingGuard("text:gemini", { mode: "supabase", persistent: true }, prod).allowed, true);
  assert.equal(storeMode({ VERCEL: "1" }), "memory");
  assert.equal(storeMode({}), "file");
  assert.equal(storeMode({ AI_USAGE_STORE: "supabase" }), "supabase");
});

test("Supabase adaptörü: atomik RPC'yi çağırır; depo hatasında güvenle durur", async () => {
  const calls = [];
  const db = {
    from: () => ({ select: async () => ({ data: [{ key: "text:groq", values: { dailyRequests: 2 } }], error: null }) }),
    rpc: async (name, args) => {
      calls.push([name, args]);
      return args.p_requests > 0 && calls.length > 1 ? { data: [{ ok: false, blocked_by: "requests" }], error: null } : { data: [{ ok: true, blocked_by: null }], error: null };
    },
  };
  const store = getUsageStore({ env: { AI_USAGE_STORE: "supabase" }, db, now: () => Date.parse("2026-10-23T21:30:00Z") });
  assert.equal(store.mode, "supabase");
  assert.equal((await store.reserve("text:groq", { requests: 1 })).ok, true);
  const blocked = await store.reserve("text:groq", { requests: 1 });
  assert.deepEqual([blocked.ok, blocked.blockedBy], [false, "requests"]);
  assert.equal(calls[0][1].p_max_requests, 2);
  assert.equal(calls[0][1].p_day, "2026-10-24", "İstanbul günü gönderilir");
  assert.equal(calls[0][1].p_neuron_day, "2026-10-23", "Neuron günü UTC");
  const broken = getUsageStore({ env: { AI_USAGE_STORE: "supabase" }, db: { ...db, rpc: async () => ({ data: null, error: new Error("ağ") }) } });
  const failed = await broken.reserve("text:groq", { requests: 1 });
  assert.deepEqual([failed.ok, failed.blockedBy], [false, "store"]);
});

// --- Yönlendiricilerle birlikte -----------------------------------------------------
const chat = (object, model) => new Response(JSON.stringify({ model, choices: [{ message: { content: JSON.stringify(object) }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 50 } }), { status: 200, headers: { "content-type": "application/json", "x-ratelimit-remaining-requests": "997" } });
const SCHEMA = { type: "OBJECT", properties: { ok: { type: "BOOLEAN" } }, required: ["ok"] };
const text = (options) => generateJsonRouted({ task: "visual-plan", system: "S", prompt: "P", schema: SCHEMA, budgetMs: 30_000, log: () => {}, order: ["gemini", "groq", "cloudflare", "openrouter"], ...options });

test("Uygulama limiti dolan sağlayıcıya istek gitmez; sıradaki ücretsiz sağlayıcı kullanılır; gerçek token uzlaştırılır", async () => {
  const store = createTestStore({ overrides: { "text:groq": { billingVerified: true } } });
  await store.setOverride("text:groq", { dailyRequests: 1 });
  const hosts = [];
  const fetchImpl = async (url) => {
    const host = new URL(url).host;
    hosts.push(host);
    return host.includes("groq") ? chat({ ok: true }, "openai/gpt-oss-120b") : chat({ ok: true }, "a:free");
  };
  const env = { GROQ_API_KEY: "g", OPENROUTER_API_KEY: "o" };
  assert.equal((await text({ env, fetchImpl, store })).provider, "groq");
  const second = await text({ env, fetchImpl, store });
  assert.equal(second.provider, "openrouter");
  assert.equal(hosts.filter((host) => host.includes("groq")).length, 1);
  assert.ok(second.attempts.some((attempt) => attempt.provider === "groq" && attempt.kind === "limit"));
  const snapshot = await store.snapshot();
  assert.deepEqual(snapshot.today["text:groq"], { requests: 1, tokens: 150, images: 0 }, "token tahmini gerçek kullanımla (100+50) uzlaştırıldı");
  assert.equal(snapshot.events.find((event) => event.provider === "groq" && event.ok).remaining, 997, "sağlayıcının bildirdiği gerçek kalan istek");
});

test("Bütün ücretsiz sağlayıcıların limiti dolunca hiçbir çağrı yapılmaz ve anlaşılır hata verilir", async () => {
  const store = createTestStore();
  await store.setOverride("text:groq", { dailyRequests: 0 });
  await store.setOverride("text:openrouter", { dailyRequests: 0 });
  await assert.rejects(text({ env: { GROQ_API_KEY: "g", OPENROUTER_API_KEY: "o" }, fetchImpl: () => assert.fail("çağrı olmamalı"), store }), (error) => {
    assert.equal(error.kind, "quota");
    assert.match(error.message, /uygulama günlük limiti doldu/);
    assert.match(error.message, /Ücretli bir modele geçilmedi; taslağın korunuyor/);
    return true;
  });
});

test("Limit deposuna ulaşılamazsa güvenli durdurma: hiçbir sağlayıcı çağrılmaz", async () => {
  const store = { ...createTestStore(), limits: async () => { throw new Error("depo yok"); } };
  await assert.rejects(text({ env: { OPENROUTER_API_KEY: "o" }, fetchImpl: () => assert.fail("çağrı olmamalı"), store }), /limit deposuna ulaşılamadı/);
});

test("Şemaya uymayan çıktı başarılı sayılmaz; sınırlı denemeyle sıradaki sağlayıcıya geçilir", async () => {
  const store = createTestStore({ overrides: { "text:groq": { billingVerified: true } } });
  let groqCalls = 0;
  const fetchImpl = async (url) => {
    if (new URL(url).host.includes("groq")) {
      groqCalls += 1;
      return chat({ yanlis: 1 }, "openai/gpt-oss-120b");
    }
    return chat({ ok: true }, "b:free");
  };
  const result = await text({ env: { GROQ_API_KEY: "g", OPENROUTER_API_KEY: "o" }, fetchImpl, store });
  assert.equal(result.provider, "openrouter");
  assert.equal(groqCalls, DEFAULT_LIMITS["text:groq"].maxAttempts, "Groq en fazla deneme sınırı kadar çağrıldı");
  assert.ok(result.attempts.some((attempt) => attempt.kind === "invalid" && /zorunlu alan/.test(attempt.detail)));
  assert.deepEqual(checkSchema({ ok: "evet" }, SCHEMA), ["$.ok: BOOLEAN bekleniyordu, STRING geldi"]);
});

test("Görsel limiti metinden ayrıdır; görsel limiti dolunca üretim durur ve metin sayacı etkilenmez", async () => {
  const store = createTestStore();
  await store.setOverride("image:pollinations", { dailyImages: 1 });
  const png = await sharp(Buffer.from(Array.from({ length: 64 * 64 * 3 }, (_, i) => (i * 13) % 256)), { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer();
  const fetchImpl = async () => new Response(png, { status: 200, headers: { "x-model-used": "sana" } });
  const ok = await generateImage({ prompt: "a", env: {}, fetchImpl, store, log: () => {}, order: ["pollinations"] });
  assert.equal(ok.provider, "pollinations");
  await assert.rejects(generateImage({ prompt: "b", env: {}, fetchImpl, store, log: () => {}, order: ["pollinations"] }), /uygulama günlük limiti doldu/);
  const snapshot = await store.snapshot();
  assert.equal(snapshot.today["image:pollinations"].images, 1);
  assert.equal(snapshot.today["text:gemini"], undefined);
});

test("Bozuk görsel çıktısında görsel sayacı geri alınır, istek sayılı kalır", async () => {
  const store = createTestStore();
  const fetchImpl = async () => new Response(Buffer.from("bozuk ".repeat(300)), { status: 200 });
  await assert.rejects(generateImage({ prompt: "c", env: {}, fetchImpl, store, log: () => {}, order: ["pollinations"] }));
  const snapshot = await store.snapshot();
  assert.deepEqual(snapshot.today["image:pollinations"], { requests: 1, tokens: 0, images: 0 });
});

test("billingVerified yalnızca ücret riski olan servislerde ayarlanabilir; sıra 1–99", () => {
  assert.deepEqual(sanitizeOverride("text:openrouter", { billingVerified: true, priority: 300 }), { priority: 99 });
  assert.deepEqual(sanitizeOverride("text:groq", { billingVerified: true, priority: 0 }), { priority: 1, billingVerified: true });
  assert.equal(effectiveLimits({})["text:gemini"].billingVerified, true, "Gemini: kullanıcı Free tier'ı doğruladı");
  assert.equal(effectiveLimits({})["text:groq"].billingVerified, false);
  assert.equal(effectiveLimits({})["text:llm7"].enabled, false, "şartları doğrulanmayan anonim servis varsayılan kapalı");
});

test("Design Arena: anahtar yoksa yapılandırılmamış; varsa yalnızca sıralama bilgisi (mock), atıflı", async () => {
  const { designArenaInfo, resetDesignArenaCache } = await import("../lib/ai/designArena.js");
  resetDesignArenaCache();
  assert.equal((await designArenaInfo({ env: {} })).configured, false);
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, auth: Boolean(init.headers.authorization) });
    return new Response(JSON.stringify({ data: [{ name: "Model A", elo: 1312.4, arena: "models" }, { model_name: "Model B", rating: 1290 }] }), { status: 200 });
  };
  const info = await designArenaInfo({ env: { DESIGN_ARENA_API_KEY: "x" }, fetchImpl, now: 1 });
  assert.deepEqual(info.top, [{ name: "Model A", elo: 1312, arena: "models" }, { name: "Model B", elo: 1290, arena: null }]);
  assert.match(info.attribution, /Design Arena/);
  assert.match(calls[0].url, /\/api\/v1\/models$/);
  await designArenaInfo({ env: { DESIGN_ARENA_API_KEY: "x" }, fetchImpl, now: 1000 });
  assert.equal(calls.length, 1, "1 saat önbellek");
  resetDesignArenaCache();
  const denied = await designArenaInfo({ env: { DESIGN_ARENA_API_KEY: "x" }, fetchImpl: async () => new Response("{}", { status: 403 }), now: 2 });
  assert.equal(denied.ok, false);
});
