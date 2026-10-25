// Ücretsiz görsel üretim sağlayıcıları. Her biri gerçek giriş/çıkış yeteneğine
// göre tanımlıdır: yalnızca metinden görsel üreten bir modele referans görsel
// gönderilmez. Etiketteki model adı yanıttan gelen gerçek değerdir; bilinmiyorsa
// uydurulmaz.
//
// Dönüş: { buffer, model, modelLabel, mode } ya da { kind, retryAfter?, detail? }
// kind: "rate" | "quota" | "paid" | "auth" | "server" | "timeout" | "invalid" | "capability" | "error"

import sharp from "sharp";
import { IMAGE_PROVIDERS } from "./freePolicy.js";

export const ASPECTS = {
  "16:9": [1344, 768],
  "3:2": [1216, 832],
  "4:3": [1152, 896],
  "1:1": [1024, 1024],
  "9:16": [768, 1344],
};
export const sizeFor = (aspect) => ASPECTS[aspect] ?? ASPECTS["16:9"];

const statusKind = (status, message = "") => {
  if (status === 402) return "paid";
  if (status === 429) return /daily|quota|allocation|neuron|exhaust/i.test(message) ? "quota" : "rate";
  if (status === 401 || status === 403) return "auth";
  if (status === 400 || status === 422) return "invalid";
  if (status >= 500) return "server";
  return "error";
};

const timeoutKind = (error) => (error?.name === "TimeoutError" || error?.name === "AbortError" ? "timeout" : "server");

// --- Cloudflare Workers AI ---------------------------------------------------------
export const CF_TEXT_MODEL = "@cf/black-forest-labs/flux-1-schnell";
export const CF_REFERENCE_MODEL = "@cf/black-forest-labs/flux-2-klein-4b";

async function cloudflareImage({ prompt, aspect, seed, reference, model }, { env, fetchImpl, timeoutMs }) {
  const chosen = reference ? CF_REFERENCE_MODEL : model ?? CF_TEXT_MODEL;
  const spec = IMAGE_PROVIDERS.cloudflare.models[chosen];
  if (!spec) return { kind: "capability", detail: "bilinmeyen model" };
  if (reference && !spec.imageToImage) return { kind: "capability", detail: `${spec.label} referans görsel desteklemiyor` };

  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/ai/run/${chosen}`;
  const headers = { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` };
  let body;
  if (chosen === CF_TEXT_MODEL) {
    // Şema yalnızca prompt + steps kabul eder; en-boy oranı sonradan kırpılır.
    headers["content-type"] = "application/json";
    body = JSON.stringify({ prompt: prompt.slice(0, 2048), steps: 4, seed });
  } else {
    const [width, height] = sizeFor(aspect);
    const form = new FormData();
    form.append("prompt", prompt.slice(0, 2048));
    form.append("width", String(width));
    form.append("height", String(height));
    form.append("seed", String(seed));
    if (reference) {
      // Model her referans görselin 512x512'den küçük olmasını ister.
      const small = await sharp(reference.buffer).rotate().resize({ width: 511, height: 511, fit: "inside" }).png().toBuffer();
      form.append("input_image_0", new Blob([small], { type: "image/png" }), "reference.png");
    }
    body = form;
  }

  let response;
  try {
    response = await fetchImpl(url, { method: "POST", headers, body, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    return { kind: timeoutKind(error) };
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    const message = String(payload?.errors?.[0]?.message ?? "");
    return { kind: statusKind(response.ok ? 500 : response.status, message), retryAfter: response.headers.get("retry-after"), detail: `HTTP ${response.status}` };
  }
  const base64 = payload?.result?.image ?? payload?.image;
  if (typeof base64 !== "string" || !base64) return { kind: "invalid", detail: "görsel alanı boş" };
  return { buffer: Buffer.from(base64, "base64"), model: chosen, modelLabel: spec.label, mode: reference ? "reference" : "text" };
}

// --- ComfyUI -----------------------------------------------------------------------
// API biçiminde standart iş akışı: metinden görsel ya da referans görselden
// (img2img). Model, sunucudaki COMFYUI_CHECKPOINT dosyasıdır.
export function comfyWorkflow({ prompt, negative, aspect, seed, checkpoint, referenceName = null, strength = 0.6 }) {
  const [width, height] = sizeFor(aspect);
  const workflow = {
    4: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: checkpoint } },
    6: { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["4", 1] } },
    7: { class_type: "CLIPTextEncode", inputs: { text: negative || "text, watermark, logo, signature, blurry, deformed", clip: ["4", 1] } },
    3: {
      class_type: "KSampler",
      inputs: { seed, steps: 24, cfg: 6, sampler_name: "euler", scheduler: "normal", denoise: referenceName ? strength : 1, model: ["4", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["5", 0] },
    },
    8: { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
    9: { class_type: "SaveImage", inputs: { filename_prefix: "persona_blog", images: ["8", 0] } },
  };
  if (referenceName) {
    workflow[10] = { class_type: "LoadImage", inputs: { image: referenceName } };
    workflow[11] = { class_type: "ImageScale", inputs: { image: ["10", 0], upscale_method: "lanczos", width, height, crop: "center" } };
    workflow[5] = { class_type: "VAEEncode", inputs: { pixels: ["11", 0], vae: ["4", 2] } };
  } else {
    workflow[5] = { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 } };
  }
  return workflow;
}

const comfyHeaders = (env, extra = {}) => ({ ...extra, ...(env.COMFYUI_TOKEN ? { authorization: `Bearer ${env.COMFYUI_TOKEN}` } : {}) });

async function comfyImage({ prompt, negative, aspect, seed, reference, strength }, { env, fetchImpl, timeoutMs, sleep }) {
  const base = String(env.COMFYUI_URL).replace(/\/+$/, "");
  const deadline = Date.now() + timeoutMs;
  const signal = () => AbortSignal.timeout(Math.max(1_000, deadline - Date.now()));
  try {
    let referenceName = null;
    if (reference) {
      const form = new FormData();
      form.append("image", new Blob([reference.buffer], { type: reference.mime ?? "image/png" }), `persona_ref_${seed}.png`);
      form.append("overwrite", "true");
      const uploaded = await fetchImpl(`${base}/upload/image`, { method: "POST", headers: comfyHeaders(env), body: form, signal: signal() });
      if (!uploaded.ok) return { kind: statusKind(uploaded.status), detail: "referans yüklenemedi" };
      const info = await uploaded.json();
      referenceName = info.subfolder ? `${info.subfolder}/${info.name}` : info.name;
    }
    const workflow = comfyWorkflow({ prompt, negative, aspect, seed, checkpoint: env.COMFYUI_CHECKPOINT, referenceName, strength });
    const queued = await fetchImpl(`${base}/prompt`, {
      method: "POST",
      headers: comfyHeaders(env, { "content-type": "application/json" }),
      body: JSON.stringify({ prompt: workflow, client_id: "persona-blog-studio" }),
      signal: signal(),
    });
    if (!queued.ok) return { kind: statusKind(queued.status), detail: "iş akışı kabul edilmedi" };
    const { prompt_id: promptId } = await queued.json();
    if (!promptId) return { kind: "invalid", detail: "prompt_id yok" };

    while (Date.now() < deadline) {
      const history = await fetchImpl(`${base}/history/${encodeURIComponent(promptId)}`, { headers: comfyHeaders(env), signal: signal() });
      if (history.ok) {
        const entry = (await history.json())?.[promptId];
        if (entry?.status?.status_str === "error") return { kind: "invalid", detail: "iş akışı hata verdi" };
        const image = Object.values(entry?.outputs ?? {}).flatMap((output) => output.images ?? [])[0];
        if (image) {
          const query = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder ?? "", type: image.type ?? "output" });
          const view = await fetchImpl(`${base}/view?${query}`, { headers: comfyHeaders(env), signal: signal() });
          if (!view.ok) return { kind: statusKind(view.status), detail: "çıktı alınamadı" };
          const checkpoint = String(env.COMFYUI_CHECKPOINT);
          return {
            buffer: Buffer.from(await view.arrayBuffer()),
            model: checkpoint,
            modelLabel: `${checkpoint} · ${reference ? "img2img" : "txt2img"} iş akışı`,
            mode: reference ? "reference" : "text",
          };
        }
      }
      await sleep(1_000);
    }
    return { kind: "timeout" };
  } catch (error) {
    return { kind: timeoutKind(error) };
  }
}

// --- Pollinations (anahtarsız) -------------------------------------------------------
async function pollinationsImage({ prompt, aspect, seed, reference }, { fetchImpl, timeoutMs }) {
  if (reference) return { kind: "capability", detail: "referans görsel desteklenmiyor" };
  const [width, height] = sizeFor(aspect).map((value) => Math.round(value * 0.75));
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 500))}?width=${width}&height=${height}&seed=${seed % 1_000_000}&model=flux`;
  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
  } catch (error) {
    return { kind: timeoutKind(error) };
  }
  if (!response.ok) return { kind: statusKind(response.status), retryAfter: response.headers.get("retry-after"), detail: `HTTP ${response.status}` };
  // İstenen model değil, sunucunun bildirdiği gerçek model gösterilir.
  const served = response.headers.get("x-model-used");
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    model: served ?? null,
    modelLabel: served ? `${served} (anonim, filigranlı)` : "model bildirilmedi (anonim, filigranlı)",
    mode: "text",
  };
}

export const IMAGE_ADAPTERS = { comfyui: comfyImage, cloudflare: cloudflareImage, pollinations: pollinationsImage };

// Sağlayıcı/model gerçek yeteneği: referans görsel destekleniyor mu?
export function supportsReference(provider) {
  if (provider === "comfyui") return true;
  if (provider === "cloudflare") return IMAGE_PROVIDERS.cloudflare.models[CF_REFERENCE_MODEL].imageToImage === true;
  return false;
}
