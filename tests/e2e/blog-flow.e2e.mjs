// GERÇEK kullanıcı akışı (Playwright) — TEST Supabase projesine bağlı sunucuda.
//   1) node scripts/supabase/dev-test.mjs          (ayrı terminalde, :3100)
//   2) node tests/e2e/blog-flow.e2e.mjs
// Gerçek giriş, gerçek veritabanı ve depolama; sınırlı gerçek AI (1 ücretsiz metin
// servisi görsel planı). Otomatik görsel üretimi yok: kapak ChatGPT ile elle üretim
// akışıyla (test dosyası) eklenir. Geçici yönetici ve tüm "e2e-" kayıtları sonunda silinir.
// Canlı veritabanına bağlanmaz: hedef proje test projesidir ve sayfada doğrulanır.

import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { projectKeys, sql } from "../../scripts/supabase/_api.mjs";
import { resolveRef } from "../../scripts/supabase/project.mjs";
import { prepareContext, targetFetch } from "./_target.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3100";
// Görsel planını üretmesi beklenen metin servisi. Preview'da Gemini anahtarı yoktur:
//   E2E_TEXT_SERVICE=text:ovh
const TEXT_SERVICE = process.env.E2E_TEXT_SERVICE ?? "text:gemini";
const TEXT_LABEL = { "text:gemini": "Google Gemini", "text:ovh": "OVHcloud AI Endpoints (anonim)" }[TEXT_SERVICE];
if (!TEXT_LABEL) throw new Error(`Bilinmeyen E2E_TEXT_SERVICE: ${TEXT_SERVICE}`);
const out = process.env.QA_OUT ?? mkdtempSync(join(tmpdir(), "persona-flow-"));
const RUN = `e2e-${Date.now().toString(36)}`;
const ref = resolveRef("test");
let failures = 0;
const check = (ok, label) => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`);
};
let currentStep = "başlangıç";
const step = (label) => {
  currentStep = label;
  console.log(`\n— ${label}`);
};
// Yavaş mobil bağlantı taklidi: sunucuya giden POST istekleri geciktirilir (ms).
const LATENCY_MS = Number(process.env.E2E_LATENCY_MS ?? 0);

const keys = await projectKeys(ref);
const service = createClient(keys.url, keys.serviceRole, { auth: { persistSession: false } });
const email = `${RUN}@example.com`;
const password = randomBytes(18).toString("base64url");
const { data: created, error: createError } = await service.auth.admin.createUser({ email, password, email_confirm: true });
if (createError) throw createError;
const userId = created.user.id;
await service.from("blog_admins").insert({ user_id: userId, display_name: "E2E Test" }).throwOnError();
// Test, panelden bu servisin limitini değiştirir; önceki değer sonunda aynen geri konur.
const { data: priorOverride } = await service.from("ai_limit_overrides").select("*").eq("key", TEXT_SERVICE).maybeSingle();

const browser = await chromium.launch();
const errors = [];
const where = (page) => {
  try {
    return new URL(page.url()).pathname;
  } catch {
    return "?";
  }
};
const shot = (page) => page.screenshot({ path: join(out, `jshata-${Date.now()}.png`) }).catch(() => {});
const watch = (page) => {
  if (process.env.E2E_STACKS) page.addInitScript(() => { Error.stackTraceLimit = 100; });
  page.on("pageerror", (error) => {
    errors.push(`[${currentStep}] ${where(page)}: ${error.message}`);
    shot(page);
    if (process.env.E2E_STACKS) console.log(`\n[yığın] ${String(error.stack).slice(0, 4000)}`);
  });
  page.on("console", async (message) => {
    if (message.type() !== "error" || /Failed to load resource|401|status of 4\d\d/.test(message.text())) return;
    errors.push(`[${currentStep}] ${where(page)}: ${message.text().slice(0, 1500)}`);
    shot(page);
    if (process.env.E2E_STACKS) {
      const stacks = await Promise.all(message.args().map((arg) => arg.evaluate((value) => value?.stack ?? null).catch(() => null)));
      console.log(`\n[yığın] ${stacks.filter(Boolean).join("\n").slice(0, 12000)}`);
    }
  });
  if (LATENCY_MS > 0) {
    page.route("**/*", async (route) => {
      if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
      await route.continue();
    });
  }
};
const toast = (page, text, timeout = 20_000) => page.getByText(text).first().waitFor({ timeout }).then(() => true, () => false);
const field = async (locator) => (await locator.count()) ? locator.inputValue() : null;

try {
  const sourceCheck = await (await targetFetch(base, "/blog")).text();
  check(sourceCheck.includes(ref) || !sourceCheck.includes("supabase.co"), "sunucu test projesine bağlı (canlı veritabanı kullanılmıyor)");

  // ---------------------------------------------------------------- Telefon (390)
  const mobile = await prepareContext(await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), base);
  const page = await mobile.newPage();
  watch(page);
  const logo = () => page.getByRole("link", { name: /yönetim girişi$/ }).first();

  step("Mobil logo → yönetici girişi (tek dokunuş)");
  await page.goto(`${base}/blog`, { waitUntil: "networkidle" });
  check((await logo().getAttribute("href")) === "/admin", "telefonda logo gerçek bir bağlantı: /admin");
  await page.getByRole("button", { name: "Menüyü aç" }).tap();
  check(await page.getByRole("link", { name: "Ana sayfa", exact: true }).isVisible(), "ziyaretçi için mobil menüde 'Ana sayfa' bağlantısı var");
  await page.getByRole("button", { name: "Menüyü kapat" }).tap();
  await logo().tap();
  await page.waitForURL(/\/admin\/login/, { timeout: 15_000 });
  check(true, "giriş yapılmamışken logoya tek dokunuş giriş ekranını açar");

  step("Giriş");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill("yanlis-sifre-123");
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await page.locator('form [role="alert"]').waitFor({ timeout: 20_000 });
  check((await page.locator('form [role="alert"]').innerText()).includes("E-posta ya da şifre hatalı"), "yanlış şifre reddedildi (gerçek Supabase Auth)");
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await page.waitForURL(/\/admin\/blog$/, { timeout: 30_000 });
  check(true, "doğru şifreyle yönetim paneli açıldı");
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await logo().tap();
  await page.waitForURL(/\/admin\/blog/, { timeout: 20_000 });
  check(true, "giriş yapılmışken logoya dokunmak yönetim panelini açar");

  step("Yeni yazı: oluştur, kaydet, yenile");
  await page.getByRole("link", { name: "Yeni Blog Yazısı" }).last().click();
  await page.getByRole("textbox", { name: "Yazı başlığı" }).waitFor({ timeout: 30_000 });
  await page.getByRole("textbox", { name: "Yazı başlığı" }).fill(`E2E Reklam Bütçesi ${RUN}`);
  await page.getByRole("button", { name: "Başlık", exact: true }).click();
  const bar = page.locator("[class*=mobileBar]");
  await bar.getByRole("button", { name: "Ayarlar" }).click();
  await page.getByRole("tab", { name: "Blok Ayarları" }).click();
  await page.getByLabel("Başlık metni").fill("Reklam bütçesi nasıl planlanır");
  await page.getByRole("button", { name: "Ayarları kapat" }).click();
  await bar.getByRole("button", { name: "Bloklar" }).click();
  await page.getByRole("complementary", { name: "Blok kütüphanesi" }).getByRole("button", { name: /^Paragraf/ }).first().click();
  // Blok eklenince kütüphane çekmecesi kendiliğinden kapanır.
  await page.getByRole("button", { name: "Kütüphaneyi kapat" }).click({ timeout: 1_500 }).catch(() => {});
  const paragraph = page.getByRole("textbox", { name: "Paragraf metni" });
  await paragraph.click();
  // Hızlı ve uzun yazım: tek karakter bile kaybolmamalı (editör eşitleme yarışı regresyonu).
  const typed = "Küçük işletmeler reklam bütçesini hedef kitle büyüklüğüne ve dönüşüm maliyetine göre planlamalıdır. ".repeat(4).trim();
  await page.keyboard.type(typed);
  await page.waitForTimeout(300);
  check((await page.getByRole("textbox", { name: "Paragraf metni" }).innerText()).trim() === typed, `hızlı yazımda metin birebir korundu (${typed.length} karakter)`);
  // Araç çubuğu durumu editörden okunur: seçili metin kalın yapılınca düğme basılı görünür.
  await page.keyboard.press("ControlOrMeta+A");
  const boldTool = page.getByRole("button", { name: "Kalın" }).first();
  await boldTool.click();
  check((await boldTool.getAttribute("aria-pressed")) === "true", "metin araç çubuğu: kalın düğmesi seçili metinde etkin");
  await boldTool.click();
  check((await boldTool.getAttribute("aria-pressed")) === "false", "metin araç çubuğu: kalın geri alınınca düğme pasif");
  await bar.getByRole("button", { name: "Ayarlar" }).click();
  await page.getByRole("tab", { name: "Sayfa Ayarları" }).click();
  await page.getByRole("textbox", { name: "Kalıcı bağlantı" }).fill(`${RUN}-butce`);
  await page.getByLabel("SEO başlığı").fill("E2E SEO başlığı");
  await page.getByLabel("Meta açıklaması").fill("E2E meta açıklaması: reklam bütçesi planlama.");
  await page.getByRole("button", { name: "Ayarları kapat" }).click();
  await page.getByRole("button", { name: "Taslak Kaydet" }).click();
  // "Taslak Kaydet": kayıt gerçekten bitince yazı listesine dönülür; yazı listede işaretlidir.
  await page.waitForURL(/\/admin\/blog\?kaydedildi=[0-9a-f-]{36}$/, { timeout: 20_000 });
  const postId = new URL(page.url()).searchParams.get("kaydedildi");
  check(await toast(page, "Taslak kaydedildi."), "taslak kaydedildi bildirimi (listede)");
  check((await page.locator("[data-saved]").first().innerText()).includes(`E2E Reklam Bütçesi ${RUN}`), "kaydedilen taslak listede işaretli");
  await page.goto(`${base}/admin/blog/${postId}`, { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Yazı başlığı" }).waitFor();
  check((await page.getByRole("textbox", { name: "Yazı başlığı" }).inputValue()) === `E2E Reklam Bütçesi ${RUN}`, "yenilemeden sonra başlık veritabanından geldi");
  const canvasText = await page.getByRole("article", { name: "Yazı tuvali" }).innerText();
  check(canvasText.includes("Reklam bütçesi nasıl planlanır") && canvasText.includes("hedef kitle büyüklüğüne"), "başlık bloğu ve paragraf korundu");
  await bar.getByRole("button", { name: "Ayarlar" }).click();
  await page.getByRole("tab", { name: "Sayfa Ayarları" }).click();
  check((await field(page.getByRole("textbox", { name: "Kalıcı bağlantı" }))) === `${RUN}-butce` && (await field(page.getByLabel("SEO başlığı"))) === "E2E SEO başlığı", "slug ve SEO alanları korundu");
  await page.getByRole("button", { name: "Ayarları kapat" }).click();
  const [row] = await sql(ref, `select title, slug, seo_title, status from public.blog_posts where id = '${postId}'`);
  check(row?.slug === `${RUN}-butce` && row.status === "draft", "kayıt test veritabanında doğrulandı (taslak)");

  step("Gerçek AI: görsel planı (metin) + ChatGPT ile elle kapak + geri al");
  // Otomatik görsel üretimi yok (2026-10-30): görsel planı gerçek ücretsiz METİN servisiyle
  // üretilir (uygulamanın kendi API'si, oturum açmış sayfadan); kapak ChatGPT'de elle
  // üretilip yüklenir (ChatGPT otomatikleştirilmez, test dosyası kullanılır).
  const [content] = await sql(ref, `select content from public.blog_posts where id = '${postId}'`);
  const sections = (content?.content?.blocks ?? []).filter((block) => block.type === "heading").map((block) => ({ id: block.id, level: Number(block.props.level) === 3 ? 3 : 2, heading: block.props.text, text: "", words: 0 }));
  const plan = await page.evaluate(async ({ id, sections: list }) => {
    const response = await fetch("/api/admin/ai/visual-plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ opId: crypto.randomUUID(), postId: id, title: document.querySelector("textarea[aria-label='Yazı başlığı'], input[aria-label='Yazı başlığı']")?.value ?? "", sections: list }) });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, { id: postId, sections });
  const planned = plan.status === 200 && (plan.body.plan?.items?.length ?? 0) > 0;
  check(planned, `gerçek ücretsiz metin servisiyle görsel planı oluştu (${plan.body.provider ?? plan.body.error ?? plan.status}; beklenen: ${TEXT_LABEL})`);
  await bar.getByRole("button", { name: "Görseller" }).click();
  const images = page.getByRole("dialog", { name: "Görseller" });
  await images.locator("[data-section=cover]").waitFor({ timeout: 30_000 });
  await images.locator("[data-section=cover]").getByRole("button", { name: /Kapak oluştur \(ChatGPT\)/ }).click();
  const handoff = images.getByTestId("handoff-panel");
  await handoff.waitFor();
  const coverFile = join(out, "kapak.png");
  writeFileSync(coverFile, await sharp({ create: { width: 1200, height: 630, channels: 3, background: { r: 20, g: 20, b: 24 } } }).png().toBuffer());
  await handoff.locator("input[type=file]").setInputFiles(coverFile);
  await handoff.getByLabel("Alt metin (zorunlu)").fill("Reklam bütçesi planlama kapağı");
  await handoff.getByRole("button", { name: /Kabul et ve kapak yap/ }).click();
  await images.getByText("ChatGPT görseli kapak olarak ayarlandı.").waitFor({ timeout: 45_000 });
  await images.getByRole("button", { name: "Bitti" }).click();
  const coverImg = () => page.getByRole("article", { name: "Yazı tuvali" }).locator("img").first();
  check((await coverImg().count()) > 0, "kapak görseli tuvalde");
  await page.getByRole("button", { name: "Geri al" }).click();
  check((await page.getByRole("article", { name: "Yazı tuvali" }).locator("img").count()) === 0, "Geri al: kapak görseli de geri alındı");
  await page.getByRole("button", { name: "İleri al" }).click();
  check((await coverImg().count()) > 0, "İleri al: kapak geri geldi");
  await page.getByRole("button", { name: "Taslak Kaydet" }).click();
  await page.waitForURL(/\/admin\/blog\?kaydedildi=/, { timeout: 20_000 });
  check(await toast(page, "Taslak kaydedildi."), "kapaklı taslak kaydedildi");
  await page.goto(`${base}/admin/blog/${postId}`, { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Yazı başlığı" }).waitFor();
  const [saved] = await sql(ref, `select cover_media_id from public.blog_posts where id = '${postId}'`);
  check(Boolean(saved?.cover_media_id), "yenilemeden sonra kapak veritabanında korunuyor");

  step("Mobil alt çubuk: önizleme, onaylı yayın");
  const actions = page.getByRole("navigation", { name: "Yazı işlemleri" });
  check(await actions.isVisible(), "telefonda alt işlem çubuğu görünüyor");
  const sizes = await actions.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect()).map((rect) => Math.min(rect.width, rect.height)));
  check(sizes.length >= 3 && sizes.every((size) => size >= 44), `alt çubuk dokunma hedefleri ≥44 px (${sizes.map(Math.round).join(", ")})`);
  const status = await page.locator("header [role=status], header [role=alert]").first();
  check(await status.evaluate((node) => node.scrollWidth <= node.clientWidth + 1 && node.innerText.trim().length > 6), `kayıt durumu okunur: "${(await status.innerText()).trim()}"`);
  await actions.getByRole("button", { name: "Önizle" }).click();
  check(await page.getByRole("heading", { level: 1 }).filter({ hasText: "E2E Reklam Bütçesi" }).first().isVisible(), "önizleme yazıyı gösteriyor");
  await actions.getByRole("button", { name: "Düzenle" }).click();
  await actions.getByRole("button", { name: "Yayınla" }).click();
  const confirmPublish = page.getByRole("dialog", { name: "Yazı yayınlansın mı?" });
  check(await confirmPublish.isVisible(), "yayından önce kısa onay soruldu (adres gösteriliyor)");
  // Kaynakça zorunlu: kaynak yokken yayın düğmesi pasif; açık beyanla açılır.
  check(await confirmPublish.getByRole("button", { name: "Yayınla" }).isDisabled(), "kaynakça yokken yayınlanamıyor (düğme pasif)");
  check((await confirmPublish.innerText()).includes("Kaynakça eksik"), "onay penceresi kaynakçanın eksik olduğunu söylüyor");
  await confirmPublish.getByRole("switch", { name: /kendi deneyimime dayanıyor/ }).check();
  // Çift dokunma: yalnızca bir yayın isteği gider, hata bildirimi çıkmaz.
  await confirmPublish.getByRole("button", { name: "Yayınla" }).dblclick();
  check(await toast(page, "Yazı yayında."), "yazı yayınlandı");
  check(!(await page.getByText(/başka bir sekmede|beklenmeyen/).first().isVisible().catch(() => false)), "onaya çift dokunma hata ya da çift yayın üretmedi");
  const publicPage = await mobile.newPage();
  const response = await publicPage.goto(`${base}/blog/${RUN}-butce`, { waitUntil: "networkidle" });
  check(response.status() === 200 && (await publicPage.locator("h1").innerText()).includes("E2E Reklam Bütçesi"), "yayındaki yazı herkese açık sayfada görünüyor");
  const [published] = await sql(ref, `select content->'meta'->>'sourcesWaived' as waived from public.blog_posts where id = '${postId}'`);
  check(published?.waived === "true", "beyan (kendi deneyimim) yazıyla birlikte kaydedildi");
  check(await publicPage.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, "herkese açık yazı sayfasında taşma yok");
  await publicPage.close();

  step("İkinci yazı ve slug çakışması");
  await page.goto(`${base}/admin/blog/new`, { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Yazı başlığı" }).fill(`E2E ikinci yazı ${RUN}`);
  await bar.getByRole("button", { name: "Ayarlar" }).click();
  await page.getByRole("tab", { name: "Sayfa Ayarları" }).click();
  await page.getByRole("textbox", { name: "Kalıcı bağlantı" }).fill(`${RUN}-butce`);
  await page.getByRole("button", { name: "Ayarları kapat" }).click();
  await page.getByRole("button", { name: "Taslak Kaydet" }).click();
  check(await toast(page, "Bu kalıcı bağlantı başka bir kayıtta kullanılıyor."), "slug çakışması anlaşılır hata verdi (başarı bildirimi yok)");
  check(!(await page.getByText("Taslak kaydedildi.").isVisible()), "çakışmada yanlış başarı bildirimi gösterilmedi");
  await bar.getByRole("button", { name: "Ayarlar" }).click();
  await page.getByRole("tab", { name: "Sayfa Ayarları" }).click();
  await page.getByRole("textbox", { name: "Kalıcı bağlantı" }).fill(`${RUN}-ikinci`);
  await page.getByRole("button", { name: "Ayarları kapat" }).click();
  await page.getByRole("button", { name: /Yeniden dene|Taslak Kaydet/ }).first().click();
  check(await toast(page, /Taslak kaydedildi\.|Değişiklikler kaydedildi\./), "slug düzeltilince ikinci yazı kaydedildi");
  await page.goto(`${base}/admin/blog`, { waitUntil: "networkidle" });
  const list = await page.locator("main").innerText();
  check(list.includes(`E2E Reklam Bütçesi ${RUN}`) && list.includes(`E2E ikinci yazı ${RUN}`), "yazı listesinde iki yazı da var");

  step("AI Servisleri: kalıcı sayaçlar ve limit düzenleme");
  await page.goto(`${base}/admin/blog/ai-servisleri`, { waitUntil: "networkidle" });
  const panel = await page.locator("main").innerText();
  check(/Depo: supabase/.test(panel), "kalıcı depo: supabase (test projesi)");
  const gemini = page.locator("li").filter({ has: page.getByRole("heading", { name: TEXT_LABEL, exact: true }) });
  const geminiText = await gemini.innerText();
  check(/İstek \(uygulama sayacı\)\n[1-9]/.test(geminiText), `${TEXT_LABEL} istek sayacı veritabanından geldi (>0)`);
  await gemini.getByText("Limitleri düzenle").click();
  await gemini.getByRole("spinbutton", { name: /Günlük istek/ }).fill("299");
  await gemini.getByRole("button", { name: "Limitleri kaydet" }).click();
  check(await gemini.getByText(/Kaydedildi/).waitFor({ timeout: 15_000 }).then(() => true, () => false), "limit kaydedildi");
  await page.reload({ waitUntil: "networkidle" });
  check((await page.locator("li").filter({ has: page.getByRole("heading", { name: TEXT_LABEL, exact: true }) }).innerText()).includes("/ 299"), "limit değişikliği yenilemeden sonra korunuyor (kalıcı)");
  check(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, "AI Servisleri ekranında taşma yok");

  step("Çıkış");
  await page.goto(`${base}/admin/blog`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Çıkış yap" }).click();
  await page.waitForURL(/\/admin\/login/, { timeout: 20_000 });
  await page.goto(`${base}/admin/blog/new`);
  check(/\/admin\/login/.test(page.url()), "çıkıştan sonra yönetim sayfaları giriş ekranına döner");
  await mobile.close();

  // ---------------------------------------------------------------- Masaüstü (1440)
  step("Masaüstü: logo davranışı değişmedi");
  const desktop = await prepareContext(await browser.newContext({ viewport: { width: 1440, height: 900 } }), base);
  const dpage = await desktop.newPage();
  watch(dpage);
  await dpage.goto(`${base}/blog`, { waitUntil: "networkidle" });
  check((await dpage.getByRole("link", { name: /ana sayfa$/ }).first().getAttribute("href")) === "/", "masaüstünde logo ana sayfa bağlantısı");
  await dpage.getByRole("link", { name: /ana sayfa$/ }).first().click();
  await dpage.waitForURL((url) => url.pathname === "/", { timeout: 15_000 });
  check(true, "masaüstünde logo ana sayfaya gider (değişmedi)");
  await desktop.close();
  check(errors.length === 0, `JS hatası yok ${errors.join(" | ").slice(0, 900)}`);
} catch (error) {
  failures++;
  const waiting = (error.message.match(/waiting for (.+)/) ?? [])[1] ?? "";
  console.log(`  FAIL beklenmeyen hata: ${error.message.split("\n")[0]} ${waiting ? `→ ${waiting.slice(0, 160)}` : ""}`);
  for (const context of browser.contexts()) for (const open of context.pages()) await open.screenshot({ path: join(out, `hata-${Date.now()}.png`) }).catch(() => {});
} finally {
  await browser.close();
  // Temizlik: test verisi (yazılar, medya, depolama, limit, kullanıcı) silinir ve doğrulanır.
  const posts = (await service.from("blog_posts").select("id").like("slug", `${RUN}%`)).data ?? [];
  if (posts.length) await service.from("blog_posts").delete().in("id", posts.map((post) => post.id));
  const media = (await service.from("blog_media").select("id, storage_path").eq("created_by", userId)).data ?? [];
  if (media.length) {
    await service.from("blog_media").delete().in("id", media.map((item) => item.id));
    await service.storage.from("blog-media").remove(media.map((item) => item.storage_path));
  }
  if (priorOverride) await service.from("ai_limit_overrides").upsert(priorOverride);
  else await service.from("ai_limit_overrides").delete().eq("key", TEXT_SERVICE);
  await service.auth.admin.deleteUser(userId);
  const [left] = await sql(ref, `select (select count(*) from public.blog_posts where slug like '${RUN}%') posts, (select count(*) from auth.users where email = '${email}') users, (select count(*) from public.blog_media where created_by = '${userId}') media`);
  const clean = Object.values(left).every((count) => Number(count) === 0);
  console.log(`\ntemizlik: ${clean ? "tamam (test verisi kalmadı)" : `EKSİK ${JSON.stringify(left)}`} · ekran görüntüleri: ${out}`);
  if (!clean) failures++;
  console.log(failures ? `\n${failures} kontrol başarısız` : "\nTÜM KONTROLLER GEÇTİ");
  process.exitCode = failures ? 1 : 0;
}
