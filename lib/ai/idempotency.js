// Aynı işlem kimliğiyle gelen istekleri tek işe indirger (sunucu örneği içinde).
// - Aynı anda gelen ikinci istek yeni üretim başlatmaz; ilk işin sonucunu bekler.
// - Tamamlanan işin sonucu kısa süre saklanır; aynı kimlikle tekrar gelen istek
//   (ör. bağlantı kopup yeniden denendiğinde) yeniden üretim yapmaz.
// - Hata sonuçları saklanmaz: kullanıcı güvenle yeniden deneyebilir.
// Örnekler arası kalıcı idempotency için ai_jobs tablosu gerekir (önerilen migration).

const inflight = new Map();
const done = new Map();
const DONE_TTL_MS = 10 * 60_000;
const DONE_MAX = 200;

export const isOperationId = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(value);

export function resetIdempotency() {
  inflight.clear();
  done.clear();
}

export async function runOnce(key, task, { now = Date.now, ttlMs = DONE_TTL_MS } = {}) {
  if (!key) return { value: await task(), reused: false };
  const cached = done.get(key);
  if (cached && cached.expires > now()) return { value: cached.value, reused: true };
  if (inflight.has(key)) return { value: await inflight.get(key), reused: true };

  const promise = (async () => task())();
  inflight.set(key, promise);
  try {
    const value = await promise;
    done.set(key, { value, expires: now() + ttlMs });
    while (done.size > DONE_MAX) done.delete(done.keys().next().value);
    return { value, reused: false };
  } finally {
    inflight.delete(key);
  }
}
