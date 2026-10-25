// Ücretsiz AI sağlayıcılarını GERÇEK kısa istekle yoklar (yeniden doğrulama için).
//   node --import ./tests/register.mjs scripts/ai/probe-providers.mjs [--only gemini,ovh,...]
// - Anahtarlar .env.local'dan yalnızca süreç belleğine yüklenir; hiçbir değer yazdırılmaz.
// - Her aday için tek bir kısa Türkçe JSON isteği gönderilir (müşteri verisi yok).
// - Anahtarı olmayan sağlayıcı "anahtar eksik" olarak işaretlenir; bu, ücretsiz
//   kotanın çalışmadığı anlamına gelmez, yalnızca gerçek testin yapılamadığını gösterir.
// - Ücretli model çağrılmaz: OpenRouter'da yalnızca ':free', Groq/Cloudflare'de
//   kayıttaki ücretsiz modeller kullanılır.

import { createRequire } from "node:module";
const nextEnv = createRequire(new URL("../../package.json", import.meta.url))("@next/env");
nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });
const { generateJson } = await import("../../lib/ai/gemini.js");

const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null;
const SYSTEM = "Yanıtı YALNIZCA tek bir JSON nesnesi olarak ver.";
const PROMPT = 'Türkçe tek cümleyle "dijital pazarlama nedir?" sorusunu yanıtla. Biçim: {"cevap": "..."}';
const TURKISH = /[çğıöşüÇĞİÖŞÜ]|\b(ve|bir|için|ile|olarak|pazarlama)\b/i;

const parse = (text) => {
  try {
    return JSON.parse(String(text).replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
  } catch {
    return null;
  }
};

async function chat(name, url, model, headers = {}, timeoutMs = 45_000) {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ model, temperature: 0.3, max_tokens: 300, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: PROMPT }] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const raw = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      // düz metin
    }
    const ms = Date.now() - started;
    if (!response.ok) return { name, model, ok: false, status: response.status, ms, error: String(payload?.error?.message ?? payload?.message ?? raw).slice(0, 140), retryAfter: response.headers.get("retry-after") };
    const content = payload?.choices?.[0]?.message?.content ?? raw;
    const json = parse(content);
    const answer = json?.cevap ?? null;
    return { name, model: payload?.model ?? model, ok: Boolean(answer), status: response.status, ms, json: Boolean(json), turkish: Boolean(answer && TURKISH.test(answer)), sample: answer ? String(answer).slice(0, 90) : String(content).slice(0, 90) };
  } catch (error) {
    return { name, model, ok: false, ms: Date.now() - started, error: error.name === "TimeoutError" ? "zaman aşımı" : error.message };
  }
}

async function listModels(url, headers = {}) {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return { status: response.status, models: [] };
    const payload = await response.json();
    return { status: response.status, models: (payload.data ?? payload.models ?? payload).map((model) => model.id ?? model.name ?? model).filter(Boolean) };
  } catch (error) {
    return { status: 0, models: [], error: error.message };
  }
}

const env = process.env;
const missing = (name, vars) => ({ name, ok: false, skipped: `anahtar eksik (${vars.join(", ")})` });
const PROBES = {
  async gemini() {
    if (!env.GEMINI_API_KEY) return missing("gemini", ["GEMINI_API_KEY"]);
    const started = Date.now();
    try {
      const result = await generateJson({ system: SYSTEM, prompt: PROMPT, schema: { type: "OBJECT", properties: { cevap: { type: "STRING" } }, required: ["cevap"] }, maxOutputTokens: 400, budgetMs: 40_000 });
      const answer = result.data?.cevap;
      return { name: "gemini", model: result.model, ok: Boolean(answer), ms: Date.now() - started, json: true, turkish: TURKISH.test(answer ?? ""), sample: String(answer ?? "").slice(0, 90), tokens: result.usage?.totalTokenCount ?? null };
    } catch (error) {
      return { name: "gemini", ok: false, ms: Date.now() - started, error: `${error.kind}: ${error.message.slice(0, 120)}` };
    }
  },
  async groq() {
    if (!env.GROQ_API_KEY) return missing("groq", ["GROQ_API_KEY"]);
    return chat("groq", "https://api.groq.com/openai/v1/chat/completions", "openai/gpt-oss-120b", { authorization: `Bearer ${env.GROQ_API_KEY}` });
  },
  async openrouter() {
    if (!env.OPENROUTER_API_KEY) return missing("openrouter", ["OPENROUTER_API_KEY"]);
    const key = await fetch("https://openrouter.ai/api/v1/key", { headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}` } }).then((r) => r.json()).catch(() => null);
    const result = await chat("openrouter", "https://openrouter.ai/api/v1/chat/completions", "openrouter/free", { authorization: `Bearer ${env.OPENROUTER_API_KEY}` });
    return { ...result, freeTier: key?.data?.is_free_tier ?? null, limit: key?.data?.limit ?? null };
  },
  async cloudflare() {
    if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) return missing("cloudflare", ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"]);
    return chat("cloudflare", `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`, "@cf/openai/gpt-oss-120b", { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` });
  },
  async ovh() {
    const base = "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1";
    const list = await listModels(`${base}/models`);
    const model = list.models.find((id) => /gpt-oss-120b/i.test(id)) ?? list.models.find((id) => /llama-3_3-70b/i.test(id)) ?? list.models[0] ?? "gpt-oss-120b";
    return { ...(await chat("ovh-anonim", `${base}/chat/completions`, model)), modelsListed: list.models.length };
  },
  async llm7() {
    const list = await listModels("https://api.llm7.io/v1/models");
    return { ...(await chat("llm7-anonim", "https://api.llm7.io/v1/chat/completions", "default")), modelsListed: list.models.length, listStatus: list.status };
  },
  async kilo() {
    return chat("kilo-anonim", "https://api.kilo.ai/api/gateway/chat/completions", "kilo-auto/free");
  },
  async pollinationsText() {
    return chat("pollinations-metin", "https://text.pollinations.ai/openai", "openai");
  },
  async designArena() {
    if (!env.DESIGN_ARENA_API_KEY) return missing("design-arena", ["DESIGN_ARENA_API_KEY"]);
    const response = await fetch("https://www.designarena.ai/api/v1/arenas", { headers: { authorization: `Bearer ${env.DESIGN_ARENA_API_KEY}` } }).catch(() => null);
    return { name: "design-arena", ok: response?.ok ?? false, status: response?.status ?? 0, note: "yalnızca sıralama verisi; üretim API'si değil" };
  },
};

for (const [key, probe] of Object.entries(PROBES)) {
  if (only && !only.includes(key)) continue;
  console.log(JSON.stringify(await probe()));
}
