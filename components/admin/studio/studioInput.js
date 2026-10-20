// Stüdyo girdisi için saf yardımcılar (bileşen ve testler ortak kullanır).

// "ornek.com/yazi" gibi şemasız girişler https ile tamamlanır. Geçersiz ya da
// http(s) dışı adres null; boş giriş "" döner. Güvenlik denetimi sunucudadır.
export function normalizeUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || !url.hostname.includes(".")) return null;
    return url.href;
  } catch {
    return null;
  }
}

// Sunucudaki targetWordsFor ile aynı kural: kaynak uzunluğu, 600–2.500 aralığında.
export function autoTarget(sources) {
  const size = Math.max(0, ...sources.filter((source) => source.kind !== "text").map((source) => Number(source.wordCount) || 0));
  return size ? Math.min(2500, Math.max(600, Math.round(size / 50) * 50)) : 1000;
}
