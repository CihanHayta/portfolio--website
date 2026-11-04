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

// Sayfayı açar ve yerleşmesini bekler. /blog'daki yazar videoları akış hâlinde
// indirildiği için (istek açık kalır) Playwright'ın "networkidle" durumu oluşmayabilir.
// Bu yardımcı "load"dan sonra video/ses dışındaki isteklerin 500 ms susmasını ve
// yazı tiplerini bekler; yani "networkidle" ile aynı, yalnızca medya akışını saymaz.
const isMedia = (request) => request.resourceType() === "media" || /\.(mp4|webm|m4a|mp3)(\?|$)/.test(request.url());

function trackRequests(page) {
  const pending = new Set();
  const onRequest = (request) => !isMedia(request) && pending.add(request);
  const onDone = (request) => pending.delete(request);
  page.on("request", onRequest);
  page.on("requestfinished", onDone);
  page.on("requestfailed", onDone);
  return {
    pending,
    stop() {
      page.off("request", onRequest);
      page.off("requestfinished", onDone);
      page.off("requestfailed", onDone);
    },
  };
}

async function waitQuiet(page, pending, { timeout = 20_000, quietMs = 500 } = {}) {
  const start = Date.now();
  let quietSince = Date.now();
  while (Date.now() - start < timeout) {
    if (pending.size) quietSince = Date.now();
    else if (Date.now() - quietSince >= quietMs) break;
    await page.waitForTimeout(100);
  }
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
}

// Zaten açık sayfada (ör. kaydırma ya da tıklamadan sonra) yerleşmeyi bekler.
export async function settle(page, options) {
  const tracker = trackRequests(page);
  try {
    await waitQuiet(page, tracker.pending, options);
  } finally {
    tracker.stop();
  }
}

export async function gotoSettled(page, url, { timeout = 60_000, ...options } = {}) {
  const tracker = trackRequests(page);
  try {
    const response = await page.goto(url, { ...options, timeout, waitUntil: "load" });
    await waitQuiet(page, tracker.pending);
    return response;
  } finally {
    tracker.stop();
  }
}
