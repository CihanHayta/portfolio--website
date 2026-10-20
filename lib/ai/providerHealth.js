// Harici okuyucular (Jina, Firecrawl) için basit devre kesici. Kota ya da hız
// sınırına takılan sağlayıcı bir süre hiç çağrılmaz. Süre yalnızca bizim
// bekleme süremizdir; sağlayıcının kota yenilenme zamanı bilinmez ve uydurulmaz.
// Not: sunucusuz ortamda her işlev örneğinin kendi belleği vardır; durum
// örnekler arasında paylaşılmaz.

export const COOLDOWN_MS = {
  rate: 15 * 60_000, // 429, Retry-After yoksa
  quota: 6 * 60 * 60_000, // 402 / kredi bitti
  server: 2 * 60_000, // 5xx
  timeout: 2 * 60_000,
};

const state = new Map();

export function cooldownFor(provider, now = Date.now()) {
  const entry = state.get(provider);
  if (!entry) return null;
  if (entry.until <= now) {
    state.delete(provider);
    return null;
  }
  return entry;
}

// `retryAfter`: HTTP Retry-After başlığı (saniye ya da tarih).
export function markFailure(provider, kind, { retryAfter = null, now = Date.now() } = {}) {
  if (!Object.hasOwn(COOLDOWN_MS, kind)) return null;
  let wait = COOLDOWN_MS[kind];
  if (retryAfter !== null && retryAfter !== undefined && retryAfter !== "") {
    const seconds = Number(retryAfter);
    const parsed = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - now;
    // Makul aralıkta değilse kendi varsayılanımız kullanılır.
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 24 * 60 * 60_000) wait = parsed;
  }
  const entry = { kind, until: now + wait };
  state.set(provider, entry);
  return entry;
}

export function markSuccess(provider) {
  state.delete(provider);
}

export function resetHealth() {
  state.clear();
}
