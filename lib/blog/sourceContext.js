// Taslağa bağlı kaynak bağlamı ve görsel stüdyosu durumu (yalnızca bu tarayıcıda).
// Veritabanında kaynak alanı olmadığı için (migration yapılmadan) taslağın kaynak
// URL'si, okunan metni, başlıkları ve görselleri burada saklanır; görsel
// aşamasında makale yeniden indirilmez. Yeni yazı ilk kayıtta kimlik alınca
// "new" anahtarı yazının kimliğine taşınır.

const SOURCE_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 gün
const VISUAL_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün
const MAX_TEXT = 40_000;

const sourceKey = (postId) => `persona-source:${postId ?? "new"}`;
const visualKey = (postId) => `persona-visual:${postId ?? "new"}`;
const defaultStorage = () => (typeof window === "undefined" ? null : window.localStorage);

function read(key, ttl, storage) {
  try {
    const value = JSON.parse(storage?.getItem(key) ?? "null");
    if (!value || Date.now() - (value.savedAt ?? 0) > ttl) return null;
    return value;
  } catch {
    return null;
  }
}
function write(key, value, storage) {
  try {
    storage?.setItem(key, JSON.stringify({ ...value, savedAt: Date.now() }));
    return true;
  } catch {
    return false; // depolama kapalı ya da dolu: yalnızca bu sayfa açıkken korunur
  }
}

// Okuyucunun döndürdüğü kaynaktan saklanacak güvenli özet.
export function sourceSnapshot(source) {
  if (!source?.url) return null;
  return {
    url: String(source.url),
    title: String(source.title ?? "").slice(0, 300),
    text: String(source.text ?? "").slice(0, MAX_TEXT),
    images: (source.images ?? []).slice(0, 40).map((image) => ({ src: image.src, alt: String(image.alt ?? "").slice(0, 300), section: String(image.section ?? "").slice(0, 160) })),
    wordCount: Number(source.wordCount) || 0,
    provider: source.provider ?? null,
    truncated: Boolean(source.truncated),
    missingFrom: source.missingFrom ?? null,
  };
}

export function saveSourceContext(postId, source, storage = defaultStorage()) {
  const snapshot = sourceSnapshot(source);
  return snapshot ? write(sourceKey(postId), snapshot, storage) : false;
}
export const loadSourceContext = (postId, storage = defaultStorage()) => read(sourceKey(postId), SOURCE_TTL_MS, storage);

export const saveVisualState = (postId, state, storage = defaultStorage()) => write(visualKey(postId), state, storage);
export const loadVisualState = (postId, storage = defaultStorage()) => read(visualKey(postId), VISUAL_TTL_MS, storage);

// Yeni yazı ilk kez kaydedildiğinde "new" bağlamı yazının kimliğine taşınır.
export function adoptNewContext(postId, storage = defaultStorage()) {
  if (!postId) return;
  for (const key of [sourceKey, visualKey]) {
    try {
      const value = storage?.getItem(key(null));
      if (value && !storage.getItem(key(postId))) storage.setItem(key(postId), value);
      storage?.removeItem(key(null));
    } catch {
      // yok sayılır
    }
  }
}
