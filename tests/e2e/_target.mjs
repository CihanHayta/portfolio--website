// E2E hedefi: yerel sunucu, korumalı Vercel Preview ya da canlı site.
// Preview, Vercel Authentication ile korunur; testler "Protection Bypass for
// Automation" anahtarıyla girer. Anahtar yalnızca VERCEL_BYPASS ortam
// değişkeninden okunur, YALNIZCA hedef adrese gönderilir ve yazdırılmaz.
//   node scripts/e2e/with-preview-bypass.mjs node tests/e2e/blog-flow.e2e.mjs

const bypass = process.env.VERCEL_BYPASS ?? "";

export const bypassHeaders = bypass ? { "x-vercel-protection-bypass": bypass } : {};

// fetch: atlatma başlığı yalnızca hedef sitenin kendisine eklenir.
export function targetFetch(base, path, init = {}) {
  return fetch(base + path, { ...init, headers: { ...bypassHeaders, ...(init.headers ?? {}) } });
}

// Tarayıcı bağlamı: ilk istekte Vercel bir atlatma çerezi kurar; sayfadaki
// sonraki istekler bu çerezle geçer (başlık üçüncü taraflara gitmez).
export async function prepareContext(context, base) {
  if (!bypass) return context;
  const response = await context.request.get(`${base}/`, {
    headers: { ...bypassHeaders, "x-vercel-set-bypass-cookie": "true" },
    maxRedirects: 0,
  });
  if (response.status() >= 400) throw new Error(`Preview koruması aşılamadı (HTTP ${response.status()})`);
  return context;
}
