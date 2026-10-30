// Ücretsiz görsel yönlendiricisi. Gerçek API çağrısı yapılmaz; tüm yanıtlar sahtedir.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import sharp from "sharp";
import { clearImageCache, finishImage, generateImage, listImageProviders } from "../lib/ai/imageRouter.js";
import { comfyWorkflow } from "../lib/ai/imageProviders.js";
import { cooldownFor, resetHealth } from "../lib/ai/providerHealth.js";
import { createTestStore } from "../lib/ai/usageStore.js";

// Renk geçişli gerçek bir PNG (geçerli çıktı) ve tek renkli PNG (boş çıktı).
const gradient = await sharp(Buffer.from(Array.from({ length: 128 * 128 * 3 }, (_, i) => (i * 7) % 256)), { raw: { width: 128, height: 128, channels: 3 } }).png().toBuffer();
const blank = await sharp({ create: { width: 256, height: 256, channels: 3, background: "#ffffff" } }).png().toBuffer();
const reference = { buffer: await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#2266aa" } }).composite([{ input: gradient, top: 10, left: 10 }]).png().toBuffer(), mime: "image/png" };

const CF = { CLOUDFLARE_ACCOUNT_ID: "acc", CLOUDFLARE_API_TOKEN: "tok" };
const COMFY = { COMFYUI_URL: "http://127.0.0.1:8188", COMFYUI_CHECKPOINT: "sdxl_base.safetensors" };
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const cfOk = (buffer = gradient) => json(200, { success: true, result: { image: buffer.toString("base64") } });
const pollOk = (model = "sana") => new Response(gradient, { status: 200, headers: { "content-type": "image/png", "x-model-used": model } });

function makeFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url);
    assert.ok(!parsed.host.includes("googleapis"), "Gemini görsel modeli (ücretli) asla çağrılmaz");
    const provider = parsed.host.includes("cloudflare") ? "cloudflare" : parsed.host.includes("pollinations") ? "pollinations" : parsed.port === "8188" ? "comfyui" : "other";
    calls.push({ provider, url, init, path: parsed.pathname });
    return handler({ provider, url, parsed, init });
  };
  return { fetchImpl, calls };
}
// Cloudflare (hesaba göre ücret riski) testte açıkça "ücretsiz planda" onaylanır.
const ATTESTED = { "image:cloudflare": { billingVerified: true } };
// Adaptör testleri (mock): üretimde otomatik görsel sırası BOŞTUR; burada
// adaptörlerin davranışı eski sırayla açıkça denenir.
const ADAPTER_ORDER = ["comfyui", "cloudflare", "pollinations"];
const run = (options) => generateImage({ prompt: "minimal flat illustration of a marketing dashboard", log: () => {}, sleep: async () => {}, store: createTestStore({ overrides: ATTESTED }), order: ADAPTER_ORDER, ...options });

beforeEach(() => {
  resetHealth();
  clearImageCache();
});

test("Cloudflare FLUX.1 schnell metinden üretir; etiket gerçek modeli gösterir, çıktı 16:9", async () => {
  const { fetchImpl, calls } = makeFetch(({ provider }) => (provider === "cloudflare" ? cfOk() : assert.fail("yalnızca Cloudflare")));
  const result = await run({ env: CF, fetchImpl });
  assert.equal(result.provider, "cloudflare");
  assert.equal(result.model, "@cf/black-forest-labs/flux-1-schnell");
  assert.equal(result.modelLabel, "FLUX.1 [schnell]");
  assert.equal(result.mode, "text");
  assert.equal(result.output.info.format, "webp");
  assert.equal(result.output.info.width / result.output.info.height > 1.7, true);
  assert.match(calls[0].url, /flux-1-schnell$/);
  assert.equal(JSON.parse(calls[0].init.body).steps, 4);
});

test("Referans görsel yalnızca image-to-image destekleyen FLUX.2 klein'e gider; referans 512px altına küçültülür", async () => {
  const { fetchImpl, calls } = makeFetch(() => cfOk());
  const result = await run({ env: CF, fetchImpl, reference });
  assert.equal(result.model, "@cf/black-forest-labs/flux-2-klein-4b");
  assert.equal(result.mode, "reference");
  const form = calls[0].init.body;
  assert.ok(form instanceof FormData);
  const sent = await sharp(Buffer.from(await form.get("input_image_0").arrayBuffer())).metadata();
  assert.ok(sent.width < 512 && sent.height < 512, `${sent.width}x${sent.height}`);
  assert.equal(form.get("width"), "1344");
});

test("Referans görsel desteklemeyen ortamda metin modeline sessizce düşülmez", async () => {
  const { fetchImpl, calls } = makeFetch(() => pollOk());
  await assert.rejects(run({ env: {}, fetchImpl, reference }), /referans görselden üretim yapabilen ücretsiz bir sağlayıcı yapılandırılmamış/);
  assert.equal(calls.length, 0);
});

test("Cloudflare günlük Neuron kotası dolunca Pollinations'a geçer; Pollinations'ın gerçek modeli gösterilir", async () => {
  const now = Date.UTC(2026, 9, 23, 22, 0, 0);
  const { fetchImpl } = makeFetch(({ provider }) =>
    provider === "cloudflare" ? json(429, { success: false, errors: [{ message: "You have used up your daily free allocation of 10,000 neurons" }] }) : pollOk("sana")
  );
  const result = await run({ env: CF, fetchImpl, now: () => now });
  assert.equal(result.provider, "pollinations");
  assert.equal(result.model, "sana");
  assert.match(result.modelLabel, /sana.*filigranlı/);
  assert.equal(result.attempts.find((attempt) => attempt.provider === "cloudflare").kind, "quota");
  assert.equal(cooldownFor("image:cloudflare", now).until, Date.UTC(2026, 9, 24, 0, 0, 0));
});

test("Boş (tek renk) ve bozuk çıktı başarılı sayılmaz; sıradaki sağlayıcı denenir", async () => {
  for (const bad of [blank, Buffer.from("bu bir görsel değil ama yeterince uzun bir metin ".repeat(20))]) {
    clearImageCache();
    resetHealth();
    const { fetchImpl } = makeFetch(({ provider }) => (provider === "cloudflare" ? cfOk(bad) : pollOk()));
    const result = await run({ env: CF, fetchImpl });
    assert.equal(result.provider, "pollinations");
    assert.equal(result.attempts.find((attempt) => attempt.provider === "cloudflare").kind, "invalid");
  }
  assert.ok((await finishImage(blank, "16:9")).error);
  assert.ok((await finishImage(Buffer.alloc(0), "16:9")).error);
});

test("402 (ücretli) yanıt veren sağlayıcı devre dışı kalır; ücretli servise geçilmez", async () => {
  const { fetchImpl, calls } = makeFetch(() => new Response("Payment Required", { status: 402 }));
  await assert.rejects(run({ env: {}, fetchImpl }), (error) => {
    assert.match(error.message, /Ücretli bir servise geçilmedi/);
    assert.match(error.message, /ücretli kullanım gerektirdi/);
    return true;
  });
  await assert.rejects(run({ env: {}, fetchImpl, prompt: "başka bir istem" }));
  assert.equal(calls.length, 1, "ikinci istekte Pollinations çağrılmadı");
});

test("Zaman aşımında sıradaki sağlayıcıya geçilir", async () => {
  const { fetchImpl } = makeFetch(({ provider, init }) =>
    provider === "cloudflare"
      ? new Promise((resolve, reject) => {
          const pending = setTimeout(() => {}, 60_000);
          init.signal.addEventListener("abort", () => {
            clearTimeout(pending);
            reject(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
          });
        })
      : pollOk()
  );
  const result = await run({ env: CF, fetchImpl, budgetMs: 15_000 });
  assert.equal(result.provider, "pollinations");
  assert.equal(result.attempts.find((attempt) => attempt.provider === "cloudflare").kind, "timeout");
});

test("ComfyUI: iş akışı gönderilir, sonuç izlenir ve alınır; etiket checkpoint + iş akışını gösterir", async () => {
  let polls = 0;
  const { fetchImpl, calls } = makeFetch(({ provider, parsed }) => {
    assert.equal(provider, "comfyui");
    if (parsed.pathname === "/prompt") return json(200, { prompt_id: "p1" });
    if (parsed.pathname === "/history/p1") return json(200, ++polls < 2 ? {} : { p1: { status: { status_str: "success" }, outputs: { 9: { images: [{ filename: "persona_blog_0001.png", subfolder: "", type: "output" }] } } } });
    if (parsed.pathname === "/view") return new Response(gradient, { status: 200, headers: { "content-type": "image/png" } });
    return assert.fail(parsed.pathname);
  });
  const result = await run({ env: COMFY, fetchImpl });
  assert.equal(result.provider, "comfyui");
  assert.equal(result.modelLabel, "sdxl_base.safetensors · txt2img iş akışı");
  const workflow = JSON.parse(calls[0].init.body).prompt;
  assert.equal(workflow[4].inputs.ckpt_name, "sdxl_base.safetensors");
  assert.equal(workflow[5].class_type, "EmptyLatentImage");
  assert.ok(calls.some((call) => call.path === "/view"));
});

test("ComfyUI referans görselle img2img: görsel yüklenir, LoadImage + VAEEncode kullanılır", async () => {
  const { fetchImpl, calls } = makeFetch(({ parsed }) => {
    if (parsed.pathname === "/upload/image") return json(200, { name: "persona_ref_7.png", subfolder: "", type: "input" });
    if (parsed.pathname === "/prompt") return json(200, { prompt_id: "p2" });
    if (parsed.pathname === "/history/p2") return json(200, { p2: { outputs: { 9: { images: [{ filename: "x.png" }] } } } });
    return new Response(gradient, { status: 200 });
  });
  const result = await run({ env: COMFY, fetchImpl, reference, seed: 7, strength: 0.5 });
  assert.equal(result.mode, "reference");
  const workflow = JSON.parse(calls.find((call) => call.path === "/prompt").init.body).prompt;
  assert.equal(workflow[10].inputs.image, "persona_ref_7.png");
  assert.equal(workflow[5].class_type, "VAEEncode");
  assert.equal(workflow[3].inputs.denoise, 0.5);
});

test("ComfyUI erişilemezse güvenli biçimde sıradaki ücretsiz sağlayıcıya geçilir", async () => {
  const { fetchImpl } = makeFetch(({ provider }) => {
    if (provider === "comfyui") throw new TypeError("fetch failed: ECONNREFUSED");
    return cfOk();
  });
  const result = await run({ env: { ...COMFY, ...CF }, fetchImpl });
  assert.equal(result.provider, "cloudflare");
  assert.equal(result.attempts[0].provider, "comfyui");
  assert.equal(result.attempts[0].kind, "server");
});

test("Canlı ortamda korumasız ComfyUI kullanılmaz", () => {
  const onVercel = listImageProviders({ ...COMFY, VERCEL: "1" }, ADAPTER_ORDER).find((provider) => provider.id === "comfyui");
  assert.equal(onVercel.available, false);
  assert.match(onVercel.reason, /https ve COMFYUI_TOKEN/);
  const secured = listImageProviders({ COMFYUI_URL: "https://comfy.example.com", COMFYUI_CHECKPOINT: "a.safetensors", COMFYUI_TOKEN: "x", VERCEL: "1" }, ADAPTER_ORDER).find((provider) => provider.id === "comfyui");
  assert.equal(secured.available, true);
});

test("Aynı istek önbellekten döner; belirli sağlayıcıdan alternatif istenebilir", async () => {
  const { fetchImpl, calls } = makeFetch(({ provider }) => (provider === "cloudflare" ? cfOk() : pollOk()));
  const first = await run({ env: CF, fetchImpl, seed: 3 });
  const second = await run({ env: CF, fetchImpl, seed: 3 });
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(calls.length, 1);
  const alternative = await run({ env: CF, fetchImpl, seed: 3, provider: "pollinations" });
  assert.equal(alternative.provider, "pollinations");
  assert.equal(calls.at(-1).provider, "pollinations");
});

test("İş akışı yardımcı: oran boyutları ve img2img gücü", () => {
  const workflow = comfyWorkflow({ prompt: "a", negative: "", aspect: "9:16", seed: 1, checkpoint: "c" });
  assert.deepEqual([workflow[5].inputs.width, workflow[5].inputs.height], [768, 1344]);
  assert.equal(workflow[3].inputs.denoise, 1);
});

test("Ücret riski doğrulanmamış Cloudflare görsel üretimine girmez; Pollinations kullanılır", async () => {
  const { fetchImpl, calls } = makeFetch(({ provider }) => (provider === "cloudflare" ? assert.fail("onaysız Cloudflare çağrıldı") : pollOk()));
  const result = await run({ env: CF, fetchImpl, store: createTestStore() });
  assert.equal(result.provider, "pollinations");
  assert.equal(calls.filter((call) => call.provider === "cloudflare").length, 0);
  assert.match(result.attempts.find((attempt) => attempt.provider === "cloudflare").skipped, /Ücret riski doğrulanmadı/);
});

test("Üretimde otomatik görsel servisi yok: hiçbir ağ isteği yapılmaz, açık 'ChatGPT' hatası döner", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error("çağrılmamalıydı");
  };
  await assert.rejects(
    generateImage({ prompt: "a", env: { CLOUDFLARE_ACCOUNT_ID: "x", CLOUDFLARE_API_TOKEN: "y" }, fetchImpl, log: () => {}, store: createTestStore({ overrides: ATTESTED }) }),
    (error) => error.kind === "config" && /ChatGPT/.test(error.message)
  );
  await assert.rejects(
    generateImage({ prompt: "a", provider: "pollinations", env: {}, fetchImpl, log: () => {}, store: createTestStore({ overrides: ATTESTED }) }),
    (error) => error.kind === "config"
  );
  assert.equal(calls, 0);
  assert.deepEqual(listImageProviders({}), []);
});
