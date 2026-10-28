import sharp from "sharp";
import { errorResponse, json, readAdminRequest } from "@/lib/ai/http";
import { isOperationId, runOnce } from "@/lib/ai/idempotency";
import { IMAGE_PROVIDERS } from "@/lib/ai/freePolicy";
import { generateImage } from "@/lib/ai/imageRouter";
import { fetchImage } from "@/lib/ai/safeFetch";
import { getUsageStore } from "@/lib/ai/usageStore";
import { VISUAL_ASPECTS, buildReferencePrompt } from "@/lib/ai/visualPlan";
import { BRAND_NEGATIVE, DESCRIBE_SCHEMA, DESCRIBE_SYSTEM, PURPOSE_ASPECT, buildBrandImagePrompt } from "@/lib/ai/brandVisual";
import { generateJsonRouted } from "@/lib/ai/textRouter";
import { storeMedia } from "@/lib/blog/media";

export const runtime = "nodejs";
// Tarif modu: görsel tarifi (≤25 sn) + görsel üretimi aynı istekte.
export const maxDuration = 90;

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const clip = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

async function loadReference(reference, { describeOnly = false } = {}) {
  if (!reference) return null;
  if (reference.kind === "source") {
    // Başka sitenin görseli doğrudan görsel modeline verilecekse (gerçek görselden-görsele)
    // kullanım hakkı onayı gerekir. Tarif modunda görsel yalnızca tarif edilir, kopyalanmaz
    // ve yayımlanmaz; yeni görsel metinden üretilir.
    if (!describeOnly && reference.licenseConfirmed !== true) throw Object.assign(new Error("Kaynak görseli referans olarak kullanmak için kullanım hakkını onaylaman gerekiyor."), { status: 400 });
    const image = await fetchImage(clip(reference.src, 2000)); // SSRF korumalı
    return { buffer: image.body, mime: image.contentType ?? "image/jpeg", src: image.finalUrl };
  }
  if (reference.kind === "media") {
    // Bu sitenin medya kütüphanesindeki görsel (zaten kullanım hakkı olan içerik).
    const image = await fetchImage(clip(reference.url, 2000));
    return { buffer: image.body, mime: image.contentType ?? "image/webp", src: image.finalUrl };
  }
  if (reference.kind === "upload") {
    const data = String(reference.data ?? "").replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(data, "base64");
    if (!buffer.length || buffer.length > MAX_UPLOAD_BYTES) throw Object.assign(new Error("Yüklenen görsel boş ya da 6 MB'tan büyük."), { status: 413 });
    const meta = await sharp(buffer).metadata().catch(() => null);
    if (!meta || !["jpeg", "png", "webp"].includes(meta.format)) throw Object.assign(new Error("Yalnızca JPG, PNG ve WebP görseller referans olabilir."), { status: 415 });
    return { buffer, mime: `image/${meta.format}` };
  }
  return null;
}

// Tek görsel adayı üretir. Aynı işlem kimliğiyle gelen ikinci istek (çift
// dokunma, bağlantı kopması) yeni üretim başlatmaz; ilk sonucu alır.
export async function POST(request) {
  const { admin, body, response } = await readAdminRequest(request);
  if (!admin) return response;
  if (!isOperationId(body.opId)) return json({ error: "İşlem kimliği eksik." }, 400);

  const item = body.item ?? {};
  const basePrompt = clip(item.prompt, 900);
  // text: yalnızca istemden · reference: gerçek görselden-görsele (Cloudflare FLUX.2 klein / ComfyUI)
  // describe: referans Gemini ile tarif edilir, tarif + marka kurallarıyla METİNDEN üretilir.
  const mode = ["reference", "describe"].includes(body.mode) ? body.mode : "text";
  if (!basePrompt && mode !== "describe") return json({ error: "Görsel istemi boş." }, 400);
  const provider = body.provider && Object.hasOwn(IMAGE_PROVIDERS, body.provider) ? body.provider : null;
  const seed = Number.isInteger(body.seed) ? Math.abs(body.seed) % 2_147_483_647 : Math.floor(Math.random() * 1_000_000);
  const store = getUsageStore({ db: admin.supabase });

  try {
    const { value, reused } = await runOnce(body.opId, async () => {
      await store.beginJob(body.opId, "image", { stage: "image" }).catch(() => null);
      const reference = mode === "text" ? null : await loadReference(body.reference, { describeOnly: mode === "describe" });
      if (mode !== "text" && !reference) throw Object.assign(new Error("Referans görsel eksik."), { status: 400 });
      let built;
      let description = null;
      if (mode === "describe") {
        const small = await sharp(reference.buffer).rotate().resize({ width: 1024, height: 1024, fit: "inside" }).webp({ quality: 80 }).toBuffer();
        const described = await generateJsonRouted({
          task: "image-describe",
          db: admin.supabase,
          system: DESCRIBE_SYSTEM,
          prompt: "Bu referans görseli tarif et.",
          schema: DESCRIBE_SCHEMA,
          images: [{ mimeType: "image/webp", data: small.toString("base64") }],
          temperature: 0.3,
          maxOutputTokens: 1024,
          budgetMs: 25_000,
        });
        description = described.data;
        const purpose = Object.hasOwn(PURPOSE_ASPECT, item.purpose) ? item.purpose : "inline";
        built = { prompt: buildBrandImagePrompt({ description, topic: item.topic, section: item.section, purpose }), aspect: PURPOSE_ASPECT[purpose] };
      } else if (mode === "reference") {
        built = buildReferencePrompt(basePrompt, Array.isArray(body.options) ? body.options : [], body.format);
      } else {
        built = { prompt: basePrompt, aspect: VISUAL_ASPECTS.includes(item.aspect) ? item.aspect : "16:9" };
      }
      const result = await generateImage({
        prompt: built.prompt,
        negative: mode === "describe" ? BRAND_NEGATIVE : clip(item.negative, 300),
        aspect: built.aspect,
        seed,
        reference: mode === "reference" ? reference : null,
        strength: 0.6,
        provider,
        task: mode === "reference" ? "image-reference" : "image",
        opId: body.opId,
        db: admin.supabase,
      });
      const finalMode = mode === "describe" ? "described" : result.mode;
      // İstenirse sonuç hemen kalıcı depoya yazılır (sayfa yenilense de kaybolmaz).
      let media = null;
      if (body.persist === true) {
        const stored = await storeMedia(admin, result.output, clip(item.alt, 300), {
          caption: `AI: ${result.providerLabel ?? result.provider}${result.modelLabel ? ` · ${result.modelLabel}` : ""}${finalMode === "described" ? " · referans tarif edilerek" : ""}`,
          provenance: { origin: "ai", provider: result.provider, model: result.model, sourceUrl: reference?.src, draftPostId: body.postId },
        });
        if (stored.error) throw Object.assign(new Error(stored.error), { status: stored.status });
        media = stored.media;
      }
      await store.updateJob(body.opId, { status: "completed", result: { provider: result.provider, model: result.model } }).catch(() => {});
      return {
        candidate: {
          id: body.opId,
          image: media ? null : `data:image/webp;base64,${result.output.data.toString("base64")}`,
          media,
          description,
          width: result.output.info.width,
          height: result.output.info.height,
          provider: result.provider,
          providerLabel: result.providerLabel,
          model: result.model,
          modelLabel: result.modelLabel,
          mode: finalMode,
          aspect: built.aspect,
          seed,
          cached: result.cached,
        },
        attempts: result.attempts.map(({ provider: id, kind, skipped, ok }) => ({ provider: id, kind, ok, ...(skipped ? { skipped } : {}) })),
      };
    });
    return json({ ...value, reused });
  } catch (error) {
    await store.updateJob(body.opId, { status: "failed", errorKind: error?.kind ?? "error" }).catch(() => {});
    if (error?.status) return json({ error: error.message }, error.status);
    return errorResponse(error);
  }
}
