// CANLI herkese açık sayfalar: erişilebilirlik (axe-core, WCAG 2.2 A/AA) + temel performans.
// SALT OKUNUR.   node tests/e2e/live-a11y-perf.e2e.mjs
// Kritik/ciddi axe bulgusu FAIL'dir. Performans: TTFB, LCP, CLS, görsel biçimleri (bilgi + eşik).
import { createRequire } from "node:module";
import { chromium } from "playwright-core";
import { gotoSettled } from "./_target.mjs";
import { linkedProject, sql } from "../../scripts/supabase/_api.mjs";

const base = process.env.BASE_URL ?? "https://personadijitalpazarlama.com";
const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const [post] = await sql(linkedProject().ref, "select slug from public.blog_posts where status = 'published' and deleted_at is null and published_at <= now() order by published_at desc limit 1");
const results = [];
const check = (ok, label, note = "") => {
  results.push(ok);
  console.log(`  ${ok ? "PASS" : "FAIL"}       ${label}${note ? ` — ${note}` : ""}`);
};
const browser = await chromium.launch();
try {
  for (const [w, h, scheme] of [[1440, 900, "light"], [390, 844, "light"], [1440, 900, "dark"]]) {
    console.log(`\n=== ${w}px · cihaz teması ${scheme}`);
    const context = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 1024, hasTouch: w < 1024, colorScheme: scheme });
    for (const path of ["/", "/blog", `/blog/${post.slug}`, "/admin/login"]) {
      if (scheme === "dark" && path !== "/blog") continue;
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.__perf = { lcp: 0, cls: 0 };
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) window.__perf.lcp = entry.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__perf.cls += entry.value;
        }).observe({ type: "layout-shift", buffered: true });
      });
      await gotoSettled(page, base + path);
      await page.waitForTimeout(800);
      await page.addScriptTag({ path: axePath });
      const axe = await page.evaluate(async () => {
        const result = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
        return result.violations.map((item) => ({ id: item.id, impact: item.impact, nodes: item.nodes.length }));
      });
      const serious = axe.filter((item) => ["critical", "serious"].includes(item.impact));
      check(serious.length === 0, `${path} erişilebilirlik: kritik/ciddi bulgu yok`, axe.length ? axe.map((item) => `${item.id}(${item.impact},${item.nodes})`).join(" ") : "");
      const perf = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        const images = [...document.images].filter((img) => img.currentSrc).map((img) => img.currentSrc);
        const modern = images.filter((src) => /\/_next\/image|\.webp|\.avif|format=webp/.test(src)).length;
        return { ttfb: Math.round(nav.responseStart - nav.requestStart), lcp: Math.round(window.__perf.lcp), cls: Number(window.__perf.cls.toFixed(3)), images: images.length, modern };
      });
      check(perf.lcp <= 4000 && perf.cls <= 0.1, `${path} performans (LCP ≤4 sn, CLS ≤0,1)`, `TTFB ${perf.ttfb} ms · LCP ${perf.lcp} ms · CLS ${perf.cls} · görsel ${perf.images} (modern biçim/optimize ${perf.modern})`);
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
  console.log(`\nÖZET ${results.filter(Boolean).length}/${results.length} geçti`);
  process.exitCode = results.every(Boolean) ? 0 : 1;
}
