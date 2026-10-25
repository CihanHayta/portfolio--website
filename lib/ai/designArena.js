// Design Arena: yalnızca MODEL SIRALAMASI bilgisi (resmî leaderboard API'si).
// Üretim API'si değildir; metin ya da görsel üretimi için kullanılmaz.
// Erişim onaylı anahtar ister (DESIGN_ARENA_API_KEY); herkese açık gösterimde
// Design Arena'ya atıf ve bağlantı zorunludur. Sonuç 1 saat önbelleklenir.

const API = "https://www.designarena.ai/api/v1";
const TTL_MS = 60 * 60_000;
let cache = { at: 0, value: null };

export const DESIGN_ARENA = {
  apply: "https://designarena.ai/developers/apply",
  attribution: "Sıralama verisi: Design Arena (designarena.ai)",
};

export function resetDesignArenaCache() {
  cache = { at: 0, value: null };
}

const pick = (item) => ({
  name: String(item?.name ?? item?.model_name ?? item?.model ?? item?.id ?? "").slice(0, 80),
  elo: Number.isFinite(Number(item?.elo ?? item?.rating ?? item?.score)) ? Math.round(Number(item.elo ?? item.rating ?? item.score)) : null,
  arena: item?.arena ?? item?.category ?? null,
});

export async function designArenaInfo({ env = process.env, fetchImpl = fetch, now = Date.now() } = {}) {
  if (!env.DESIGN_ARENA_API_KEY) return { configured: false, ...DESIGN_ARENA };
  if (cache.value && now - cache.at < TTL_MS) return cache.value;
  let value;
  try {
    const response = await fetchImpl(`${API}/models`, { headers: { authorization: `Bearer ${env.DESIGN_ARENA_API_KEY}` }, signal: AbortSignal.timeout(8_000) });
    if (response.status === 401 || response.status === 403) value = { configured: true, ok: false, error: "Anahtar geçersiz ya da erişim onaylanmamış." };
    else if (!response.ok) value = { configured: true, ok: false, error: `Design Arena yanıt vermedi (HTTP ${response.status}).` };
    else {
      const payload = await response.json();
      const list = Array.isArray(payload) ? payload : payload.data ?? payload.models ?? payload.leaderboard ?? [];
      value = { configured: true, ok: true, top: list.slice(0, 5).map(pick).filter((item) => item.name), fetchedAt: new Date(now).toISOString() };
    }
  } catch {
    value = { configured: true, ok: false, error: "Design Arena'ya ulaşılamadı." };
  }
  value = { ...value, ...DESIGN_ARENA };
  if (value.ok) cache = { at: now, value };
  return value;
}
