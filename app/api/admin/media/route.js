import { getAdmin } from "@/lib/blog/admin";
import { MEDIA_FIELDS, MEDIA_FOLDERS, encodeImage, isSameOrigin, storeMedia } from "@/lib/blog/media";

export const runtime = "nodejs";

// Vercel işlev gövdesi sınırı (4,5 MB) altında kalır.
const MAX_BYTES = 4 * 1024 * 1024;

const json = (body, status) => Response.json(body, { status });

export async function POST(request) {
  if (!isSameOrigin(request)) return json({ error: "Geçersiz kaynak." }, 403);

  const admin = await getAdmin();
  if (!admin) return json({ error: "Oturumun sona ermiş. Yeniden giriş yap." }, 401);

  let file;
  let altText = "";
  let caption = "";
  let provenance = null;
  let folder = "";
  try {
    const form = await request.formData();
    file = form.get("file");
    altText = String(form.get("alt") ?? "").trim().slice(0, 300);
    // İsteğe bağlı köken notu (ör. "AI: Cloudflare Workers AI · FLUX.1 [schnell]").
    caption = String(form.get("caption") ?? "").trim().slice(0, 300);
    // İsteğe bağlı yapılandırılmış köken: yükleme, AI, ChatGPT ile elle devir; taslak bağlantısı.
    const field = (name) => String(form.get(name) ?? "").trim();
    provenance = { origin: field("origin") || "upload", sourceUrl: field("sourceUrl"), provider: field("provider"), model: field("model"), draftPostId: field("draftPostId") };
    folder = MEDIA_FOLDERS.includes(field("folder")) ? field("folder") : "";
  } catch {
    return json({ error: "Yükleme okunamadı." }, 400);
  }

  if (!(file instanceof File) || file.size === 0) return json({ error: "Dosya seçilmedi." }, 400);
  if (file.size > MAX_BYTES) return json({ error: "Dosya 4 MB sınırını aşıyor." }, 413);

  const encoded = await encodeImage(Buffer.from(await file.arrayBuffer()));
  if (encoded.error === "format") {
    return json({ error: "Yalnızca JPG, PNG ve WebP görselleri yüklenebilir." }, 415);
  }
  if (encoded.error) return json({ error: "Dosya geçerli bir görsel değil." }, 415);

  const stored = await storeMedia(admin, encoded.output, altText, { caption, provenance, folder });
  if (stored.error) return json({ error: stored.error }, stored.status);

  return json({ media: stored.media }, 201);
}

// Yönetici listesi: ?folder=maskot (maskot referansları) ya da ?origin=upload|ai|handoff|source
// (blok ayarlarındaki "Yapay zekâyla oluştur" penceresinin grupları). En yeni 60 kayıt.
const ORIGINS = ["upload", "ai", "handoff", "source"];
export async function GET(request) {
  const admin = await getAdmin();
  if (!admin) return json({ error: "Oturumun sona ermiş. Yeniden giriş yap." }, 401);
  const params = new URL(request.url).searchParams;
  // ?coverUse=<medya kimliği>: bu görseli kapak olarak kullanan yazılar (her yazıya özgü kapak uyarısı).
  const coverUse = params.get("coverUse");
  if (coverUse) {
    if (!/^[0-9a-f-]{36}$/i.test(coverUse)) return json({ error: "Geçersiz kimlik." }, 400);
    const { data, error } = await admin.supabase.from("blog_posts").select("id, title").eq("cover_media_id", coverUse).is("deleted_at", null).limit(5);
    if (error) return json({ error: "Kullanım okunamadı." }, 500);
    return Response.json({ posts: data }, { headers: { "cache-control": "no-store" } });
  }
  const folder = params.get("folder") ?? "";
  const origins = (params.get("origin") ?? "").split(",").filter((value) => ORIGINS.includes(value));
  let query = admin.supabase.from("blog_media").select(MEDIA_FIELDS).order("created_at", { ascending: false }).limit(60);
  if (folder) {
    if (!MEDIA_FOLDERS.includes(folder)) return json({ error: "Geçersiz klasör." }, 400);
    query = query.like("storage_path", `${folder}/%`);
  }
  if (origins.length) query = query.in("origin", origins);
  const { data, error } = await query;
  if (error) {
    console.error("[blog] medya listelenemedi:", error);
    return json({ error: "Görseller listelenemedi." }, 500);
  }
  return Response.json({ media: data }, { headers: { "cache-control": "no-store" } });
}
