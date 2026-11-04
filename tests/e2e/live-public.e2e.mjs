// CANLI herkese açık sayfalar — SALT OKUNUR (hiçbir kayıt oluşturmaz, form göndermez).
//   node tests/e2e/live-public.e2e.mjs      (BASE_URL varsayılan: canlı alan adı)
// Ana sayfa, menü/bağlantılar, slogan slaytı ve kahverengi panel, blog listesi (gerçek
// yayımlanmış yazılar, tema, kart animasyonu), gerçek yazı detayı (başlık hiyerarşisi,
// İçindekiler, aktif başlık, okuma çubuğu, yazar, kapanış CTA), 360–1440 px taşma,
// kırık görsel/bağlantı ve JavaScript hataları. Yayımlanmış yazı sayısı canlı veritabanıyla
// salt okunur karşılaştırılır.

import { chromium } from "playwright-core";
import { gotoSettled } from "./_target.mjs";
import { linkedProject, sql } from "../../scripts/supabase/_api.mjs";

const base = process.env.BASE_URL ?? "https://personadijitalpazarlama.com";
const WIDTHS = (process.env.ONLY ?? "360,390,430,768,1440").split(",").map(Number);
const results = [];
const record = (status, label, note = "") => {
  results.push({ status, label, note });
  console.log(`  ${status.padEnd(10)} ${label}${note ? ` — ${note}` : ""}`);
};
const check = (ok, label, note = "") => record(ok ? "PASS" : "FAIL", label, note);

const ref = linkedProject().ref;
const published = await sql(ref, "select slug, title, (select name from public.blog_categories c where c.id = category_id) category, published_at from public.blog_posts where status = 'published' and deleted_at is null and published_at <= now() order by published_at desc");
const post = published[0];
console.log(`Canlı veritabanı: ${published.length} yayımlanmış yazı (${published.map((row) => row.slug).join(", ")})`);

// Yazar videolarının sesi hoparlöre verilmez (--mute-audio); video öğesinin durumu ölçülür.
const browser = await chromium.launch({ args: ["--mute-audio"] });
const statusOf = async (url) => {
  try {
    const response = await fetch(url, { redirect: "follow" });
    return response.status;
  } catch {
    return 0;
  }
};
const brokenImages = (page) =>
  page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += innerHeight) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
    return [...document.images].filter((img) => img.currentSrc && img.complete && img.naturalWidth === 0).map((img) => img.currentSrc.slice(0, 120));
  });

try {
  for (const w of WIDTHS) {
    const h = w < 1024 ? 844 : 900;
    const mobile = w < 1024;
    console.log(`\n=== ${w}x${h}`);
    const context = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => message.type() === "error" && !/Failed to load resource/.test(message.text()) && errors.push(message.text().slice(0, 160)));
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

    // A. Ana sayfa
    const home = await gotoSettled(page, `${base}/`);
    check(home.status() === 200, "A ana sayfa açılıyor");
    check((await overflow()) <= 0, "A ana sayfada yatay taşma yok");
    const homeBroken = await brokenImages(page);
    check(homeBroken.length === 0, "A ana sayfa görselleri yükleniyor", homeBroken.join(", "));
    if (mobile) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.getByRole("button", { name: /menü/i }).first().tap();
      const menu = page.locator("#mobil-menu");
      await menu.waitFor({ state: "visible", timeout: 5_000 });
      check((await menu.getByRole("link", { name: "Ana sayfa" }).count()) === 1 && (await menu.getByRole("link", { name: "Blog" }).count()) >= 1, "A mobil menü açılıyor (Ana sayfa + Blog bağlantıları)");
      await page.keyboard.press("Escape").catch(() => {});
      check((await page.getByRole("link", { name: /yönetim girişi$/ }).first().getAttribute("href")) === "/admin", "H telefonda logo tek dokunuşla yönetime gider (/admin)");
    } else {
      const nav = await page.locator("header nav a").evaluateAll((links) => links.map((a) => a.getAttribute("href")));
      check(nav.length >= 5, "A masaüstü menü bağlantıları", nav.join(" "));
      if (w === 1440) {
        const internal = [...new Set(await page.locator("a[href^='/']").evaluateAll((links) => links.map((a) => a.getAttribute("href").split("#")[0]).filter(Boolean)))].filter((href) => !href.startsWith("/admin"));
        const bad = [];
        for (const href of internal) if ((await statusOf(base + href)) !== 200) bad.push(href);
        check(bad.length === 0, `A ana sayfadaki iç bağlantılar 200 (${internal.length})`, bad.join(", "));
        const anchors = await page.locator("a[href^='#'], a[href^='/#']").evaluateAll((links) => links.map((a) => a.getAttribute("href").replace(/^\//, "")).filter((href) => href.length > 1));
        const missingOnPage = await page.evaluate((list) => list.filter((hash) => !document.getElementById(hash.slice(1))), [...new Set(anchors)]);
        check(missingOnPage.length === 0, "A menü çapaları sayfada var", missingOnPage.join(", "));
      }
    }
    check(errors.length === 0, "A ana sayfada JavaScript hatası yok", errors.join(" | ").slice(0, 160));
    errors.length = 0;

    // B. Blog listesi
    const list = await gotoSettled(page, `${base}/blog`);
    check(list.status() === 200, "B blog listesi açılıyor");
    const cards = page.locator("[data-list-reveal]");
    const titles = await cards.locator("h2").allInnerTexts();
    check(titles.length === published.length && published.every((row) => titles.includes(row.title)), `B gerçek yayımlanmış yazılar listede (${titles.length}/${published.length})`);
    const card = cards.first();
    const cardText = await card.innerText();
    check(cardText.includes(post.category ?? "") && /\d{1,2} [A-ZÇĞİÖŞÜa-zçğıöşü]{3} 20\d\d/.test(cardText) && /dk okuma/.test(cardText), "B kartta kategori, tarih ve okuma süresi", cardText.replace(/\s+/g, " ").slice(0, 120));
    const cover = await card.locator("img").first().evaluate((img) => img.complete && img.naturalWidth > 0).catch(() => false);
    check(cover, "B kart kapak görseli yüklendi");
    check((await statusOf(`${base}${await card.locator("a").first().getAttribute("href")}`)) === 200, "B kart bağlantısı açılıyor");
    const reveal = await cards.evaluateAll((els) => els.map((el) => ({ revealed: el.dataset.revealed ?? "", opacity: getComputedStyle(el).opacity })));
    check(reveal.every((item) => item.opacity === "1"), "B ilk ekrandaki kartlar görünür (animasyon içeriği gizlemiyor)", JSON.stringify(reveal));
    const listBroken = await brokenImages(page);
    check(listBroken.length === 0, "B blog listesinde kırık görsel yok", listBroken.join(", "));
    const chips = [...new Set(await page.locator("a[href^='/blog?kategori=']").evaluateAll((links) => links.map((a) => a.getAttribute("href"))))];
    const chipBad = [];
    for (const href of chips) if ((await statusOf(base + href)) !== 200) chipBad.push(href);
    check(chipBad.length === 0, `B kategori bağlantıları açılıyor (${chips.length})`, chipBad.join(", "));
    check((await overflow()) <= 0, "B blog listesinde yatay taşma yok");
    if (w > 860) {
      const panel = await page.evaluate(() => {
        const media = document.querySelector("[class*=heroMedia]");
        const quote = media.querySelector("figure");
        const rect = media.getBoundingClientRect();
        const qs = getComputedStyle(quote);
        return { ratio: rect.width / rect.height, bg: getComputedStyle(media).backgroundColor, left: qs.left, bottom: qs.bottom, width: Math.round(quote.getBoundingClientRect().width) };
      });
      check(Math.abs(panel.ratio - 325 / 312) < 0.02 && panel.bg === "rgb(241, 233, 218)" && panel.left === "-14px" && panel.bottom === "38px" && panel.width <= 204, "A kahverengi panelin boyutu, rengi ve slogan kartının konumu korunmuş", JSON.stringify(panel));
      // Slogan: sayfa yeni açılmışken ölçülür (yukarıdaki kaydırma zamanlamayı etkilemesin).
      await page.goto(`${base}/blog`, { waitUntil: "domcontentloaded" });
      await page.locator("[data-slogan-rotator]").waitFor();
      const first = await page.locator("[data-slogan-rotator] [data-state=in]").innerText();
      const timeline = await page.evaluate(async () => {
        const seen = [];
        let previous = null;
        let overlap = 0;
        const started = performance.now();
        while (performance.now() - started < 7000 && seen.length < 3) {
          const items = [...document.querySelectorAll("[data-slogan-rotator] [data-state]")];
          if (items.filter((item) => Number(getComputedStyle(item).opacity) > 0.15).length > 1) overlap += 1;
          const current = items.find((item) => item.dataset.state === "in")?.textContent;
          if (current && current !== previous) {
            seen.push({ text: current, at: Math.round(performance.now() - started) });
            previous = current;
          }
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
        return { seen, overlap };
      });
      const gap = timeline.seen.length >= 3 ? timeline.seen[2].at - timeline.seen[1].at : null;
      check(first === "Doğru mesaj, doğru kitle, ölçülebilir sonuç.", "A ilk slogan mevcut metin");
      check(gap !== null && gap >= 2000 && gap <= 3300 && timeline.overlap === 0, `A slogan geçişleri çalışıyor (${gap} ms aralık, üst üste binme yok)`, timeline.seen.map((item) => item.text.slice(0, 24)).join(" → "));
    } else {
      const hidden = await page.evaluate(() => getComputedStyle(document.querySelector("[class*=heroMedia]")).display === "none");
      check(hidden, "A dar ekranda kahverengi panel önceki tasarımdaki gibi gizli (≤860 px)");
    }
    // V. Yazar kutusundaki video slaytı (salt okunur: yalnızca oynatma ve kontroller)
    await page.goto(`${base}/blog`, { waitUntil: "load" });
    const stage = page.locator("[data-author-videos] [data-dir]");
    await stage.scrollIntoViewIfNeeded();
    await page.mouse.move(1, 1).catch(() => {});
    const slider = () => page.evaluate(() => {
      const root = document.querySelector("[data-author-videos]");
      const i = Number(root.dataset.index);
      const videos = [...root.querySelectorAll("video")];
      const v = videos[i];
      const box = v.getBoundingClientRect();
      const scale = Math.min(box.width / (v.videoWidth || 1), box.height / (v.videoHeight || 1));
      return { i, mode: root.dataset.mode, count: videos.length, playing: videos.filter((x) => !x.paused).length, paused: v.paused, muted: v.muted, t: v.currentTime, fit: getComputedStyle(v).objectFit, natural: `${v.videoWidth}x${v.videoHeight}`, cw: v.videoWidth * scale, ch: v.videoHeight * scale, bw: box.width, bh: box.height };
    });
    let sv = null;
    for (let waited = 0; waited < 15_000; waited += 300) {
      sv = await slider();
      if (!sv.paused && sv.t > 0.3) break;
      await page.waitForTimeout(300);
    }
    check(sv.count === 4 && !sv.paused && sv.muted && sv.playing === 1, "V yazar videosu sessiz otomatik oynuyor (4 slayt, tek video)", JSON.stringify({ i: sv.i, t: Number(sv.t.toFixed(1)), natural: sv.natural }));
    check(sv.fit === "contain" && sv.cw <= sv.bw + 0.5 && sv.ch <= sv.bh + 0.5 && Math.abs(sv.cw / sv.ch - 9 / 16) < 0.01, "V video kırpılmadan/esnemeden sığıyor (9:16, contain)", `${sv.cw.toFixed(0)}×${sv.ch.toFixed(0)} / ${sv.bw.toFixed(0)}×${sv.bh.toFixed(0)}`);
    if (w === 1440) {
      const startIndex = sv.i;
      let advanced = null;
      for (let waited = 0; waited < 9000; waited += 250) {
        await page.waitForTimeout(250);
        const now = await slider();
        if (now.i !== startIndex) { advanced = waited; break; }
      }
      check(advanced !== null, "V ~5,5 sn sonra sıradaki videoya geçti", `${advanced} ms`);
      await page.getByRole("button", { name: "Sesi aç" }).click();
      await page.mouse.move(1, 1);
      const soundOn = await slider();
      await page.waitForTimeout(8000);
      const held = await slider();
      check(soundOn.mode === "sound" && !soundOn.muted && held.i === soundOn.i && !held.paused, "V ses açılınca video sabit kaldı ve sesli sürdü (8 sn)");
      await page.getByRole("button", { name: "Sesi kapat" }).click();
      check((await slider()).muted, "V ses kapatıldı");
    }
    check(errors.length === 0, "B blog listesinde JavaScript hatası yok", errors.join(" | ").slice(0, 160));
    errors.length = 0;

    // H. Tilki bağlantısı, telefon ikonu ve footer kısayolu (yalnızca giriş ekranını açar)
    const fox = page.locator("header").getByRole("link", { name: "Blog ana sayfası" });
    check((await fox.count()) === 1 && (await fox.getAttribute("href")) === "/blog", "H blog sayfasında tilki /blog bağlantısı");
    const phone = await page.locator('footer a[href^="tel:"]').evaluate((a) => ({ href: a.getAttribute("href"), label: a.getAttribute("aria-label"), icon: Boolean(a.querySelector("svg")) }));
    check(phone.href === "tel:+905399417105" && phone.icon && phone.label === "Telefonla ara: +90 539 941 71 05", "H footer telefonunda ahize ikonu ve doğru tel: bağlantısı");
    if (w === 1440) {
      await page.locator("footer [data-footer-logo]").scrollIntoViewIfNeeded();
      await page.locator("footer [data-footer-logo]").dblclick();
      await page.waitForURL((url) => url.pathname.startsWith("/admin/login"), { timeout: 15_000 }).catch(() => {});
      check(new URL(page.url()).pathname.startsWith("/admin/login") && (await page.getByLabel("E-posta").count()) === 1, "H footer logosuna çift tıklama giriş ekranını açtı (giriş yapılmadı)");
    }
    errors.length = 0;

    // C. Gerçek yazı detayı
    const detail = await gotoSettled(page, `${base}/blog/${post.slug}`);
    check(detail.status() === 200, `C yazı açılıyor (${post.slug})`);
    const info = await page.evaluate(() => {
      const body = document.querySelector("[data-article-body]");
      const levels = [...body.querySelectorAll("h2, h3, h4")].map((el) => Number(el.tagName[1]));
      let skip = false;
      let last = 2;
      for (const level of levels) {
        if (level > last + 1) skip = true;
        last = level;
      }
      const cover = document.querySelector("article [class*=cover] img");
      return {
        h1: document.querySelectorAll("h1").length,
        title: document.querySelector("h1")?.textContent,
        levels,
        skip,
        cover: Boolean(cover && cover.complete && cover.naturalWidth > 0),
        meta: document.querySelector("article header ul")?.innerText ?? "",
        tone: document.querySelector("main[data-page-tone]")?.getAttribute("data-page-tone"),
      };
    });
    check(info.h1 === 1 && info.title === post.title, "C başlık (tek H1, doğru metin)");
    check(info.cover, "C kapak görseli yüklendi");
    check(/Cihan Hayta/.test(info.meta) && /\d{4}/.test(info.meta) && /dk okuma/.test(info.meta), "C yazar, tarih ve okuma süresi", info.meta.replace(/\s+/g, " "));
    check(info.levels.length > 0 && !info.skip, `C başlık hiyerarşisi atlamasız (${info.levels.join(",")})`);
    check(info.tone === "light", "C yazının kendi teması (açık) uygulanmış");
    const ids = await page.evaluate(() => [...document.querySelectorAll("[data-article-body] h2[id], [data-article-body] h3[id], [data-article-body] h4[id]")].map((el) => el.id));
    check(new Set(ids).size === ids.length, "C başlık kimlikleri benzersiz");
    const header = await page.evaluate(() => document.querySelector("header").getBoundingClientRect().bottom);
    if (!mobile) {
      const toc = page.getByRole("navigation", { name: "İçindekiler" });
      check((await toc.locator("li:not([data-sub]) [class*=number]").first().innerText()) === "01", "C İçindekiler numaralı (01 …)");
      const more = toc.getByRole("button", { name: /Tümünü göster/ });
      if (await more.count()) await more.click();
      const target = ids[Math.min(3, ids.length - 1)];
      await toc.locator(`a[href="#${target}"]`).click();
      await page.waitForTimeout(1_000);
      const top = await page.evaluate((id) => document.getElementById(id).getBoundingClientRect().top, target);
      check(top >= header + 2 && top <= header + 80, `C İçindekiler bağlantısı doğru bölüme gidiyor, başlık header'ın altında (${Math.round(top)} px)`);
      await page.waitForTimeout(300);
      const active = toc.locator(`a[href="#${target}"]`);
      const activeColor = await active.evaluate((a) => getComputedStyle(a).color);
      check((await active.getAttribute("aria-current")) === "location" && activeColor !== "rgb(107, 98, 89)", "C aktif bölüm vurgulu (aria-current + vurgu rengi)", activeColor);
    } else {
      const details = page.locator("details").filter({ hasText: "İçindekiler" }).first();
      check(!(await details.evaluate((el) => el.open)), "C telefonda İçindekiler kapalı başlıyor");
      await details.locator("summary").tap();
      await details.locator(`a[href="#${ids[1]}"]`).tap();
      await page.waitForTimeout(1_000);
      const top = await page.evaluate((id) => document.getElementById(id).getBoundingClientRect().top, ids[1]);
      check(top >= header + 2 && top <= header + 80, `C telefonda İçindekiler bağlantısı başlığı header'ın altında gösteriyor (${Math.round(top)} px)`);
    }
    // Okuma çubuğu: yalnızca makale gövdesine göre
    const progress = () => page.evaluate(() => Number(document.querySelector("[data-reading-progress]").dataset.progress));
    const geometry = await page.evaluate(() => {
      const body = document.querySelector("[data-article-body]").getBoundingClientRect();
      const bar = document.querySelector("[data-reading-progress]");
      return { top: body.top + scrollY, height: body.height, bar: bar.getBoundingClientRect().top, header: document.querySelector("header").getBoundingClientRect().bottom, barHeight: bar.getBoundingClientRect().height };
    });
    const offset = geometry.header + geometry.barHeight;
    const total = geometry.height - (h - offset);
    const go = async (y) => {
      await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
      await page.waitForTimeout(250);
    };
    await go(0);
    const p0 = await progress();
    await go(geometry.top - offset + total / 2);
    const p50 = await progress();
    await go(geometry.top - offset + total);
    const p100 = await progress();
    await go(999_999);
    const pFooter = await progress();
    await go(geometry.top - offset + total / 4);
    const pBack = await progress();
    check(Math.abs(geometry.bar - geometry.header) <= 1 && Math.round(geometry.barHeight) === 4, "C okuma çubuğu header'ın hemen altında, 4 px");
    check(p0 <= 0.02 && Math.abs(p50 - 0.5) <= 0.06 && p100 >= 0.99, `C okuma çubuğu makaleye göre ilerliyor (başta ${p0}, ortada ${p50}, sonda ${p100})`);
    check(pFooter === 1 && pBack < p50, `C footer'da %100'de kalıyor, yukarıda azalıyor (${pFooter} / ${pBack})`);
    // Makale sonu
    check((await page.getByRole("region", { name: "Yazıda kullanılan kaynaklar" }).count()) === 0, "C bu yazıda kaynak kaydı yok → sahte kaynakça gösterilmiyor");
    check((await page.locator("[data-type=faq]").count()) === 0, "C bu yazıda SSS bloğu yok (gösterilmiyor)");
    check((await page.getByRole("region", { name: /Cihan Hayta/ }).count()) === 1, "C yazar alanı");
    const closing = page.getByRole("complementary", { name: "Dijital Pazarlama İçin Ücretsiz Ön Görüşme" });
    check((await closing.count()) === 1, "C iletişim CTA alanı");
    await closing.getByRole("button", { name: "Benimle iletişime geç" }).click();
    check(await page.getByRole("dialog").filter({ hasText: /Görüşme/ }).first().isVisible(), "C 'Benimle iletişime geç' iletişim penceresini açıyor (gönderilmedi)");
    await page.keyboard.press("Escape");
    const related = await page.locator("[aria-labelledby=ilgili-baslik] a").evaluateAll((links) => links.map((a) => a.getAttribute("href")));
    check(!related.includes(`/blog/${post.slug}`), `C ilgili yazılar yazının kendisini içermiyor (${related.length} bağlantı; canlıda yayımlanmış başka yazı ${published.length - 1})`);
    const detailBroken = await brokenImages(page);
    check(detailBroken.length === 0, "C yazıda kırık görsel yok", detailBroken.join(", "));
    check((await overflow()) <= 0, "C yazı sayfasında yatay taşma yok");
    check(errors.length === 0, "C yazı sayfasında JavaScript hatası yok", errors.join(" | ").slice(0, 160));
    await context.close();
  }

  // B. Ziyaretçinin cihaz teması
  for (const scheme of ["dark", "light"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
    const page = await context.newPage();
    await gotoSettled(page, `${base}/blog`);
    const colors = await page.evaluate(() => ({ page: getComputedStyle(document.querySelector("[data-theme=blog]")).backgroundColor, title: getComputedStyle(document.querySelector("[data-list-reveal] h2")).color, panel: getComputedStyle(document.querySelector("[class*=heroMedia]")).backgroundColor }));
    if (scheme === "dark") check(colors.page === "rgb(15, 15, 16)" && colors.title === "rgb(255, 255, 255)" && colors.panel === "rgb(241, 233, 218)", "B cihaz koyu modda liste koyu, kart başlığı beyaz, panel aynı", JSON.stringify(colors));
    else check(colors.page === "rgb(245, 240, 230)" && colors.panel === "rgb(241, 233, 218)", "B cihaz açık modda liste krem (mevcut tasarım)", JSON.stringify(colors));
    await context.close();
  }
} catch (failure) {
  record("FAIL", "beklenmeyen hata", `${failure.message.split("\n")[0]} ${(failure.message.match(/waiting for (.+)/) ?? [])[1]?.slice(0, 140) ?? ""}`);
} finally {
  await browser.close();
  const summary = results.reduce((acc, item) => ({ ...acc, [item.status]: (acc[item.status] ?? 0) + 1 }), {});
  console.log(`\nÖZET ${JSON.stringify(summary)}`);
  process.exitCode = results.some((item) => item.status === "FAIL") ? 1 : 0;
}
