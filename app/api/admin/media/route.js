import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { getAdmin } from "@/lib/blog/admin";
import { MEDIA_BUCKET } from "@/lib/supabase/env";

export const runtime = "nodejs";

// Vercel işlev gövdesi sınırı (4,5 MB) altında kalır.
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_WIDTH = 2400;
const ACCEPTED_FORMATS = ["jpeg", "png", "webp"];

const json = (body, status) => Response.json(body, { status });

export async function POST(request) {
  // Tarayıcıdan gelen çapraz kaynak gönderimleri reddedilir (CSRF).
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).host !== request.headers.get("host")) {
    return json({ error: "Geçersiz kaynak." }, 403);
  }

  const admin = await getAdmin();
  if (!admin) return json({ error: "Oturumun sona ermiş. Yeniden giriş yap." }, 401);

  let file;
  let altText = "";
  try {
    const form = await request.formData();
    file = form.get("file");
    altText = String(form.get("alt") ?? "").trim().slice(0, 300);
  } catch {
    return json({ error: "Yükleme okunamadı." }, 400);
  }

  if (!(file instanceof File) || file.size === 0) return json({ error: "Dosya seçilmedi." }, 400);
  if (file.size > MAX_BYTES) return json({ error: "Dosya 4 MB sınırını aşıyor." }, 413);

  // Dosya adı ve tarayıcının bildirdiği tür dikkate alınmaz; içerik gerçekten
  // çözülür ve her zaman WebP olarak yeniden kodlanır (EXIF/konum verisi de atılır).
  let output;
  try {
    const source = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 50_000_000 });
    const { format } = await source.metadata();
    if (!ACCEPTED_FORMATS.includes(format)) {
      return json({ error: "Yalnızca JPG, PNG ve WebP görselleri yüklenebilir." }, 415);
    }
    output = await source
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    return json({ error: "Dosya geçerli bir görsel değil." }, 415);
  }

  const now = new Date();
  const storagePath = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.webp`;
  const bucket = admin.supabase.storage.from(MEDIA_BUCKET);

  const { error: uploadError } = await bucket.upload(storagePath, output.data, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploadError) {
    console.error("[blog] görsel yüklenemedi:", uploadError);
    return json({ error: "Görsel depolamaya yüklenemedi. Yeniden dene." }, 502);
  }

  const { data: media, error: insertError } = await admin.supabase
    .from("blog_media")
    .insert({
      storage_path: storagePath,
      url: bucket.getPublicUrl(storagePath).data.publicUrl,
      mime_type: "image/webp",
      size_bytes: output.info.size,
      width: output.info.width,
      height: output.info.height,
      alt_text: altText,
      created_by: admin.user.id,
    })
    .select("id, url, width, height, alt_text, caption, size_bytes, created_at")
    .single();

  if (insertError) {
    // Kayıt oluşmadıysa depoda sahipsiz dosya bırakılmaz.
    await bucket.remove([storagePath]);
    console.error("[blog] medya kaydı oluşturulamadı:", insertError);
    return json({ error: "Görsel kaydedilemedi. Yeniden dene." }, 500);
  }

  return json({ media }, 201);
}
