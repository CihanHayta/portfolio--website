// Ekran görüntülerini göndermeden önce tarayıcıda küçültür: uzun kenar en fazla
// 1600 px, JPEG. Toplam istek Vercel işlev sınırının (4,5 MB) altında kalır.
// Asıl doğrulama sunucuda yapılır; bu yalnızca boyut içindir.
export const SCREENSHOT_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_EDGE = 1600;

export async function resizeForAnalysis(file, { maxEdge = MAX_EDGE, quality = 0.82 } = {}) {
  const bitmap = await createImageBitmap(file);
  try {
    // Uzun ekran görüntüleri genişliğe göre küçültülür ki yazı okunur kalsın.
    const scale = Math.min(1, maxEdge / bitmap.width, (maxEdge * 3) / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("Görsel işlenemedi.");
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
