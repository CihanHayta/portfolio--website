import sharp from "sharp";
import { errorResponse, json, readAdminRequest } from "@/lib/ai/http";
import { isOperationId, runOnce } from "@/lib/ai/idempotency";
import { IMAGE_PROVIDERS } from "@/lib/ai/freePolicy";
import { generateImage } from "@/lib/ai/imageRouter";
import { fetchImage } from "@/lib/ai/safeFetch";
import { getUsageStore } from "@/lib/ai/usageStore";
import { VISUAL_ASPECTS, buildReferencePrompt } from "@/lib/ai/visualPlan";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const clip = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

async function loadReference(reference) {
  if (!reference) return null;
  if (reference.kind === "source") {
    // Başka sitenin görseli: kullanım hakkı kullanıcı tarafından onaylanmadan işlenmez.
    if (reference.licenseConfirmed !== true) throw Object.assign(new Error("Kaynak görseli referans olarak kullanmak için kullanım hakkını onaylaman gerekiyor."), { status: 400 });
    const image = await fetchImage(clip(reference.src, 2000)); // SSRF korumalı
    return { buffer: image.body, mime: image.contentType ?? "image/jpeg" };
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
  if (!basePrompt) return json({ error: "Görsel istemi boş." }, 400);
  const provider = body.provider && Object.hasOwn(IMAGE_PROVIDERS, body.provider) ? body.provider : null;
  const seed = Number.isInteger(body.seed) ? Math.abs(body.seed) % 2_147_483_647 : Math.floor(Math.random() * 1_000_000);
  const store = getUsageStore({ db: admin.supabase });

  try {
    const { value, reused } = await runOnce(body.opId, async () => {
      await store.beginJob(body.opId, "image", { stage: "image" }).catch(() => null);
      const reference = body.mode === "reference" ? await loadReference(body.reference) : null;
      const built = reference ? buildReferencePrompt(basePrompt, Array.isArray(body.options) ? body.options : [], body.format) : { prompt: basePrompt, aspect: VISUAL_ASPECTS.includes(item.aspect) ? item.aspect : "16:9" };
      const result = await generateImage({
        prompt: built.prompt,
        negative: clip(item.negative, 300),
        aspect: built.aspect,
        seed,
        reference,
        strength: 0.6,
        provider,
        task: reference ? "image-reference" : "image",
        opId: body.opId,
        db: admin.supabase,
      });
      await store.updateJob(body.opId, { status: "completed", result: { provider: result.provider, model: result.model } }).catch(() => {});
      return {
        candidate: {
          id: body.opId,
          image: `data:image/webp;base64,${result.output.data.toString("base64")}`,
          width: result.output.info.width,
          height: result.output.info.height,
          provider: result.provider,
          providerLabel: result.providerLabel,
          model: result.model,
          modelLabel: result.modelLabel,
          mode: result.mode,
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
