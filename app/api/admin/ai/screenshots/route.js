import { getAdmin } from "@/lib/blog/admin";
import { encodeImage, isSameOrigin } from "@/lib/blog/media";
import { AiError } from "@/lib/ai/gemini";
import { generateJsonRouted as generateJson } from "@/lib/ai/textRouter";
import { errorResponse, json } from "@/lib/ai/http";
import { MAX_SCREENSHOTS, SCREENSHOT_SCHEMA, SCREENSHOT_SYSTEM, buildScreenshotPrompt, normalizeScreenshots } from "@/lib/ai/screenshots";

export const runtime = "nodejs";
export const maxDuration = 60;

// İstemci görüntüleri gönderimden önce küçültür; toplam gövde Vercel'in
// 4,5 MB işlev sınırının altında kalmalıdır.
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

// Makale ekran görüntülerinden kaynak metin çıkarır. Görüntüler doğrulanır
// (dosya içeriğinden, uzantıya güvenilmez), hiçbir yere kaydedilmez.
export async function POST(request) {
  if (!isSameOrigin(request)) return json({ error: "Geçersiz kaynak." }, 403);
  const admin = await getAdmin();
  if (!admin) return json({ error: "Oturumun sona ermiş. Yeniden giriş yap." }, 401);

  let files;
  try {
    files = (await request.formData()).getAll("images");
  } catch {
    return json({ error: "Yükleme okunamadı." }, 400);
  }
  files = files.filter((file) => file instanceof File && file.size > 0);
  if (files.length === 0) return json({ error: "En az bir ekran görüntüsü seç." }, 400);
  if (files.length > MAX_SCREENSHOTS) return json({ error: `En fazla ${MAX_SCREENSHOTS} ekran görüntüsü yüklenebilir.` }, 400);
  if (files.some((file) => file.size > MAX_FILE_BYTES)) return json({ error: "Ekran görüntülerinden biri 2 MB sınırını aşıyor." }, 413);
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) return json({ error: "Ekran görüntülerinin toplamı 4 MB sınırını aşıyor." }, 413);

  const images = [];
  for (const [index, file] of files.entries()) {
    const encoded = await encodeImage(Buffer.from(await file.arrayBuffer()), { quality: 80 });
    if (encoded.error) {
      return json({ error: `${index + 1}. dosya geçerli bir JPG, PNG ya da WebP görseli değil.` }, 415);
    }
    images.push({ mimeType: "image/webp", data: encoded.output.data.toString("base64") });
  }

  try {
    const result = await generateJson({
      task: "screenshot-read",
      db: admin.supabase,
      system: SCREENSHOT_SYSTEM,
      prompt: buildScreenshotPrompt(images.length),
      schema: SCREENSHOT_SCHEMA,
      images,
      temperature: 0.2,
      maxOutputTokens: 16_384,
      budgetMs: 55_000,
    });
    const source = normalizeScreenshots(result.data, images.length);
    if (source.wordCount < 40) {
      throw new AiError("Ekran görüntülerinde okunabilir makale metni bulunamadı. Daha net ya da daha büyük görüntüler dene.", "invalid");
    }
    return json({ source: { kind: "screenshots", ...source, screenshotCount: images.length }, model: result.model });
  } catch (error) {
    return errorResponse(error);
  }
}
