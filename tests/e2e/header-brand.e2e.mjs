// Header marka alanı: "CİHAN | DİJİTAL PAZARLAMA" — SALT OKUNUR.
//   node tests/e2e/header-brand.e2e.mjs        (BASE_URL varsayılan http://localhost:3100)
// Header'ı kullanan herkese açık sayfalarda (ana sayfa, blog, gizlilik, 404) ve 320–1920 px
// genişliklerde: eski "Persona" adı header'ın metninde, etiketlerinde ve mobil menüsünde
// yok; yeni marka görünüyor (dar telefonda yalnızca "CİHAN"); marka sağındaki öğeyle
// (menü ya da düğme) çakışmıyor; yatay taşma yok; header yüksekliği aynı; bağlantı
// masaüstünde ana sayfaya, telefonda yönetime gidiyor (mevcut davranış).
import { chromium } from "playwright-core";
import { gotoSettled, prepareContext } from "./_target.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const PAGES = ["/", "/blog", "/gizlilik", "/bu-sayfa-yok-404"];
const WIDTHS = (process.env.ONLY ?? "320,360,375,390,430,480,560,561,600,768,820,1024,1120,1121,1239,1240,1280,1440,1920").split(",").map(Number);
const results = [];
const check = (ok, label, note = "") => {
  results.push(ok);
  if (!ok || process.env.VERBOSE) console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${note ? ` — ${note}` : ""}`);
};

const browser = await chromium.launch();
try {
  for (const path of PAGES) {
    console.log(`\n=== ${path}`);
    for (const w of WIDTHS) {
      const mobile = w < 1024;
      const context = await prepareContext(await browser.newContext({ viewport: { width: w, height: 800 }, isMobile: mobile, hasTouch: mobile }), base);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await gotoSettled(page, base + path);
      const m = await page.evaluate(() => {
        const header = document.querySelector("header");
        const inner = header.firstElementChild;
        const logo = inner.firstElementChild;
        const shown = (el) => el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0;
        const next = [...inner.children].slice(1).find(shown);
        const parts = [...logo.querySelectorAll("span")].filter(shown).map((el) => el.getBoundingClientRect());
        const right = Math.max(...parts.map((r) => r.right));
        const name = header.querySelector("[class*=logoName]");
        const suffix = header.querySelector("[class*=logoSuffix]");
        const attrs = [...header.querySelectorAll("*")].flatMap((el) => ["aria-label", "alt", "title"].map((a) => el.getAttribute(a)).filter(Boolean));
        const brandLink = [...header.querySelectorAll("a")].find((a) => /(ana sayfa|yönetim girişi)$/.test(a.getAttribute("aria-label") ?? "") && a.getAttribute("aria-label") !== "Blog ana sayfası");
        return {
          text: header.innerText,
          hidden: header.textContent,
          attrs,
          name: name?.textContent,
          nameColor: name ? getComputedStyle(name).color : null,
          suffixShown: shown(suffix),
          suffixText: suffix?.textContent,
          gap: next ? next.getBoundingClientRect().left - right : null,
          overflow: document.documentElement.scrollWidth - innerWidth,
          height: Math.round(header.getBoundingClientRect().height),
          brandHref: brandLink?.getAttribute("href"),
          brandLabel: brandLink?.getAttribute("aria-label"),
          nameTop: name?.getBoundingClientRect().top,
          headerTop: header.getBoundingClientRect().top,
        };
      });
      const label = `${w}px`;
      check(!/persona/i.test(m.hidden) && !m.attrs.some((a) => /persona/i.test(a)), `${label}: header'da (metin, etiket, mobil menü dahil) "Persona" yok`, m.attrs.filter((a) => /persona/i.test(a)).join(" | "));
      check(m.name === "CİHAN" && m.nameColor === "rgb(201, 162, 75)", `${label}: ana ad "CİHAN" (altın)`);
      const expectSuffix = !(w <= 560 || (w >= 1121 && w <= 1239));
      check(m.suffixShown === expectSuffix && m.suffixText === "DİJİTAL PAZARLAMA", `${label}: ikincil ifade ${expectSuffix ? "görünüyor" : "gizli (yer yok)"}`);
      check(m.gap === null || m.gap >= 8, `${label}: marka sağındaki öğeyle çakışmıyor`, `${m.gap?.toFixed(1)} px`);
      check(m.overflow <= 0, `${label}: yatay taşma yok`, `${m.overflow}`);
      check(m.height === 69, `${label}: header yüksekliği değişmedi (69 px)`, `${m.height}`);
      const mobileLayout = w <= 1120 || mobile;
      check(m.brandHref === (mobileLayout ? "/admin" : "/") && m.brandLabel?.startsWith("CİHAN DİJİTAL PAZARLAMA"), `${label}: marka bağlantısı ${mobileLayout ? "telefonda yönetime" : "ana sayfaya"} gidiyor, adı görünen metinle başlıyor`, `${m.brandHref} · ${m.brandLabel}`);
      if (w === 390 || w === 1440) {
        if (mobileLayout) {
          await page.getByRole("button", { name: "Menüyü aç" }).click();
          const menu = page.locator("#mobil-menu");
          await menu.waitFor({ state: "visible", timeout: 5000 });
          const items = await menu.locator("a").allInnerTexts();
          check(items.includes("Neden Ben?") && !items.some((t) => /persona/i.test(t)), `${label}: mobil menü açılıyor, "Neden Ben?" var`, items.join(" · "));
          await page.keyboard.press("Escape");
        } else {
          const nav = await page.locator("header nav a").allInnerTexts();
          check(nav.join("|") === "Hizmetler|Nasıl Çalışıyoruz?|Neden Ben?|SSS|Blog|İletişim", `${label}: menü yapısı aynı, "Neden Ben?"`, nav.join(" · "));
          if (path === "/blog") {
            await page.locator("header").getByRole("link", { name: /^CİHAN DİJİTAL PAZARLAMA ana sayfa$/ }).click();
            await page.waitForURL((url) => url.pathname === "/", { timeout: 10_000 });
            check(new URL(page.url()).pathname === "/", `${label}: markaya tıklayınca ana sayfa açıldı`);
          }
        }
      }
      check(errors.length === 0, `${label}: JS hatası yok`, errors.join(" | ").slice(0, 120));
      if (path === "/" && [360, 390, 768, 1121, 1440].includes(w) && process.env.QA_OUT) await page.locator("header").screenshot({ path: `${process.env.QA_OUT}/header-${w}.png` });
      await context.close();
    }
    console.log(`  ${path}: ${WIDTHS.length} genişlik ölçüldü`);
  }
  // Ana sayfadaki bölüm başlığı menüyle eşleşiyor.
  const context = await prepareContext(await browser.newContext({ viewport: { width: 1440, height: 900 } }), base);
  const page = await context.newPage();
  await gotoSettled(page, `${base}/`);
  const eyebrow = await page.locator("#neden").evaluate((el) => el.textContent);
  check(eyebrow.includes("Neden Ben?"), "ana sayfadaki #neden bölümünün başlığı 'Neden Ben?' (menüyle aynı)");
  await context.close();
} catch (error) {
  check(false, `beklenmeyen hata: ${error.message.split("\n")[0]}`);
} finally {
  await browser.close();
}
console.log(`\nÖZET ${results.filter(Boolean).length}/${results.length} geçti`);
process.exitCode = results.every(Boolean) ? 0 : 1;
