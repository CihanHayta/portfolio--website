import { getAdmin } from "@/lib/blog/admin";
import { isSameOrigin } from "@/lib/blog/media";
import { sanitizeSession } from "@/lib/blog/studioSession";

export const runtime = "nodejs";

const json = (body, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Taslağa bağlı stüdyo oturumunu döndürür (yoksa data: null).
export async function GET(request) {
  const admin = await getAdmin();
  if (!admin) return json({ error: "Oturumun sona ermiş. Yeniden giriş yap." }, 401);
  const postId = new URL(request.url).searchParams.get("postId") ?? "";
  if (!UUID.test(postId)) return json({ error: "Geçersiz taslak." }, 400);
  const { data, error } = await admin.supabase.from("blog_studio_sessions").select("data, updated_at").eq("post_id", postId).maybeSingle();
  if (error) return json({ error: "Taslak oturumu okunamadı." }, 502);
  return json({ data: data?.data ?? null, updatedAt: data?.updated_at ?? null });
}

// Oturumu kaydeder. Yalnızca temizlenmiş alanlar yazılır; yazının kendisi
// (blog_posts) bu uçla değişmez.
export async function PUT(request) {
  if (!isSameOrigin(request)) return json({ error: "Geçersiz kaynak." }, 403);
  const admin = await getAdmin();
  if (!admin) return json({ error: "Oturumun sona ermiş. Yeniden giriş yap." }, 401);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Geçersiz istek." }, 400);
  }
  if (!UUID.test(String(body?.postId ?? ""))) return json({ error: "Geçersiz taslak." }, 400);
  const data = sanitizeSession(body.data);
  const { data: saved, error } = await admin.supabase
    .from("blog_studio_sessions")
    .upsert({ post_id: body.postId, data, updated_at: new Date().toISOString() }, { onConflict: "post_id" })
    .select("updated_at")
    .single();
  if (error) {
    if (error.code === "23503") return json({ error: "Taslak bulunamadı." }, 404);
    console.error("[studio] oturum kaydedilemedi:", error.code);
    return json({ error: "Taslak oturumu kaydedilemedi." }, 502);
  }
  return json({ ok: true, updatedAt: saved.updated_at });
}
