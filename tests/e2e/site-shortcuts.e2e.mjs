// Header tilki bağlantısı, footer logosu kısayolu ve telefon bağlantısı — GERÇEK tarayıcı.
//   node scripts/supabase/dev-test.mjs --prod   (ayrı terminalde, :3100)
//   node tests/e2e/site-shortcuts.e2e.mjs
// Masaüstü: kurulu Google Chrome (CHANNEL=chromium ile Playwright Chromium).
// Mobil (390 px): Chromium dokunmatik öykünmesi. Salt okunur; giriş yapmaz.
// Footer kısayolu yalnızca giriş ekranını açar; yetkiyi proxy + requireAdmin verir.
import { chromium } from "playwright-core";
import { gotoSettled, prepareContext } from "./_target.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const CHANNEL = process.env.CHANNEL ?? "chrome";
const PHONE = "tel:+905399417105";
const results = [];
const check = (ok, label, note = "") => {
  results.push(ok);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${note ? ` — ${note}` : ""}`);
};
const path = (page) => new URL(page.url()).pathname + new URL(page.url()).search;
const footerLogo = (page) => page.locator("footer [data-footer-logo]");

// Telefon bağlantısı: tıklama varsayılanı engellenmeden tel: hedefine gider mi?
// Test, gerçek arama uygulamasını açmamak için olayı en sonda (pencerede) kaydedip durdurur.
async function phoneCheck(page, label, tap = false) {
  const link = page.locator(`footer a[href^="tel:"]`);
  await link.scrollIntoViewIfNeeded();
  const info = await link.evaluate((a) => {
    const icon = a.querySelector("svg").getBoundingClientRect();
    const hit = document.elementFromPoint(icon.left + icon.width / 2, icon.top + icon.height / 2);
    return { href: a.getAttribute("href"), label: a.getAttribute("aria-label"), text: a.textContent.trim(), iconInside: a.contains(hit), iconHidden: a.querySelector("[aria-hidden=true] svg, svg[aria-hidden=true]") !== null, w: icon.width };
  });
  check(info.href === PHONE && info.text === "+90 539 941 71 05", `${label}: numara aynı, tel: bağlantısı doğru`, `${info.href} · ${info.text}`);
  check(/^Telefonla ara: \+90 539 941 71 05$/.test(info.label), `${label}: erişilebilir etiket`, info.label);
  check(info.iconInside && info.iconHidden, `${label}: ahize ikonu bağlantının içinde ve tıklanabilir (dekoratif olarak gizli)`);
  await page.evaluate(() => {
    window.__telClick = null;
    window.addEventListener("click", (event) => {
      const a = event.target.closest?.("a[href^='tel:']");
      if (!a) return;
      window.__telClick = { prevented: event.defaultPrevented, href: a.href };
      event.preventDefault();
    }, { once: true });
  });
  const icon = link.locator("svg");
  if (tap) await icon.tap();
  else await icon.click();
  const clicked = await page.evaluate(() => window.__telClick);
  check(clicked && !clicked.prevented && clicked.href === PHONE, `${label}: ikona ${tap ? "dokunmak" : "tıklamak"} tel: bağlantısını tetikliyor`);
}

const browser = await chromium.launch(CHANNEL === "chrome" ? { channel: "chrome" } : {});
try {
  // --- Masaüstü 1440 ---
  console.log(`\n=== Masaüstü 1440×900 · ${CHANNEL === "chrome" ? "Google Chrome" : "Playwright Chromium"}`);
  const context = await prepareContext(await browser.newContext({ viewport: { width: 1440, height: 900 } }), base);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await gotoSettled(page, `${base}/blog?kategori=teknoloji`);
  const fox = page.locator("header").getByRole("link", { name: "Blog ana sayfası" });
  check((await fox.count()) === 1 && (await fox.getAttribute("href")) === "/blog", "blog sayfasında tilki ayrı bir bağlantı (/blog)");
  const box = await fox.boundingBox();
  check(box.width >= 44 && box.height >= 44, "tilki tıklama alanı ≥44 px", `${box.width}×${box.height}`);
  const brandLink = page.locator("header").getByRole("link", { name: /ana sayfa$/ });
  check((await brandLink.getAttribute("href")) === "/", "marka yazısı masaüstünde ana sayfaya gidiyor (değişmedi)");
  await fox.click();
  await page.waitForURL((url) => url.pathname === "/blog" && !url.search, { timeout: 10_000 });
  check(path(page) === "/blog", "tilkiye tıklayınca /blog açıldı", path(page));
  await page.keyboard.press("Tab");
  await fox.focus();
  check(await fox.evaluate((el) => el === document.activeElement && getComputedStyle(el).outlineStyle !== "none"), "tilki klavyeyle odaklanıyor, odak görünür");
  await page.keyboard.press("Enter");
  await page.waitForURL((url) => url.pathname === "/blog", { timeout: 10_000 });

  await gotoSettled(page, `${base}/`);
  const homeLogo = await page.locator("header a").first().evaluate((a) => ({ href: a.getAttribute("href"), hasImg: Boolean(a.querySelector("img")), label: a.getAttribute("aria-label") }));
  check(homeLogo.href === "/" && homeLogo.hasImg && (await page.locator("header").getByRole("link", { name: "Blog ana sayfası" }).count()) === 0, "ana sayfada logo değişmedi (tek bağlantı, /)");

  // Footer: tek tıklama
  await gotoSettled(page, `${base}/blog`);
  await footerLogo(page).scrollIntoViewIfNeeded();
  const t0 = Date.now();
  await footerLogo(page).click();
  await page.waitForTimeout(300);
  const at300 = path(page);
  await page.waitForURL((url) => url.pathname === "/", { timeout: 10_000 });
  check(at300 === "/blog", "tek tıklamada sayfa hemen değişmiyor (çift tıklama bekleniyor)", `300 ms'de ${at300}`);
  check(path(page) === "/", "tek tıklama ana sayfaya götürdü", `${Date.now() - t0} ms`);

  // Footer: çift tıklama
  await gotoSettled(page, `${base}/blog`);
  await footerLogo(page).scrollIntoViewIfNeeded();
  await footerLogo(page).dblclick();
  await page.waitForURL((url) => url.pathname.startsWith("/admin/login"), { timeout: 10_000 });
  check(path(page).startsWith("/admin/login"), "çift tıklama yönetim giriş ekranını açtı", path(page));
  const loginForm = await page.getByLabel("E-posta").count();
  check(loginForm === 1, "giriş formu görünüyor (kimlik doğrulama atlanmadı)");

  // Footer: üçlü tıklama
  await gotoSettled(page, `${base}/blog`);
  await footerLogo(page).scrollIntoViewIfNeeded();
  await footerLogo(page).click({ clickCount: 3 });
  await page.waitForURL((url) => url.pathname.startsWith("/admin/login"), { timeout: 10_000 });
  await page.waitForTimeout(2500);
  check(path(page).startsWith("/admin/login"), "üçlü tıklama yönetim girişini açtı, sonradan ana sayfaya düşmedi", path(page));
  const selected = await page.evaluate(() => String(getSelection()));
  check(selected === "", "çoklu tıklamada logo yazısı seçilmedi");

  // Footer: klavye (Enter) gecikmesiz ana sayfa
  await gotoSettled(page, `${base}/blog`);
  await footerLogo(page).focus();
  const k0 = Date.now();
  await page.keyboard.press("Enter");
  await page.waitForURL((url) => url.pathname === "/", { timeout: 10_000 });
  check(Date.now() - k0 < 2000 && path(page) === "/", "klavyeyle (Enter) ana sayfaya gidiyor", `${Date.now() - k0} ms`);

  // Telefon
  await gotoSettled(page, `${base}/blog`);
  await phoneCheck(page, "masaüstü");
  await page.locator("footer").screenshot({ path: `${process.env.QA_OUT ?? "/tmp"}/footer-telefon-1440.png` }).catch(() => {});
  check(errors.length === 0, "konsol hatası yok", errors.join(" | ").slice(0, 160));
  await context.close();

  // --- Mobil 390 (dokunmatik öykünme) ---
  console.log("\n=== Mobil 390×844 (öykünme)");
  const mcontext = await prepareContext(await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }), base);
  const mpage = await mcontext.newPage();
  await gotoSettled(mpage, `${base}/blog?kategori=teknoloji`);
  const mfox = mpage.locator("header").getByRole("link", { name: "Blog ana sayfası" });
  for (const width of [360, 390]) {
    await mpage.setViewportSize({ width, height: 844 });
    await mpage.waitForTimeout(200);
    const mark = await mfox.locator("img").boundingBox();
    check(Math.abs(mark.width - 30) < 0.5 && Math.abs(mark.height - 30) < 0.5, `${width} px: tilki işareti ezilmiyor (30×30)`, `${mark.width.toFixed(1)}×${mark.height.toFixed(1)}`);
  }
  check((await mpage.locator("header").getByRole("link", { name: /yönetim girişi$/ }).getAttribute("href")) === "/admin", "telefonda marka yazısı yönetime gider (değişmedi)");
  await mfox.tap();
  await mpage.waitForURL((url) => url.pathname === "/blog" && !url.search, { timeout: 10_000 });
  check(path(mpage) === "/blog", "telefonda tilkiye dokununca /blog açıldı");

  await gotoSettled(mpage, `${base}/blog`);
  await footerLogo(mpage).scrollIntoViewIfNeeded();
  const seen = [];
  mpage.on("framenavigated", (frame) => frame === mpage.mainFrame() && seen.push(new URL(frame.url()).pathname));
  await footerLogo(mpage).tap();
  await footerLogo(mpage).tap().catch(() => {});
  await mpage.waitForTimeout(2500);
  check(!seen.some((p) => p.startsWith("/admin")) && path(mpage) === "/", "telefonda iki dokunuş yönetimi açmıyor, logo ana sayfaya gidiyor", seen.join(" → "));
  await gotoSettled(mpage, `${base}/blog`);
  await phoneCheck(mpage, "telefon", true);
  check((await mpage.locator('nav[aria-label="Hızlı iletişim"] a[href^="tel:"]').getAttribute("href")) === PHONE, "telefonda alttaki 'Hemen Ara' çubuğu aynı numara");
  await mcontext.close();
} catch (error) {
  check(false, `beklenmeyen hata: ${error.message.split("\n")[0]}`);
} finally {
  await browser.close();
}
console.log(`\nÖZET ${results.filter(Boolean).length}/${results.length} geçti`);
process.exitCode = results.every(Boolean) ? 0 : 1;
