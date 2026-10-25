// AI Görsel Stüdyosu'nda kullanıcının seçtiği görselleri taslağa yerleştirir.
// - "cover" hedefi bloklara konmaz; yazının kapak alanına gider.
// - Bölüm görseli ilgili başlık bloğunun hemen altına eklenir; aynı bölüme
//   birden fazla görsel seçildiyse seçim sırası korunur.
// - Hedef bölüm taslakta yoksa görsel yazının sonuna yığılmaz; `unplaced`
//   olarak döner ve kullanıcıdan hedef seçmesi istenir.
// - Mevcut bloklar silinmez ve değiştirilmez.
// Görsel: { target, media: { id, url, width, height }, alt, caption }
import { createBlock } from "./model.js";

export function insertVisuals(blocks, picks) {
  const result = [...blocks];
  let cover = null;
  let placed = 0;
  const unplaced = [];
  const insertedAfter = new Map(); // başlık kimliği → o başlığın altına eklenen görsel sayısı

  for (const pick of picks) {
    if (!pick?.media?.url) continue;
    const alt = String(pick.alt ?? "").trim();
    if (pick.target === "cover") {
      if (!cover) cover = { media: pick.media, alt };
      else unplaced.push(pick); // ikinci kapak: kullanıcı başka bir bölüm seçmeli
      continue;
    }
    const index = result.findIndex((block) => block.id === pick.target && block.type === "heading");
    if (index < 0) {
      unplaced.push(pick);
      continue;
    }
    const offset = insertedAfter.get(pick.target) ?? 0;
    const block = createBlock("image", {
      image: { url: pick.media.url, alt, width: pick.media.width ?? null, height: pick.media.height ?? null },
      caption: String(pick.caption ?? "").trim().slice(0, 300),
    });
    result.splice(index + 1 + offset, 0, block);
    insertedAfter.set(pick.target, offset + 1);
    placed += 1;
  }

  return { blocks: result, cover, placed, unplaced };
}
