import { errorResponse, json, readAdminRequest } from "@/lib/ai/http";
import { isOperationId, runOnce } from "@/lib/ai/idempotency";
import { readSource } from "@/lib/ai/sourceReaders";
import { generateJsonRouted } from "@/lib/ai/textRouter";
import { getUsageStore } from "@/lib/ai/usageStore";
import { VISUAL_PLAN_SCHEMA, VISUAL_PLAN_SYSTEM, buildVisualPlanPrompt, normalizeVisualPlan, visualBudget } from "@/lib/ai/visualPlan";
import { sourceSnapshot } from "@/lib/blog/sourceContext";
import { getAdmin } from "@/lib/blog/admin";

export const runtime = "nodejs";
// Gemini yoğunken yedek servise (OVH) yetecek süre kalsın: toplam bütçe 80 sn.
export const maxDuration = 90;

const clip = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function cleanSections(input) {
  return (Array.isArray(input) ? input : []).slice(0, 30).flatMap((section) => {
    const id = clip(section?.id, 64);
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) return [];
    return [{ id, level: section.level === 3 ? 3 : 2, heading: clip(section.heading, 160), text: clip(section.text, 600), words: Math.max(0, Math.min(20_000, Number(section.words) || 0)) }];
  });
}

// Görsel planı: taslağın bölümleri + kaynak bağlamı (tarayıcıda saklı; yoksa URL
// SSRF korumalı okuyucuyla yeniden okunur). Aynı işlem kimliği tek üretim yapar.
export async function POST(request) {
  const { admin, body, response } = await readAdminRequest(request);
  if (!admin) return response;
  if (!isOperationId(body.opId)) return json({ error: "İşlem kimliği eksik." }, 400);

  const sections = cleanSections(body.sections);
  const title = clip(body.title, 200);
  if (!title && sections.length === 0) return json({ error: "Görsel planı için önce yazıya başlık ya da bölüm ekle." }, 400);

  const store = getUsageStore({ db: admin.supabase });
  const started = await store.beginJob(body.opId, "visual-plan", { stage: "plan", postId: /^[0-9a-f-]{36}$/i.test(body.postId ?? "") ? body.postId : null }).catch(() => null);
  if (started && !started.created) {
    if (started.job.status === "completed" && started.job.result) return json({ ...started.job.result, reused: true });
    if (started.job.status === "running" || started.job.status === "retrying") return json({ status: "running", error: "Bu görsel planı zaten hazırlanıyor." }, 409);
  }

  try {
    const { value } = await runOnce(body.opId, async () => {
      let source = body.source?.url ? sourceSnapshot(body.source) : null;
      let readNow = false;
      const url = clip(body.url, 2000);
      if (!source && url) {
        const read = await readSource(url);
        if (!read.source) return { error: "Kaynak okunamadı; metin ya da ekran görüntüsüyle devam edebilirsin.", status: 422 };
        source = sourceSnapshot({ ...read.source, url: read.source.url ?? url });
        readNow = true;
      }
      const totalWords = sections.reduce((sum, section) => sum + section.words, 0);
      const budget = visualBudget(totalWords, sections.length);
      const result = await generateJsonRouted({
        task: "visual-plan",
        opId: body.opId,
        db: admin.supabase,
        system: VISUAL_PLAN_SYSTEM,
        prompt: buildVisualPlanPrompt({ title, sections, source, budget }),
        schema: VISUAL_PLAN_SCHEMA,
        temperature: 0.5,
        maxOutputTokens: 8_192,
        budgetMs: 80_000,
        backupReserveMs: 30_000,
      });
      const plan = normalizeVisualPlan(result.data, { sections, sourceImages: source?.images ?? [], budget });
      return {
        plan,
        budget,
        provider: result.provider,
        model: result.model,
        source: readNow ? source : null,
        sourceSummary: source ? { url: source.url, title: source.title, wordCount: source.wordCount, images: source.images.length, truncated: source.truncated, provider: source.provider } : null,
      };
    });
    if (value.error) {
      await store.updateJob(body.opId, { status: "failed", errorKind: "source" }).catch(() => {});
      return json({ error: value.error }, value.status);
    }
    await store.updateJob(body.opId, { status: "completed", stage: "plan", result: { ...value, source: null } }).catch(() => {});
    return json(value);
  } catch (error) {
    await store.updateJob(body.opId, { status: "failed", errorKind: error?.kind ?? "error" }).catch(() => {});
    return errorResponse(error);
  }
}

// Sayfa yenilendiğinde aynı işin durumu (yeniden üretim başlatmadan).
export async function GET(request) {
  const admin = await getAdmin();
  if (!admin) return json({ error: "Oturumun sona ermiş. Yeniden giriş yap." }, 401);
  const opId = new URL(request.url).searchParams.get("opId");
  if (!isOperationId(opId)) return json({ error: "İşlem kimliği eksik." }, 400);
  const job = await getUsageStore({ db: admin.supabase }).getJob(opId).catch(() => null);
  return Response.json({ job: job ? { status: job.status, stage: job.stage, errorKind: job.errorKind ?? job.error_kind ?? null, result: job.status === "completed" ? job.result ?? null : null } : null }, { headers: { "cache-control": "no-store" } });
}
