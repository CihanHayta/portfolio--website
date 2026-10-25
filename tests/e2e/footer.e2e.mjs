// Footer: Instagram, LinkedIn ve e-posta ikon grubunun ortalanması, eşit
// aralık, 44px dokunma alanı, bağlantı hedefleri ve yatay taşma. Salt okunur.
// Kullanım: npm run dev açıkken  node tests/e2e/footer.e2e.mjs [/yol ...]
// BASE_URL (varsayılan http://localhost:3000) ve QA_OUT ortam değişkenleri isteğe bağlı.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.QA_OUT ?? mkdtempSync(join(tmpdir(), "persona-e2e-"));
console.log(`Adres: ${base} · ekran görüntüleri: ${out}`);
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ["/", "/blog", "/gizlilik"];
const VIEWPORTS = [[360, 800], [390, 844], [430, 932], [820, 1180], [1440, 900]];
const EXPECTED = { Instagram: "https://www.instagram.com/persona_dijital_pazarlama/", LinkedIn: "https://www.linkedin.com/in/cihan-hayta-4586671a0/", "E-posta": "mailto:cihanhayta8080@gmail.com" };
const browser = await chromium.launch();
let failures = 0;
const check = (ok, label) => { if (!ok) failures++; console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`); };
for (const path of paths) {
  for (const [w, h] of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 800, hasTouch: w < 800 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + path, { waitUntil: "networkidle", timeout: 60000 });
    const footer = page.locator("footer").last();
    await footer.scrollIntoViewIfNeeded();
    const m = await footer.evaluate((el) => {
      const list = el.querySelector("ul");
      const links = [...list.querySelectorAll("a")];
      const r = (node) => node.getBoundingClientRect();
      const fr = r(el), lr = r(list);
      return {
        footerCenter: fr.left + fr.width / 2,
        groupLeft: Math.min(...links.map((a) => r(a).left)),
        groupRight: Math.max(...links.map((a) => r(a).right)),
        links: links.map((a) => {
          const box = r(a), svg = r(a.querySelector("svg"));
          return { name: a.getAttribute("aria-label"), href: a.getAttribute("href"), target: a.getAttribute("target"), w: box.width, h: box.height, cx: box.left + box.width / 2, cy: box.top + box.height / 2, iconCx: svg.left + svg.width / 2, iconCy: svg.top + svg.height / 2, left: box.left, right: box.right };
        }),
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    const groupCenter = (m.groupLeft + m.groupRight) / 2;
    const gaps = m.links.slice(1).map((l, i) => l.left - m.links[i].right);
    console.log(`${path} ${w}x${h}: groupCenter=${groupCenter.toFixed(1)} footerCenter=${m.footerCenter.toFixed(1)} gaps=${gaps.map((g) => g.toFixed(1)).join("/")} sizes=${m.links.map((l) => `${l.w}x${l.h}`).join(",")} iconOffset=${m.links.map((l) => `${(l.iconCx - l.cx).toFixed(1)},${(l.iconCy - l.cy).toFixed(1)}`).join(" ")}`);
    check(m.links.length === 3, "üç bağlantı var");
    check(Math.abs(groupCenter - m.footerCenter) <= 1, "grup footer'a göre yatayda ortalı (±1px)");
    check(new Set(m.links.map((l) => Math.round(l.cy))).size === 1, "merkezler aynı yatay hizada");
    check(gaps.every((g) => Math.abs(g - gaps[0]) <= 0.5), "aralıklar eşit");
    check(m.links.every((l) => l.w === m.links[0].w && l.h === m.links[0].h && l.w >= 44 && l.h >= 44), "boyutlar eşit ve ≥44px");
    check(m.links.every((l) => Math.abs(l.iconCx - l.cx) <= 0.75 && Math.abs(l.iconCy - l.cy) <= 0.75), "ikon kendi dairesinde ortalı");
    check(m.links.every((l) => EXPECTED[l.name] === l.href), "bağlantı hedefleri doğru");
    check(m.links.every((l) => (l.href.startsWith("http") ? l.target === "_blank" : !l.target)), "dış bağlantılar yeni sekmede, e-posta aynı sekmede");
    check(m.overflow <= 0, `yatay taşma yok (${m.overflow})`);
    check(errors.length === 0, `JS hatası yok ${errors.join(" | ").slice(0, 120)}`);
    await footer.screenshot({ path: `${out}/footer${path.replace(/\W+/g, "_")}-${w}.png` });
    await page.close();
  }
}
await browser.close();
console.log(failures ? `\n${failures} kontrol başarısız` : "\nTÜM KONTROLLER GEÇTİ");
process.exitCode = failures ? 1 : 0;
