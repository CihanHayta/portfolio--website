import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { MEDIA_BUCKET } from "@/lib/supabase/env";

// Görsel yükleme ve yapay zekâ ile blog oluşturma akışının ortak depolama adımı.

const MAX_WIDTH = 2400;
const ACCEPTED_FORMATS = ["jpeg", "png", "webp", "svg"];

export const MEDIA_FIELDS = "id, url, width, height, alt_text, caption, size_bytes, created_at";

// Tarayıcıdan gelen çapraz kaynak gönderimleri reddedilir (CSRF).
export function isSameOrigin(request) {
  const origin = request.headers.get("origin");
  try {
    return Boolean(origin) && new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

// Dosya adı ve bildirilen tür dikkate alınmaz; içerik gerçekten çözülür ve her
// zaman WebP olarak yeniden kodlanır (EXIF/konum verisi de atılır).
// `formats`: kabul edilen kaynak biçimleri. SVG yalnızca sunucunun kendi
// çizdiği grafikler için açılır; kullanıcı yüklemelerinde kapalıdır.
export async function encodeImage(input, { formats = ["jpeg", "png", "webp"], quality = 82 } = {}) {
  try {
    const source = sharp(input, { limitInputPixels: 50_000_000 });
    const { format } = await source.metadata();
    if (!ACCEPTED_FORMATS.includes(format) || !formats.includes(format)) return { error: "format" };
    const output = await source
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
    return { output };
  } catch {
    return { error: "invalid" };
  }
}

// Kodlanmış WebP'yi depoya yükler ve medya kütüphanesine kaydeder.
// `caption`: isteğe bağlı açıklama (ör. kaynaktan aktarılan görselin kaynağı).
// Köken bilgisi (20261027 migration'ı): görselin nereden geldiği, kaynak adresi, gerçek
// sağlayıcı/model ve hangi taslak için alındığı. Yalnızca verilen alanlar yazılır.
const ORIGINS = new Set(["upload", "source", "ai", "handoff", "screenshot"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function mediaProvenance({ origin, sourceUrl, provider, model, draftPostId } = {}) {
  const out = {};
  if (ORIGINS.has(origin)) out.origin = origin;
  if (sourceUrl && /^https?:\/\//i.test(String(sourceUrl))) out.source_url = String(sourceUrl).slice(0, 2000);
  if (provider) out.provider = String(provider).slice(0, 60);
  if (model) out.model = String(model).slice(0, 160);
  if (draftPostId && UUID.test(String(draftPostId))) out.draft_post_id = String(draftPostId);
  return out;
}

// İzinli özel klasörler: "maskot" — kullanıcının kendi tilki maskotu referansları
// (kapak istemlerinde kullanılır; herkese açık kovada, yedeğe dâhil).
export const MEDIA_FOLDERS = ["maskot"];

export async function storeMedia(admin, output, altText = "", { caption = "", provenance = null, folder = "" } = {}) {
  const now = new Date();
  const storagePath = MEDIA_FOLDERS.includes(folder)
    ? `${folder}/${randomUUID()}.webp`
    : `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.webp`;
  const bucket = admin.supabase.storage.from(MEDIA_BUCKET);

  const { error: uploadError } = await bucket.upload(storagePath, output.data, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploadError) {
    console.error("[blog] görsel yüklenemedi:", uploadError);
    return { error: "Görsel depolamaya yüklenemedi. Yeniden dene.", status: 502 };
  }

  const row = {
    storage_path: storagePath,
    url: bucket.getPublicUrl(storagePath).data.publicUrl,
    mime_type: "image/webp",
    size_bytes: output.info.size,
    width: output.info.width,
    height: output.info.height,
    alt_text: String(altText ?? "").trim().slice(0, 300),
    ...(caption ? { caption: String(caption).trim().slice(0, 300) } : {}),
    created_by: admin.user.id,
  };
  const extra = provenance ? mediaProvenance(provenance) : {};
  let { data: media, error: insertError } = await admin.supabase.from("blog_media").insert({ ...row, ...extra }).select(MEDIA_FIELDS).single();
  // Köken sütunları henüz yoksa (migration uygulanmadan önce) görsel yine kaydedilir.
  if (insertError && Object.keys(extra).length && ["PGRST204", "42703"].includes(insertError.code)) {
    ({ data: media, error: insertError } = await admin.supabase.from("blog_media").insert(row).select(MEDIA_FIELDS).single());
  }

  if (insertError) {
    // Kayıt oluşmadıysa depoda sahipsiz dosya bırakılmaz.
    await bucket.remove([storagePath]);
    console.error("[blog] medya kaydı oluşturulamadı:", insertError);
    return { error: "Görsel kaydedilemedi. Yeniden dene.", status: 500 };
  }

  return { media };
}
