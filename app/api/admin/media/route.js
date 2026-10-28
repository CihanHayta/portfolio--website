import { getAdmin } from "@/lib/blog/admin";
import { encodeImage, isSameOrigin, storeMedia } from "@/lib/blog/media";

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
  try {
    const form = await request.formData();
    file = form.get("file");
    altText = String(form.get("alt") ?? "").trim().slice(0, 300);
    // İsteğe bağlı köken notu (ör. "AI: Cloudflare Workers AI · FLUX.1 [schnell]").
    caption = String(form.get("caption") ?? "").trim().slice(0, 300);
    // İsteğe bağlı yapılandırılmış köken: yükleme, AI, ChatGPT ile elle devir; taslak bağlantısı.
    const field = (name) => String(form.get(name) ?? "").trim();
    provenance = { origin: field("origin") || "upload", sourceUrl: field("sourceUrl"), provider: field("provider"), model: field("model"), draftPostId: field("draftPostId") };
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

  const stored = await storeMedia(admin, encoded.output, altText, { caption, provenance });
  if (stored.error) return json({ error: stored.error }, stored.status);

  return json({ media: stored.media }, 201);
}
