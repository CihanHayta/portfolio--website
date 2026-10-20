import { GRAPHIC_MOTIFS, GRAPHIC_PALETTES } from "@/lib/ai/graphics";
import { errorResponse, json, readAdminRequest } from "@/lib/ai/http";
import { IMAGE_PROVIDERS, createImage } from "@/lib/ai/images";
import { storeMedia } from "@/lib/blog/media";

export const runtime = "nodejs";
export const maxDuration = 60;

const clip = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// 2. adım: onaylanan plandaki tek bir görseli hazırlar ve mevcut medya
// kütüphanesine (Supabase Storage + blog_media) kaydeder.
export async function POST(request) {
  const { admin, body, response } = await readAdminRequest(request);
  if (!admin) return response;

  const input = body.image ?? {};
  const image = {
    role: input.role === "cover" ? "cover" : "inline",
    concept: clip(input.concept, 90),
    alt: clip(input.alt, 300),
    motif: GRAPHIC_MOTIFS.includes(input.motif) ? input.motif : "layers",
    palette: GRAPHIC_PALETTES.includes(input.palette) ? input.palette : "forest",
    prompt: clip(input.prompt, 500),
  };
  if (!image.concept || !image.alt) return json({ error: "Görselin konusu ve alt metni gerekli." }, 400);

  const provider = IMAGE_PROVIDERS.includes(body.provider) ? body.provider : "brand";
  const seed = Number.isInteger(body.seed) ? Math.abs(body.seed) : 1;

  try {
    const { output, kind } = await createImage(image, { provider, seed });
    const stored = await storeMedia(admin, output, image.alt);
    if (stored.error) return json({ error: stored.error }, stored.status);
    return json({ media: stored.media, kind, provider }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
