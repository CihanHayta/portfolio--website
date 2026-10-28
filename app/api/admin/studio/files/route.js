import { randomUUID } from "node:crypto";
import { getAdmin } from "@/lib/blog/admin";
import { encodeImage, isSameOrigin } from "@/lib/blog/media";
import { isShotPath } from "@/lib/blog/studioSession";

export const runtime = "nodejs";

// Kaynak ekran görüntüleri HERKESE KAPALI kovada tutulur (blog görseli değildir).
// Gösterim yalnızca kısa süreli imzalı adresle yapılır.
const BUCKET = "studio-sources";
const MAX_BYTES = 4 * 1024 * 1024; // Vercel gövde sınırının altında, dosya başına
const SIGNED_SECONDS = 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

async function signed(admin, paths) {
  if (!paths.length) return {};
  const { data } = await admin.supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_SECONDS);
  return Object.fromEntries((data ?? []).filter((item) => item.signedUrl).map((item) => [item.path, item.signedUrl]));
}

// Ekran görüntüsü yükler: WebP'ye çevrilir, <taslak>/<kimlik>.webp yoluna yazılır.
export async function POST(request) {
  if (!isSameOrigin(request)) return json({ error: "Geçersiz kaynak." }, 403);
  const admin = await getAdmin();
  if (!admin) return json({ error: "Oturumun sona ermiş. Yeniden giriş yap." }, 401);
  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Yükleme okunamadı." }, 400);
  }
  const postId = String(form.get("postId") ?? "");
  const file = form.get("file");
  if (!UUID.test(postId)) return json({ error: "Geçersiz taslak." }, 400);
  if (!(file instanceof File) || file.size === 0) return json({ error: "Dosya seçilmedi." }, 400);
  if (file.size > MAX_BYTES) return json({ error: "Ekran görüntüsü 4 MB sınırını aşıyor." }, 413);
  const encoded = await encodeImage(Buffer.from(await file.arrayBuffer()), { quality: 82 });
  if (encoded.error) return json({ error: "Yalnızca JPG, PNG ve WebP ekran görüntüleri yüklenebilir." }, 415);

  const path = `${postId}/${randomUUID()}.webp`;
  const { error } = await admin.supabase.storage.from(BUCKET).upload(path, encoded.output.data, { contentType: "image/webp", upsert: false });
  if (error) {
    console.error("[studio] ekran görüntüsü yüklenemedi:", error.message);
    return json({ error: "Ekran görüntüsü kaydedilemedi. Yeniden dene." }, 502);
  }
  const urls = await signed(admin, [path]);
  return json({ shot: { id: path, path, name: String(file.name ?? "").slice(0, 120), width: encoded.output.info.width, height: encoded.output.info.height, url: urls[path] ?? null } }, 201);
}

// Kayıtlı ekran görüntülerinin imzalı adresleri: ?paths=a,b
export async function GET(request) {
  const admin = await getAdmin();
  if (!admin) return json({ error: "Oturumun sona ermiş. Yeniden giriş yap." }, 401);
  const paths = (new URL(request.url).searchParams.get("paths") ?? "").split(",").filter(isShotPath).slice(0, 8);
  return json({ urls: await signed(admin, paths) });
}

export async function DELETE(request) {
  if (!isSameOrigin(request)) return json({ error: "Geçersiz kaynak." }, 403);
  const admin = await getAdmin();
  if (!admin) return json({ error: "Oturumun sona ermiş. Yeniden giriş yap." }, 401);
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!isShotPath(path)) return json({ error: "Geçersiz dosya." }, 400);
  const { error } = await admin.supabase.storage.from(BUCKET).remove([path]);
  if (error) return json({ error: "Dosya silinemedi." }, 502);
  return json({ ok: true });
}
