// Gemini API istemcisi (REST). Anahtar yalnızca sunucudaki GEMINI_API_KEY
// ortam değişkeninden okunur; istemciye hiçbir biçimde gönderilmez.
//
// Yalnızca resmî fiyat sayfasında ücretsiz katmanı bulunan metin modelleri
// kullanılır (https://ai.google.dev/gemini-api/docs/pricing — Ekim 2026).
// Kota dolduğunda sıradaki ücretsiz modele geçilir; ücretli bir modele ya da
// görsel modeline asla geçilmez.

export class AiError extends Error {
  constructor(message, kind = "error") {
    super(message);
    this.kind = kind; // "config" | "quota" | "busy" | "timeout" | "blocked" | "invalid" | "error"
  }
}

export const FREE_TEXT_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3-flash-preview",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
];

// Yoğunluk ya da kota hatasında soldan sağa denenir; en yetenekli model öndedir.
const DEFAULT_MODELS = [...FREE_TEXT_MODELS];
// Aşırı yüklü model bağlantıyı açık tutup hiç yanıt vermeyebiliyor; ilk veri
// bu süre içinde gelmezse beklemek yerine sıradaki modele geçilir.
const FIRST_BYTE_TIMEOUT_MS = 10_000;
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

// GEMINI_MODEL ile sıra değiştirilebilir; ücretsiz listede olmayan model reddedilir.
export function modelChain(env = process.env) {
  const requested = String(env.GEMINI_MODEL ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const paid = requested.filter((name) => !FREE_TEXT_MODELS.includes(name));
  if (paid.length > 0) {
    throw new AiError(
      `GEMINI_MODEL ücretsiz katmanda olmayan bir model içeriyor (${paid.join(", ")}). ` +
        `İzin verilenler: ${FREE_TEXT_MODELS.join(", ")}.`,
      "config"
    );
  }
  return [...new Set([...requested, ...DEFAULT_MODELS])];
}

function classify(status, body) {
  const message = String(body?.error?.message ?? "");
  if (status === 429) return "quota";
  if (status === 400 && /API key not valid|API_KEY_INVALID/i.test(message)) return "config";
  if (status === 401 || status === 403) return "config";
  if (status === 404) return "missing";
  if (status === 500 || status === 502 || status === 503 || status === 504) return "busy";
  return "error";
}

// Yanıt akış (SSE) olarak okunur: böylece hiç yanıt vermeyen model erken
// fark edilir, uzun süren ama ilerleyen üretim ise kesilmez.
async function callModel(model, payload, apiKey, timeoutMs, fetchImpl) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => {
    timedOut = true;
    controller.abort();
  };
  const total = setTimeout(abort, timeoutMs);
  let firstByte = setTimeout(abort, Math.min(FIRST_BYTE_TIMEOUT_MS, timeoutMs));

  try {
    const response = await fetchImpl(`${ENDPOINT}/${model}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      let body = null;
      try {
        body = await response.json();
      } catch {
        // Gövde JSON değilse durum koduna göre değerlendirilir.
      }
      return { kind: classify(response.status, body), detail: body?.error?.message };
    }

    const decoder = new TextDecoder();
    let pending = "";
    let text = "";
    let finishReason = null;
    let blockReason = null;
    let usage = null;

    const readEvent = (line) => {
      if (!line.startsWith("data:")) return;
      let event;
      try {
        event = JSON.parse(line.slice(5));
      } catch {
        return;
      }
      const candidate = event.candidates?.[0];
      for (const part of candidate?.content?.parts ?? []) {
        if (typeof part.text === "string" && !part.thought) text += part.text;
      }
      if (candidate?.finishReason) finishReason = candidate.finishReason;
      if (event.promptFeedback?.blockReason) blockReason = event.promptFeedback.blockReason;
      if (event.usageMetadata) usage = event.usageMetadata;
    };

    for await (const chunk of response.body) {
      clearTimeout(firstByte);
      firstByte = null;
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop();
      lines.forEach(readEvent);
    }
    readEvent(pending);

    if (blockReason || ["SAFETY", "RECITATION", "PROHIBITED_CONTENT", "BLOCKLIST"].includes(finishReason)) {
      return { kind: "blocked" };
    }
    if (finishReason === "MAX_TOKENS") return { kind: "truncated" };
    if (!text.trim()) return { kind: "invalid", detail: `boş yanıt (bitiş: ${finishReason ?? "yok"})` };

    try {
      const data = JSON.parse(text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
      return { kind: "ok", data, usage };
    } catch (error) {
      return { kind: "invalid", detail: `${text.length} karakter, bitiş: ${finishReason ?? "yok"}, ${error.message}`.slice(0, 200) };
    }
  } catch {
    return { kind: timedOut ? "timeout" : "busy" };
  } finally {
    clearTimeout(total);
    clearTimeout(firstByte);
  }
}

const FAILURE_MESSAGES = {
  quota:
    "Gemini ücretsiz kotası doldu. Ücretli bir modele geçilmedi; birkaç dakika sonra (günlük kota dolduysa yarın) yeniden dene.",
  busy: "Gemini şu anda yoğun ve yanıt veremedi. Biraz sonra yeniden dene.",
  timeout: "Gemini zamanında yanıt vermedi. Yeniden dene.",
  blocked: "Gemini bu içerik için yanıt üretmeyi reddetti. Farklı bir kaynak dene.",
  truncated: "Gemini yanıtı yarıda kesildi. Daha kısa bir kaynakla yeniden dene.",
  invalid: "Gemini beklenen biçimde yanıt vermedi. Yeniden dene.",
  missing: "Yapılandırılan Gemini modeli bulunamadı.",
  limit: "Gemini için uygulamanın günlük kullanım limiti doldu.",
  error: "Gemini isteği başarısız oldu. Yeniden dene.",
};

// Yapılandırılmış (JSON) yanıt üretir. Geçici hatalarda ve kota dolduğunda
// zincirdeki bir sonraki ücretsiz modeli dener; toplam süre bütçesini aşmaz.
export async function generateJson({
  system,
  prompt,
  schema,
  temperature = 0.6,
  maxOutputTokens = 32_768,
  budgetMs = 52_000,
  fetchImpl = fetch,
  env = process.env,
  images = [], // [{ mimeType, data(base64) }] — istemin ardından sırayla eklenir
  // İsteğe bağlı kancalar (merkezi yönlendirici kullanır): her model denemesinden
  // önce limit/rezervasyon (false dönerse deneme yapılmaz) ve sonra gerçek kullanım.
  beforeAttempt = null,
  afterAttempt = null,
  maxModels = Infinity,
}) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AiError("GEMINI_API_KEY tanımlı değil. Anahtarı sunucu ortam değişkenlerine ekle.", "config");
  }

  const payload = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }, ...images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.data } }))],
      },
    ],
    generationConfig: {
      temperature,
      maxOutputTokens,
      responseMimeType: "application/json",
      responseSchema: schema,
      // Düşünme payı kısa tutulur: yanıt süresi sunucu işlevi sınırının altında kalır.
      thinkingConfig: { thinkingLevel: "low" },
    },
  };

  const deadline = Date.now() + budgetMs;
  let last = "error";

  for (const model of modelChain(env).slice(0, maxModels)) {
    const remaining = deadline - Date.now();
    if (remaining < 4_000) {
      if (last === "error") last = "timeout";
      break;
    }
    if (beforeAttempt && (await beforeAttempt(model)) === false) {
      last = last === "error" ? "limit" : last;
      break;
    }
    const startedAt = Date.now();
    const result = await callModel(model, payload, apiKey, remaining, fetchImpl);
    afterAttempt?.(model, result, Date.now() - startedAt);
    if (result.kind === "ok") return { data: result.data, model, usage: result.usage };

    last = result.kind;
    console.error(`[ai] ${model} başarısız: ${result.kind}${result.detail ? ` — ${result.detail}` : ""}`);
    // Anahtar hatası ve içerik reddi başka modelde de değişmez.
    if (result.kind === "config") {
      throw new AiError("Gemini API anahtarı geçersiz ya da yetkisiz. GEMINI_API_KEY değerini kontrol et.", "config");
    }
    if (result.kind === "blocked") break;
  }

  throw new AiError(FAILURE_MESSAGES[last] ?? FAILURE_MESSAGES.error, last === "missing" ? "config" : last);
}
