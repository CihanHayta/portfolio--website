// Blog listesi — GERÇEK sunucu ve test veritabanı (:3100).
//   node scripts/supabase/dev-test.mjs   (ayrı terminalde)
//   node tests/e2e/blog-list.e2e.mjs
// 32 geçici yayımlanmış yazı (RUN etiketi; sonunda silinir) ile:
// - kartların tek seferlik belirmesi (ilk ekran gizlenmez, aşağıdakiler kaydırınca, yönler),
//   düzen kayması (CLS), hareket azaltmada hiçbir kart gizlenmez;
// - ziyaretçinin cihaz teması: koyu modda liste koyu, kahverengi hero paneli aynı kalır;
// - slogan slaytı: ilk metin mevcut slogan, 2–3 sn'de değişir, iki metin üst üste binmez,
//   yükseklik sabit, üzerine gelince durur, hareket azaltmada sabit.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { projectKeys } from "../../scripts/supabase/_api.mjs";
import { resolveRef } from "../../scripts/supabase/project.mjs";
import { prepareContext } from "./_target.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const out = process.env.QA_OUT ?? mkdtempSync(join(tmpdir(), "persona-list-"));
const RUN = `e2e-lst-${Date.now().toString(36)}`;
const FIRST = "Doğru mesaj, doğru kitle, ölçülebilir sonuç.";
let failures = 0;
const check = (ok, label) => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`);
};

const keys = await projectKeys(resolveRef("test"));
const service = createClient(keys.url, keys.serviceRole, { auth: { persistSession: false } });
const before = (await service.from("blog_posts").select("id", { count: "exact", head: true })).count;
const rows = Array.from({ length: 32 }, (_, index) => ({
  title: `Liste testi yazısı ${index + 1}`,
  slug: `${RUN}-${index + 1}`,
  excerpt: "Kart animasyonu ve tema testi için geçici yazı.",
  content: { type: "blocks", version: 1, blocks: [] },
  content_text: "Geçici",
  reading_minutes: 3,
  status: "published",
  published_at: new Date(Date.now() - (index + 1) * 60_000).toISOString(),
}));
const { data: created } = await service.from("blog_posts").insert(rows).select("id").throwOnError();
const ids = created.map((row) => row.id);

const browser = await chromium.launch();
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    console.log(`\n=== ${w}x${h}`);
    const mobile = w < 1024;
    const context = await prepareContext(await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile }), base);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(`${base}/blog`, { waitUntil: "networkidle" });
    const cards = page.locator("[data-list-reveal]");
    const total = await cards.count();
    check(total >= 9, `liste kartları (${total})`);
    const state = () => cards.evaluateAll((els) => els.map((el) => ({ revealed: el.dataset.revealed ?? null, dir: el.dataset.revealDir, top: el.getBoundingClientRect().top, opacity: Number(getComputedStyle(el).opacity) })));
    let first = await state();
    const inView = first.filter((item) => item.top < h * 0.92);
    const below = first.filter((item) => item.top > h * 1.1);
    check(inView.length > 0 && inView.every((item) => item.revealed === "shown" && item.opacity === 1), "ilk ekrandaki kartlar hiç gizlenmedi");
    check(below.length > 0 && below.every((item) => !item.revealed && item.opacity === 0), "aşağıdaki kartlar kaydırılana kadar bekliyor");
    const dirs = new Set(first.map((item) => item.dir));
    check(mobile ? [...dirs].every((dir) => dir === "up") : dirs.has("left") && dirs.has("right"), `yönler: ${[...dirs].join(", ")}`);
    for (let y = 0; y < 20; y += 1) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(700);
    const after = await state();
    check(after.every((item) => item.revealed && item.opacity === 1), "kaydırınca tüm kartlar bir kez belirdi");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    check((await state()).every((item) => item.opacity === 1), "yukarı dönünce yeniden gizlenmiyor (tek seferlik)");
    const cls = await page.evaluate(() => window.__cls);
    check(cls < 0.02, `animasyon düzen kayması yaratmıyor (CLS ${cls.toFixed(3)})`);
    check(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, "yatay taşma yok");

    if (!mobile) {
      // Slogan slaytı: sayfa yeni açılmışken ölçülür (zamanlama sıfırdan başlar).
      await page.mouse.move(5, 5);
      await page.goto(`${base}/blog`, { waitUntil: "domcontentloaded" });
      const rotator = page.locator("[data-slogan-rotator]");
      await rotator.waitFor();
      const visible = () => rotator.evaluate((el) => [...el.querySelectorAll("[data-state]")].map((item) => ({ text: item.textContent, opacity: Number(getComputedStyle(item).opacity), state: item.dataset.state })));
      const shownText = async () => (await visible()).filter((item) => item.opacity > 0.5).map((item) => item.text);
      check((await shownText())[0] === FIRST, "ilk slogan mevcut metin");
      const heights = new Set();
      let overlap = 0;
      const changes = [];
      let wasOut = false;
      const started = Date.now();
      // İki ardışık değişim arası ölçülür (sayfa yüklenme anından bağımsız).
      while (Date.now() - started < 7000 && changes.length < 2) {
        const items = await visible();
        if (items.filter((item) => item.opacity > 0.15).length > 1) overlap += 1;
        heights.add(Math.round(await rotator.evaluate((el) => el.getBoundingClientRect().height)));
        const out = items.some((item) => item.state === "out");
        if (out && !wasOut) changes.push(Date.now() - started);
        wasOut = out;
        await page.waitForTimeout(30);
      }
      const interval = changes.length === 2 ? changes[1] - changes[0] : null;
      check(interval !== null && interval >= 2000 && interval <= 3200, `sloganlar ${interval} ms aralıkla değişiyor (2–3 sn)`);
      check(overlap === 0, "iki slogan aynı anda görünmedi (üst üste binme yok)");
      check(heights.size === 1, `alan yüksekliği sabit (${[...heights].join(", ")} px)`);
      await page.waitForTimeout(600); // geçiş bitsin
      const second = (await shownText())[0];
      check(second && second !== FIRST, `ikinci slogan: ${second}`);
      await rotator.hover();
      await page.waitForTimeout(600); // başlamış geçiş tamamlanır, sonra durur
      const held = await shownText();
      await page.waitForTimeout(3600);
      check(JSON.stringify(await shownText()) === JSON.stringify(held), "üzerine gelince slogan duruyor");
      const panel = await page.evaluate(() => getComputedStyle(document.querySelector("[class*=heroMedia]")).backgroundColor);
      check(panel === "rgb(241, 233, 218)", `kahverengi panel rengi korunuyor (${panel})`);
      await page.screenshot({ path: join(out, `liste-${w}.png`) });
    }
    check(errors.length === 0, `JS hatası yok ${errors.join(" | ").slice(0, 160)}`);
    await context.close();
  }

  // Ziyaretçinin cihazı koyu modda: liste koyu, hero paneli aynı
  const dark = await prepareContext(await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" }), base);
  const dp = await dark.newPage();
  await dp.goto(`${base}/blog`, { waitUntil: "networkidle" });
  const colors = await dp.evaluate(() => ({
    page: getComputedStyle(document.querySelector("[data-theme=blog]")).backgroundColor,
    card: getComputedStyle(document.querySelector("[data-list-reveal]")).backgroundColor,
    title: getComputedStyle(document.querySelector("[data-list-reveal] h2")).color,
    panel: getComputedStyle(document.querySelector("[class*=heroMedia]")).backgroundColor,
    quote: getComputedStyle(document.querySelector("[data-slogan-rotator]")).color,
  }));
  check(colors.page === "rgb(15, 15, 16)", `cihaz koyu modda liste koyu (${colors.page})`);
  check(colors.title === "rgb(255, 255, 255)", "kart başlıkları beyaz");
  check(colors.panel === "rgb(241, 233, 218)" && colors.quote === "rgb(20, 20, 20)", "kahverengi hero paneli ve slogan koyu modda da aynı");
  await dp.screenshot({ path: join(out, "liste-koyu.png") });
  await dark.close();
  const light = await prepareContext(await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" }), base);
  const lp = await light.newPage();
  await lp.goto(`${base}/blog`, { waitUntil: "networkidle" });
  check((await lp.evaluate(() => getComputedStyle(document.querySelector("[data-theme=blog]")).backgroundColor)) === "rgb(245, 240, 230)", "cihaz açık modda liste krem (mevcut tasarım)");
  await light.close();

  // Hareket azaltma: kart gizlenmez, slogan sabit
  const reduced = await prepareContext(await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" }), base);
  const rp = await reduced.newPage();
  await rp.goto(`${base}/blog`, { waitUntil: "networkidle" });
  check(await rp.evaluate(() => [...document.querySelectorAll("[data-list-reveal]")].every((el) => getComputedStyle(el).opacity === "1")), "hareket azaltmada hiçbir kart gizli değil");
  const firstText = await rp.locator("[data-slogan-rotator] [data-state=in]").innerText();
  await rp.waitForTimeout(3600);
  check(firstText === FIRST && (await rp.locator("[data-slogan-rotator] [data-state=in]").innerText()) === FIRST, "hareket azaltmada slogan sabit (ilk slogan)");
  await reduced.close();
} catch (failure) {
  failures++;
  console.log(`  FAIL beklenmeyen hata: ${failure.message.split("\n")[0]} ${(failure.message.match(/waiting for (.+)/) ?? [])[1]?.slice(0, 160) ?? ""}`);
} finally {
  await browser.close();
  await service.from("blog_posts").delete().in("id", ids);
  const after = (await service.from("blog_posts").select("id", { count: "exact", head: true })).count;
  console.log(`\ntemizlik: ${after === before ? "tamam" : "EKSİK"} (yazı ${before}→${after}) · ekran görüntüleri: ${out}`);
  if (after !== before) failures++;
  console.log(failures ? `\n${failures} kontrol başarısız` : "\nTÜM KONTROLLER GEÇTİ");
  process.exitCode = failures ? 1 : 0;
}
