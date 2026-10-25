export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// İlerleme bilgisi için fetch yerine XMLHttpRequest kullanılır. Buradaki tür ve
// boyut denetimi yalnızca hızlı geri bildirim içindir; asıl doğrulama sunucudadır.
// `meta`: isteğe bağlı { alt, caption } (ör. AI görselinin sağlayıcı/model kaydı).
export function uploadMedia(file, onProgress, meta = {}) {
  return new Promise((resolve, reject) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return reject(new Error("Yalnızca JPG, PNG ve WebP görselleri yüklenebilir."));
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return reject(new Error("Dosya 4 MB sınırını aşıyor."));
    }

    const body = new FormData();
    body.append("file", file);
    if (meta.alt) body.append("alt", meta.alt);
    if (meta.caption) body.append("caption", meta.caption);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/media");
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status === 201 && xhr.response?.media) resolve(xhr.response.media);
      else reject(new Error(xhr.response?.error ?? "Görsel yüklenemedi. Yeniden dene."));
    };
    xhr.onerror = () => reject(new Error("Bağlantı kurulamadı. İnternetini kontrol edip yeniden dene."));
    xhr.send(body);
  });
}
