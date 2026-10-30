import "server-only";
import { encodeImage } from "@/lib/blog/media";
import { GRAPHIC_SIZES, hashSeed, renderGraphicSvg } from "./graphics.js";

// Blog görsellerinin hazırlandığı iki ücretsiz yol:
//  - "brand": sunucuda çizilen marka grafiği (varsayılan; yapay zekâ görseli değildir).
//  - "pollinations": Pollinations'ın anahtarsız herkese açık uç noktası. Ücretsizdir
//    ancak düşük çözünürlüklüdür ve görsele kendi filigranını ekler (Ekim 2026'da
//    gerçek istekle doğrulandı).
// Gemini'nin görsel modelleri ücretsiz katmanda kullanılamadığı için (kota: 0)
// bilerek entegre edilmemiştir.

// Pollinations görseli 2026-10-30'da kapatıldı (ücretsiz/ticari şart doğrulanamadı):
// klasik akış yalnızca sunucuda çizilen marka grafiğini üretir.
export const IMAGE_PROVIDERS = ["brand"];

export class ImageError extends Error {}

const POLLINATIONS_TIMEOUT_MS = 45_000;
const MAX_REMOTE_BYTES = 8 * 1024 * 1024;

async function brandGraphic(image, seed) {
  const svg = renderGraphicSvg({
    motif: image.motif,
    palette: image.palette,
    role: image.role,
    seed: hashSeed(`${image.concept}|${image.motif}|${seed}`),
  });
  const encoded = await encodeImage(Buffer.from(svg), { formats: ["svg"], quality: 90 });
  if (encoded.error) throw new ImageError("Marka grafiği oluşturulamadı.");
  return encoded.output;
}

async function pollinations(image, seed, fetchImpl) {
  const prompt = String(image.prompt ?? "").trim();
  if (!prompt) throw new ImageError("Bu görsel için yapay zekâ betimlemesi yok. Marka grafiğini kullan.");

  const { width, height } = GRAPHIC_SIZES[image.role] ?? GRAPHIC_SIZES.inline;
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 500))}` +
    `?width=${width}&height=${height}&seed=${Number(seed) % 1_000_000}`;

  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(POLLINATIONS_TIMEOUT_MS), redirect: "error" });
  } catch {
    throw new ImageError("Görsel servisi zamanında yanıt vermedi. Yeniden dene ya da marka grafiğini kullan.");
  }
  if (response.status === 429) {
    throw new ImageError("Görsel servisi istek sınırına takıldı. Biraz bekleyip yeniden dene.");
  }
  if (!response.ok) throw new ImageError("Görsel servisi görsel üretemedi. Yeniden dene ya da marka grafiğini kullan.");

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0 || buffer.length > MAX_REMOTE_BYTES) {
    throw new ImageError("Görsel servisi geçersiz bir yanıt döndürdü.");
  }
  const encoded = await encodeImage(buffer);
  if (encoded.error) throw new ImageError("Görsel servisi geçersiz bir görsel döndürdü.");
  return encoded.output;
}

// { output, kind } döndürür. kind: "brand" (çizim) | "ai" (yapay zekâ üretimi).
export async function createImage(image, { provider = "brand", seed = 1, fetchImpl = fetch } = {}) {
  if (provider === "pollinations") {
    return { output: await pollinations(image, seed, fetchImpl), kind: "ai" };
  }
  return { output: await brandGraphic(image, seed), kind: "brand" };
}
