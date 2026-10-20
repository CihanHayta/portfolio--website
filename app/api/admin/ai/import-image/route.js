import { errorResponse, json, readAdminRequest } from "@/lib/ai/http";
import { fetchImage } from "@/lib/ai/safeFetch";
import { encodeImage, storeMedia } from "@/lib/blog/media";

export const runtime = "nodejs";
export const maxDuration = 30;

const clip = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// Kullanıcının lisans uyarısını onaylayarak seçtiği kaynak görseli medya
// kütüphanesine aktarır. Görsel aynı SSRF korumalarıyla indirilir, içeriğinden
// doğrulanır ve WebP'ye çevrilir. Kaynak bağlantısı açıklama olarak saklanır.
export async function POST(request) {
  const { admin, body, response } = await readAdminRequest(request);
  if (!admin) return response;
  if (body.licenseConfirmed !== true) {
    return json({ error: "Kaynak görselleri yalnızca kullanım hakkını onayladıktan sonra aktarılabilir." }, 400);
  }

  const src = clip(body.src, 2000);
  const alt = clip(body.alt, 300);
  if (!src) return json({ error: "Görsel bağlantısı eksik." }, 400);

  try {
    const image = await fetchImage(src);
    const encoded = await encodeImage(image.body);
    if (encoded.error === "format") return json({ error: "Bu görsel biçimi desteklenmiyor (yalnızca JPG, PNG ve WebP)." }, 415);
    if (encoded.error) return json({ error: "Dosya geçerli bir görsel değil." }, 415);
    const host = new URL(image.finalUrl).hostname.replace(/^www\./, "");
    const stored = await storeMedia(admin, encoded.output, alt, { caption: `Kaynak: ${host}` });
    if (stored.error) return json({ error: stored.error }, stored.status);
    return json({ media: stored.media, source: image.finalUrl }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
