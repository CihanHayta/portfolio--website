import { json, readAdminRequest } from "@/lib/ai/http";
import { SERVICES, SHARED_NEURONS } from "@/lib/ai/limits";
import { checkService, servicesStatus } from "@/lib/ai/servicesStatus";
import { getUsageStore } from "@/lib/ai/usageStore";
import { getAdmin } from "@/lib/blog/admin";

export const runtime = "nodejs";

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return json({ error: "Oturumun sona ermiş. Yeniden giriş yap." }, 401);
  return Response.json(await servicesStatus({ db: admin.supabase }), { headers: { "cache-control": "no-store" } });
}

// Limit güncelleme ya da isteğe bağlı sağlık kontrolü. Doğrulama sunucudadır:
// istemciden gelen değerler resmî üst sınıra kırpılır; ücretsiz mod kapatılamaz.
export async function POST(request) {
  const { admin, body, response } = await readAdminRequest(request);
  if (!admin) return response;
  const key = String(body.key ?? "");
  if (key !== SHARED_NEURONS.key && !Object.hasOwn(SERVICES, key)) return json({ error: "Bilinmeyen servis." }, 400);

  if (body.action === "check") {
    return json({ check: await checkService(key, { db: admin.supabase }) });
  }

  const store = getUsageStore({ db: admin.supabase });
  const production = process.env.VERCEL_ENV === "production";
  if (!store.persistent || (production && store.mode !== "supabase")) {
    return json({ error: "Kalıcı limit deposu etkin değil; değişiklik kaydedilemez. Önce migration uygulanmalı (AI_USAGE_STORE=supabase)." }, 409);
  }
  const limits = await store.setOverride(key, body.values ?? {}).catch(() => null);
  if (!limits) return json({ error: "Limit kaydedilemedi. Değerleri kontrol edip yeniden dene." }, 400);
  return json({ ok: true, limit: limits[key] });
}
