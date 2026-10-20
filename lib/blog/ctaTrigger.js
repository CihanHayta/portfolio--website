// Blog iletişim kartının ne zaman görüneceğine karar veren saf kurallar
// (bileşen ve testler ortak kullanır). Kişisel veri tutulmaz; yalnızca bu
// sekmenin oturumunda kaç kez gösterildiği ve kapatılıp kapatılmadığı saklanır.

export const SESSION_KEY = "persona-blog-cta";
export const ARTICLE_THRESHOLD = 0.45; // makale gövdesinin okunan oranı
export const LIST_THRESHOLD = 0.6; // liste sayfasının kaydırılan oranı
export const LIST_MIN_SCROLL = 400; // px; kısa sayfada açılışta tetiklenmesin
export const MAX_SHOWS = 2; // aynı oturumda en fazla

// Gövdenin, ekranın alt kenarından yukarı geçen oranı (0-1).
export function readingProgress(top, height, viewportHeight) {
  if (!height || height <= 0) return 0;
  return Math.min(1, Math.max(0, (viewportHeight - top) / height));
}

export function readSession(raw) {
  try {
    const value = JSON.parse(raw ?? "null");
    return { dismissed: value?.dismissed === true, shows: Math.max(0, Number(value?.shows) || 0) };
  } catch {
    return { dismissed: false, shows: 0 };
  }
}

export function canShow(session) {
  return !session.dismissed && session.shows < MAX_SHOWS;
}

// mode: "article" | "list"
export function reachedThreshold(mode, { progress = 0, scrollY = 0, scrollHeight = 0, viewportHeight = 0 }) {
  if (mode === "article") return progress >= ARTICLE_THRESHOLD;
  const scrollable = scrollHeight - viewportHeight;
  if (scrollable <= 0) return false;
  // Kısa sayfada eşik kaydırılabilir mesafenin yarısıyla sınırlanır; açılışta (scrollY 0) asla.
  if (scrollY <= 0 || scrollY < Math.min(LIST_MIN_SCROLL, scrollable * 0.5)) return false;
  return (scrollY + viewportHeight) / scrollHeight >= LIST_THRESHOLD;
}
