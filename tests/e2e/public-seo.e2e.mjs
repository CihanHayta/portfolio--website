// Herkese açık sayfa ve SEO gerilemesi (SALT OKUNUR).
//   BASE_URL=http://localhost:3000 node tests/e2e/public-seo.e2e.mjs
//   BASE_URL=https://personadijitalpazarlama.com node tests/e2e/public-seo.e2e.mjs
// sitemap/robots, sayfalama (308/404), 404, canonical = og:url, JSON-LD, CTA kartı,
// güvenlik başlıkları, JS/ağ hataları ve 390/1440 genişlikte yatay taşma.

import { chromium } from "playwright-core";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const expectHeaders = process.env.EXPECT_SECURITY_HEADERS !== "0";
let failures = 0;
const check = (ok, label) => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`);
};
const raw = (path) => fetch(base + path, { redirect: "manual" });

const sitemapResponse = await raw("/sitemap.xml");
const sitemap = await sitemapResponse.text();
const slug = (sitemap.match(/<loc>[^<]*\/blog\/([^<?]+)<\/loc>/) ?? [])[1];
check(sitemapResponse.headers.get("content-type")?.includes("xml") && sitemap.trim().startsWith("<?xml") && (sitemap.match(/<url>/g) ?? []).length >= 2, `sitemap XML (${(sitemap.match(/<url>/g) ?? []).length} adres)`);
const robots = await (await raw("/robots.txt")).text();
check(/Disallow: \/admin/.test(robots) && /Disallow: \/api\//.test(robots) && /Sitemap:/.test(robots), "robots.txt: /admin ve /api kapalı, sitemap var");
for (const [path, status, location] of [["/blog?page=1", 308, "/blog"], ["/blog?page=abc", 404], ["/blog?page=0", 404], ["/blog/bu-yazi-yok-e2e", 404]]) {
  const response = await raw(path);
  check(response.status === status && (!location || new URL(response.headers.get("location"), base).pathname === location), `${path} → ${response.status}`);
}
if (expectHeaders) {
  const home = await raw("/");
  const headers = Object.fromEntries(["x-content-type-options", "referrer-policy", "x-frame-options", "content-security-policy", "permissions-policy"].map((name) => [name, home.headers.get(name)]));
  check(headers["x-content-type-options"] === "nosniff" && headers["x-frame-options"] === "SAMEORIGIN" && /frame-ancestors 'self'/.test(headers["content-security-policy"] ?? "") && Boolean(headers["referrer-policy"]) && Boolean(headers["permissions-policy"]), "güvenlik başlıkları gönderiliyor");
}
for (const path of ["/api/admin/ai/services", "/api/admin/ai/visual-plan", "/api/admin/media"]) {
  const response = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  check(response.status === 401, `oturumsuz POST ${path} → ${response.status}`);
}

const browser = await chromium.launch();
for (const [w, h] of [[390, 844], [1440, 900]]) {
  for (const path of ["/", "/blog", ...(slug ? [`/blog/${slug}`] : [])]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: w < 1024 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    // Next'in bağlantı ön yüklemelerini (_rsc) tarayıcı kendisi iptal edebilir (ERR_ABORTED): hata değildir.
    const abortedPrefetch = (request) => request.failure()?.errorText === "net::ERR_ABORTED" && /[?&]_rsc=/.test(request.url());
    page.on("requestfailed", (request) => !/_next\/webpack-hmr|__nextjs/.test(request.url()) && !abortedPrefetch(request) && errors.push(`ağ: ${request.url()} ${request.failure()?.errorText ?? ""}`));
    page.on("response", (response) => response.status() >= 500 && errors.push(`${response.status()} ${response.url()}`));
    const response = await page.goto(base + path, { waitUntil: "networkidle" });
    const info = await page.evaluate(() => ({
      canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
      ogUrl: document.querySelector('meta[property="og:url"]')?.content ?? null,
      jsonLd: document.querySelectorAll('script[type="application/ld+json"]').length,
      overflow: document.documentElement.scrollWidth - innerWidth,
      h1: document.querySelectorAll("h1").length,
    }));
    const label = `${w} ${path}`;
    check(response.status() === 200 && info.h1 === 1, `${label}: 200 ve tek H1`);
    if (path !== "/") check(info.canonical && info.ogUrl && new URL(info.canonical).pathname === new URL(info.ogUrl).pathname, `${label}: canonical = og:url`);
    if (path.startsWith("/blog/")) check(info.jsonLd >= 1, `${label}: JSON-LD var`);
    if (path.startsWith("/blog")) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.6));
      check(await page.locator("#blog-cta-card-title").waitFor({ timeout: 8000 }).then(() => true, () => false), `${label}: iletişim CTA kartı görünür`);
    }
    check(info.overflow <= 0, `${label}: yatay taşma yok`);
    check(errors.length === 0, `${label}: JS/ağ hatası yok ${errors.join(" | ").slice(0, 160)}`);
    await page.close();
  }
}
await browser.close();
console.log(failures ? `\n${failures} kontrol başarısız` : "\nTÜM KONTROLLER GEÇTİ");
process.exitCode = failures ? 1 : 0;
