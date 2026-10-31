// Herkese açık yazı sayfası — GERÇEK sunucu ve test veritabanı (:3100).
//   node scripts/supabase/dev-test.mjs   (ayrı terminalde)
//   node tests/e2e/public-article.e2e.mjs
// Test verisi: geçici yayımlanmış yazılar (RUN etiketi), sonunda silinir.
// Ölçülenler: okuma çubuğu (0 / ~0,5 / 1, footer hariç, CLS), İçindekiler (numara,
// aktif başlık, ofset, daraltma, benzersiz kimlik, mobil), kaynakça ve [n] atıfları,
// konular, yazar, kapanış + ilgili hizmetler, SSS düzeni, ilgili yazılar, koyu tema
// kontrastı, vurgu işareti, 360–1440 px taşma, konsol hataları.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { projectKeys } from "../../scripts/supabase/_api.mjs";
import { resolveRef } from "../../scripts/supabase/project.mjs";
import { prepareContext } from "./_target.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const out = process.env.QA_OUT ?? mkdtempSync(join(tmpdir(), "persona-article-"));
const WIDTHS = (process.env.ONLY ?? "360,390,430,768,1440").split(",").map(Number);
const RUN = `e2e-art-${Date.now().toString(36)}`;
let failures = 0;
const check = (ok, label) => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`);
};

const keys = await projectKeys(resolveRef("test"));
const service = createClient(keys.url, keys.serviceRole, { auth: { persistSession: false } });
const before = (await service.from("blog_posts").select("id", { count: "exact", head: true })).count;
const { data: category } = await service.from("blog_categories").select("id, name, slug").order("position").limit(1).single().throwOnError();

const para = (text, marks) => ({ type: "paragraph", content: [{ type: "text", text, ...(marks ? { marks } : {}) }] });
const text = (id, nodes) => ({ id, type: "text", props: { doc: { type: "doc", content: nodes } } });
const heading = (id, value, level = "2") => ({ id, type: "heading", props: { text: value, level, href: "", align: "left" } });
const LONG = "Reklam bütçesi hedefe, dönüşüm maliyetine ve test süresine göre planlanır. ".repeat(9);

function articleBlocks() {
  const blocks = [text("aintro001", [para(`Giriş. ${LONG}`), { type: "paragraph", content: [{ type: "text", text: "Test bütçesi iki hafta sürer [1]. " }, { type: "text", text: "En önemli kural", marks: [{ type: "accent" }] }, { type: "text", text: " ölçmeden artırmamaktır [2]. " }, { type: "text", text: "Kalın ifade", marks: [{ type: "bold" }] }, { type: "text", text: " ve olmayan atıf [9]." }] }])];
  for (let n = 1; n <= 10; n += 1) {
    blocks.push(heading(`ah${String(n).padStart(7, "0")}`, n === 7 ? "Sonuç" : `Bölüm ${n}: bütçe adımı`));
    blocks.push(text(`at${String(n).padStart(7, "0")}`, [para(`${n}. bölüm metni. ${LONG}`)]));
    if (n === 2) {
      blocks.push(heading("ah2sub001", "Alt başlık A", "3"));
      blocks.push(text("at2sub001", [para(LONG), { type: "bulletList", content: [{ type: "listItem", content: [para("Birinci madde")] }, { type: "listItem", content: [para("İkinci madde")] }] }]));
    }
  }
  blocks.push(heading("ahdup0001", "Sonuç"));
  blocks.push(text("atdup0001", [para(LONG)]));
  blocks.push({ id: "afaq00001", type: "faq", props: { title: "Sık sorulan sorular", schema: false, items: [{ id: "fq1aaaaaa", question: "Test bütçesi ne kadar sürmeli?", answer: "Genellikle iki hafta yeterlidir." }, { id: "fq2aaaaaa", question: "Bütçeyi ne zaman artırmalıyım?", answer: "Dönüşüm takibi kurulduktan sonra." }] } });
  return blocks;
}

const SOURCES = [
  { id: "k1", url: "https://kaynak.example.com/blog/meta-butce", title: "Meta Ads Budget Guide", siteName: "Kaynak Blog", sectionUrl: "https://kaynak.example.com/blog/", sectionLabel: "Blog", kind: "source" },
  { id: "k2", url: "https://arastirma.example.org/rapor-2026", title: "Dijital Reklam Raporu 2026", siteName: "Araştırma Enstitüsü", kind: "user" },
];
const posts = [];
async function makePost(slug, meta, extra = {}) {
  const content = { type: "blocks", version: 1, blocks: articleBlocks(), meta };
  const { data } = await service
    .from("blog_posts")
    .insert({ title: `Meta reklam bütçesi ${slug}`, slug, excerpt: "Bütçe planlama rehberi", content, content_text: LONG, reading_minutes: 6, status: "published", published_at: new Date(Date.now() - 3_600_000).toISOString(), category_id: category.id, author_name: "Cihan Hayta", ...extra })
    .select("id, slug")
    .single()
    .throwOnError();
  posts.push(data.id);
  return data;
}
const light = await makePost(`${RUN}-acik`, { theme: "light", sources: SOURCES });
const dark = await makePost(`${RUN}-koyu`, { theme: "dark", sources: SOURCES });
const waived = await makePost(`${RUN}-beyan`, { sourcesWaived: true });
const { data: tag } = await service.from("blog_tags").insert({ name: `e2e etiket ${RUN.slice(-4)}`, slug: `${RUN}-etiket` }).select("id, name").single().throwOnError();
await service.from("blog_post_tags").insert({ post_id: light.id, tag_id: tag.id }).throwOnError();

const browser = await chromium.launch();
try {
  for (const w of WIDTHS) {
    const h = w < 1024 ? 844 : 900;
    const mobile = w < 1024;
    console.log(`\n=== ${w}x${h}`);
    const context = await prepareContext(await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile }), base);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    const response = await page.goto(`${base}/blog/${light.slug}`, { waitUntil: "networkidle" });
    check(response.status() === 200, "yazı sayfası açıldı");
    const progress = () => page.evaluate(() => Number(document.querySelector("[data-reading-progress]")?.dataset.progress ?? "-1"));
    const scrollTo = async (y) => {
      await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
      await page.waitForTimeout(250);
    };

    // 1) Okuma çubuğu
    const bar = await page.evaluate(() => {
      const el = document.querySelector("[data-reading-progress]");
      const style = getComputedStyle(el);
      return { position: style.position, height: el.getBoundingClientRect().height, top: el.getBoundingClientRect().top, header: document.querySelector("header").getBoundingClientRect().bottom };
    });
    check(bar.position === "fixed" && Math.round(bar.height) === 3 && Math.abs(bar.top - bar.header) <= 1, `çubuk header'ın hemen altında, sabit, 3 px (üst ${Math.round(bar.top)} / header ${Math.round(bar.header)})`);
    check((await progress()) <= 0.02, `başta ≈0 (${await progress()})`);
    const body = await page.evaluate(() => {
      const el = document.querySelector("[data-article-body]");
      const rect = el.getBoundingClientRect();
      return { top: rect.top + scrollY, height: rect.height };
    });
    const offset = bar.header + 3;
    const total = body.height - (h - offset);
    await scrollTo(body.top - offset + total / 2);
    const mid = await progress();
    check(Math.abs(mid - 0.5) <= 0.06, `makalenin yarısında ≈0,5 (${mid})`);
    await scrollTo(body.top - offset + total);
    check((await progress()) >= 0.99, `makale sonunda %100 (${await progress()})`);
    await scrollTo(999_999);
    check((await progress()) === 1, "footer'a inilince %100'de kalıyor (footer hesabı bozmuyor)");
    await scrollTo(body.top - offset + total / 4);
    check((await progress()) < mid, "yukarı kaydırınca azalıyor");

    // 2) İçindekiler
    const ids = await page.evaluate(() => [...document.querySelectorAll("[data-article-body] h2[id], [data-article-body] h3[id]")].map((el) => el.id));
    check(new Set(ids).size === ids.length && ids.includes("sonuc") && ids.includes("sonuc-2"), "aynı metinli başlıklara benzersiz kimlik (sonuc, sonuc-2)");
    if (!mobile) {
      const toc = page.getByRole("navigation", { name: "İçindekiler" });
      const numbers = await toc.locator("li:not([data-sub]) [class*=number]").allInnerTexts();
      check(numbers[0] === "01" && numbers[1] === "02", `H2'ler 01, 02 … numaralı (${numbers.slice(0, 3).join(", ")})`);
      check((await toc.locator("li[data-sub]").count()) >= 1, "H3 girintili alt satır");
      const more = toc.getByRole("button", { name: /Tümünü göster/ });
      check((await more.count()) === 1 && (await toc.locator("li").count()) === 8, "uzun liste 8 öğeye daraltılmış (Tümünü göster)");
      await more.click();
      check((await toc.locator("li").count()) === ids.length, "Tümünü göster ile bütün başlıklar");
      const target = ids[3];
      await toc.locator(`a[href="#${target}"]`).click();
      await page.waitForTimeout(900);
      const placed = await page.evaluate((id) => document.getElementById(id).getBoundingClientRect().top, target);
      check(placed >= offset - 1 && placed <= offset + 60, `tıklanan başlık header + çubuğun hemen altında (${Math.round(placed)} ≥ ${Math.round(offset)})`);
      check(page.url().endsWith(`#${target}`), "adres #kimlik ile güncellendi");
      await page.waitForTimeout(300);
      check((await toc.locator(`a[href="#${target}"]`).getAttribute("aria-current")) === "location", "okunan bölüm İçindekiler'de işaretli (aria-current)");
      const activeColor = await toc.locator(`a[href="#${target}"]`).evaluate((a) => getComputedStyle(a).color);
      const idleColor = await toc.locator(`a[href="#${ids[0]}"]`).evaluate((a) => getComputedStyle(a).color);
      check(activeColor !== idleColor, "aktif başlık farklı renkte (vurgu)");
    } else {
      const details = page.locator("details").filter({ hasText: "İçindekiler" }).first();
      check(!(await details.evaluate((el) => el.open)), "telefonda İçindekiler kapalı başlıyor");
      await scrollTo(0);
      await details.locator("summary").tap();
      const link = details.locator(`a[href="#${ids[2]}"]`);
      await link.tap();
      await page.waitForTimeout(900);
      const placed = await page.evaluate((id) => document.getElementById(id).getBoundingClientRect().top, ids[2]);
      check(placed >= offset - 1 && placed <= offset + 60, `telefonda tıklanan başlık header'ın altında görünür (${Math.round(placed)})`);
      check(!(await details.evaluate((el) => el.open)), "seçimden sonra liste kapandı (ekranı kaplamıyor)");
    }

    // 3) Kaynakça ve atıflar
    const sources = page.getByRole("region", { name: "Yazıda kullanılan kaynaklar" });
    check((await sources.locator("ol > li").count()) === 2, "kaynakça numaralı 2 kaynak");
    const firstLink = sources.locator("#kaynak-1 a").first();
    check((await firstLink.getAttribute("href")) === SOURCES[0].url && (await firstLink.getAttribute("rel")) === "noopener noreferrer" && (await firstLink.getAttribute("target")) === "_blank", "kaynak bağlantısı gerçek adres, yeni sekme, güvenli rel");
    check((await sources.locator('a[href="https://kaynak.example.com/blog/"]').count()) === 1, "kaynağın blog bölümü (kayıtlı ise) ayrı bağlantı");
    check((await page.locator('[data-article-body] sup a[href="#kaynak-1"]').count()) === 1 && (await page.locator('[data-article-body] sup a[href="#kaynak-2"]').count()) === 1, "metindeki [1] ve [2] kaynakçaya bağlandı");
    check((await page.locator('[data-article-body] a[href="#kaynak-9"]').count()) === 0 && (await page.locator("[data-article-body]").innerText()).includes("[9]"), "karşılığı olmayan [9] bağlantı olmadı");

    // 4) Vurgu ve kalın
    const emph = await page.evaluate(() => {
      const mark = document.querySelector("[data-article-body] mark[data-accent]");
      const strong = document.querySelector("[data-article-body] strong");
      const h2 = document.querySelector("[data-article-body] h2");
      return { mark: Boolean(mark), markBg: mark && getComputedStyle(mark).backgroundImage, strong: strong && getComputedStyle(strong).color, heading: getComputedStyle(h2).color };
    });
    check(emph.mark && /gradient/.test(emph.markBg), "seçici vurgu (mark) hafif alt zeminle çiziliyor");
    check(emph.strong === emph.heading, "kalın metin otomatik turuncu değil (başlık rengi)");

    // 5) Konular, yazar, kapanış, ilgili hizmetler
    const topics = page.getByLabel("Konular");
    check((await topics.getByRole("link", { name: category.name }).getAttribute("href")) === `/blog?kategori=${category.slug}`, "kategori gerçek liste sayfasına bağlı");
    check((await topics.getByText(`#${tag.name}`).count()) === 1 && (await topics.getByRole("link", { name: `#${tag.name}` }).count()) === 0, "etiket gösteriliyor (sayfası olmadığı için bağlantısız)");
    const author = page.getByRole("region", { name: "Cihan Hayta" });
    check((await author.count()) === 1 && (await author.locator("img").count()) === 1, "yazar kutusu (gerçek ad + avatar)");
    const closing = page.getByRole("complementary", { name: "Dijital Pazarlama İçin Ücretsiz Ön Görüşme" });
    check((await closing.count()) === 1, "kapanış: 'Dijital Pazarlama İçin Ücretsiz Ön Görüşme'");
    const serviceLinks = await closing.locator("ul a").evaluateAll((links) => links.map((a) => a.getAttribute("href")));
    check(serviceLinks.length >= 1 && serviceLinks.length <= 2 && serviceLinks.every((href) => href === "/#hizmetler"), `ilgili hizmetler (en fazla 2) gerçek hizmetler bölümüne bağlı (${serviceLinks.length})`);
    await closing.getByRole("button", { name: "Benimle iletişime geç" }).click();
    check(await page.getByRole("dialog").filter({ hasText: /Görüşme/ }).first().isVisible(), "'Benimle iletişime geç' sitenin iletişim penceresini açıyor");
    await page.keyboard.press("Escape");

    // 6) SSS düzeni
    const faq = page.locator("[data-type=faq]");
    const layout = await faq.evaluate((el) => {
      const head = el.querySelector("[class*=faqHead]").getBoundingClientRect();
      const list = el.querySelector("[class*=faqList]").getBoundingClientRect();
      return { side: list.left > head.right - 1, below: list.top >= head.bottom - 1 };
    });
    // Blok alanı ≥640 px ise iki sütun (tablet/masaüstü), daha darsa dikey (telefon).
    check(w >= 700 ? layout.side : layout.below, w >= 700 ? "SSS geniş alanda iki sütun (başlık solda)" : "SSS telefonda dikey");
    check((await faq.locator("summary [class*=faqNumber]").first().innerText()) === "01", "SSS soruları numaralı");

    // 7) İlgili yazılar
    const related = page.getByRole("region", { name: `${category.name} Üzerine Diğer Yazılar` });
    if (await related.count()) {
      const hrefs = await related.locator("a").evaluateAll((links) => links.map((a) => a.getAttribute("href")));
      check(!hrefs.includes(`/blog/${light.slug}`), "ilgili yazılarda yazının kendisi yok");
      const cols = await related.locator("article").evaluateAll((cards) => new Set(cards.slice(0, 3).map((card) => Math.round(card.getBoundingClientRect().top))).size);
      check(w >= 1024 ? cols === 1 : true, "masaüstünde ilgili yazılar tek satırda (3 sütun)");
    } else check(false, "ilgili yazılar bölümü bulunamadı");

    check(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, "yatay taşma yok");
    const cls = await page.evaluate(() => window.__cls);
    check(cls < 0.05, `düzen kayması (CLS) düşük (${cls.toFixed(3)})`);
    await page.screenshot({ path: join(out, `acik-${w}.png`), fullPage: false });

    // 8) Koyu tema yazısı
    await page.goto(`${base}/blog/${dark.slug}`, { waitUntil: "networkidle" });
    const darkInfo = await page.evaluate(() => {
      const css = (el, prop) => getComputedStyle(el)[prop];
      const page = css(document.querySelector("[data-theme=blog]"), "backgroundColor");
      return {
        page,
        body: css(document.querySelector("[data-article-body] p"), "color"),
        h1: css(document.querySelector("h1"), "color"),
        link: css(document.querySelector("[id=kaynak-1] a"), "color"),
        eyebrow: css(document.querySelector("[aria-labelledby=kaynaklar-baslik] p"), "color"),
        closingTitle: css(document.querySelector("#kapanis-baslik"), "color"),
        bar: css(document.querySelector("[data-reading-progress] span"), "backgroundColor"),
      };
    });
    const lum = (rgb) => {
      const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
      return (x + 0.05) / (y + 0.05);
    };
    check(lum(darkInfo.page) < 0.02, `koyu tema: siyah/antrasit zemin (${darkInfo.page})`);
    check(darkInfo.h1 === "rgb(255, 255, 255)", "koyu tema: H1 beyaz");
    for (const [name, value, min] of [["gövde", darkInfo.body, 4.5], ["kaynak bağlantısı", darkInfo.link, 4.5], ["turuncu üst etiket", darkInfo.eyebrow, 4.5], ["kapanış başlığı", darkInfo.closingTitle, 7]]) {
      check(ratio(value, darkInfo.page) >= min, `koyu tema kontrastı: ${name} ≥${min} (${ratio(value, darkInfo.page).toFixed(1)})`);
    }
    check(/224, 144, 47/.test(darkInfo.bar), "okuma çubuğu dolgusu turuncu");
    check(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, "koyu temada yatay taşma yok");
    await page.screenshot({ path: join(out, `koyu-${w}.png`), fullPage: false });

    // 9) Beyanlı yazı
    await page.goto(`${base}/blog/${waived.slug}`, { waitUntil: "networkidle" });
    check(await page.getByText("Bu yazı yazarın kendi deneyim ve gözlemlerine dayanır").isVisible(), "kaynaksız (beyanlı) yazıda editör notu");
    check((await page.getByRole("region", { name: "Yazıda kullanılan kaynaklar" }).count()) === 0, "beyanlı yazıda sahte kaynakça yok");
    check(errors.length === 0, `konsol/JS hatası yok ${errors.join(" | ").slice(0, 200)}`);
    await context.close();
  }

  // Hareket azaltma: çubuk yine doğru, içerik hareket etmeden okunur.
  const reduced = await prepareContext(await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" }), base);
  const rp = await reduced.newPage();
  await rp.goto(`${base}/blog/${light.slug}`, { waitUntil: "networkidle" });
  await rp.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await rp.waitForTimeout(300);
  check(Number(await rp.evaluate(() => document.querySelector("[data-reading-progress]").dataset.progress)) === 1, "hareket azaltmada okuma çubuğu çalışıyor");
  await reduced.close();
} catch (failure) {
  failures++;
  console.log(`  FAIL beklenmeyen hata: ${failure.message.split("\n")[0]} ${(failure.message.match(/waiting for (.+)/) ?? [])[1]?.slice(0, 160) ?? ""}`);
} finally {
  await browser.close();
  await service.from("blog_post_tags").delete().in("post_id", posts);
  await service.from("blog_tags").delete().eq("id", tag.id);
  await service.from("blog_posts").delete().in("id", posts);
  const after = (await service.from("blog_posts").select("id", { count: "exact", head: true })).count;
  console.log(`\ntemizlik: ${after === before ? "tamam" : "EKSİK"} (yazı ${before}→${after}) · ekran görüntüleri: ${out}`);
  if (after !== before) failures++;
  console.log(failures ? `\n${failures} kontrol başarısız` : "\nTÜM KONTROLLER GEÇTİ");
  process.exitCode = failures ? 1 : 0;
}
