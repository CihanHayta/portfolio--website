// GERÇEK kullanıcı akışı (Playwright) — TEST Supabase projesine bağlı sunucuda.
//   1) node scripts/supabase/dev-test.mjs          (ayrı terminalde, :3100)
//   2) node tests/e2e/blog-flow.e2e.mjs
// Gerçek giriş, gerçek veritabanı ve depolama; sınırlı gerçek AI (1 Gemini planı,
// 1 Pollinations görseli). Geçici yönetici ve tüm "e2e-" kayıtları sonunda silinir.
// Canlı veritabanına bağlanmaz: hedef proje test projesidir ve sayfada doğrulanır.

import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
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
  page.on("pageerror", (error) => {
    errors.push(`[${currentStep}] ${where(page)}: ${error.message}`);
    shot(page);
  });
  page.on("console", async (message) => {
    if (message.type() !== "error" || /Failed to load resource|401|status of 4\d\d/.test(message.text())) return;
    errors.push(`[${currentStep}] ${where(page)}: ${message.text().slice(0, 1500)}`);
    shot(page);
    if (process.env.E2E_STACKS) {
      const stacks = await Promise.all(message.args().map((arg) => arg.evaluate((value) => value?.stack ?? null).catch(() => null)));
      console.log(`\n[yığın] ${stacks.filter(Boolean).join("\n").slice(0, 4000)}`);
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
  const logo = () => page.getByRole("link", { name: /ana sayfa$/ }).first();

  step("Mobil logo");
  await page.goto(`${base}/blog`, { waitUntil: "networkidle" });
  await logo().tap();
  await page.waitForURL((url) => url.pathname === "/", { timeout: 15_000 });
  check(true, "ziyaretçi logoya dokununca ana sayfaya gider");
  await page.goto(`${base}/blog`, { waitUntil: "networkidle" });
  await logo().dispatchEvent("pointerdown", { pointerType: "touch", isPrimary: true, button: 0 });
  await page.waitForTimeout(800);
  await logo().dispatchEvent("pointerup", { pointerType: "touch", isPrimary: true, button: 0 });
  await page.waitForURL(/\/admin\/login/, { timeout: 15_000 });
  check(true, "logoya uzun basınca yönetici girişi açılır");

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
  // İşaret, panel bileşenleri yerleşince (useEffect) konur; adres ondan önce değişebilir.
  const marked = await page.waitForFunction(() => localStorage.getItem("persona-admin-device") === "1", null, { timeout: 15_000 }).then(() => true, () => false);
  check(marked, "bu telefon yönetici cihazı olarak işaretlendi");
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await logo().tap();
  await page.waitForURL(/\/admin\/blog/, { timeout: 20_000 });
  check(true, "işaretli telefonda logoya dokunmak yönetim paneline götürür");

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
  await page.keyboard.type("Küçük işletmeler reklam bütçesini hedef kitle büyüklüğüne ve dönüşüm maliyetine göre planlamalıdır.");
  await bar.getByRole("button", { name: "Ayarlar" }).click();
  await page.getByRole("tab", { name: "Sayfa Ayarları" }).click();
  await page.getByRole("textbox", { name: "Kalıcı bağlantı" }).fill(`${RUN}-butce`);
  await page.getByLabel("SEO başlığı").fill("E2E SEO başlığı");
  await page.getByLabel("Meta açıklaması").fill("E2E meta açıklaması: reklam bütçesi planlama.");
  await page.getByRole("button", { name: "Ayarları kapat" }).click();
  await page.getByRole("button", { name: "Taslak Kaydet" }).click();
  check(await toast(page, "Taslak kaydedildi."), "taslak kaydedildi bildirimi");
  await page.waitForURL(/\/admin\/blog\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  const postUrl = page.url();
  const postId = postUrl.split("/").pop();
  await page.reload({ waitUntil: "networkidle" });
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

  step("Gerçek AI: görsel planı + Pollinations görseli + ekleme + geri al");
  await bar.getByRole("button", { name: "AI Görselleri" }).click();
  const dialog = page.getByRole("dialog", { name: "AI Görselleri" });
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "Görsel planını hazırla" }).click();
  const firstCard = dialog.locator("li[aria-labelledby^='visual-v']").first();
  const planned = await firstCard.waitFor({ timeout: 70_000 }).then(() => true, () => false);
  check(planned, `gerçek ücretsiz metin servisiyle görsel planı oluştu (beklenen: ${TEXT_LABEL})`);
  let coverInserted = false;
  if (planned) {
    await firstCard.getByRole("radio", { name: "AI ile üret" }).click();
    // Ücretsiz servis anlık olarak düşebilir (ör. HTTP 503): hata anlaşılır olmalı, ücretli
    // servise geçilmemeli; bir kez yeniden denenir. Yine olmazsa akışın geri kalanı sürer.
    const generateOnce = async () => {
      await firstCard.getByRole("button", { name: /Görsel üret|Tekrar oluştur/ }).click();
      const ready = firstCard.getByRole("button", { name: "Bu görseli seç" }).first().waitFor({ timeout: 90_000 }).then(() => "ok");
      const failed = firstCard.getByRole("alert").filter({ hasText: /görsel üretemedi/ }).waitFor({ timeout: 90_000 }).then(() => "error");
      return Promise.any([ready, failed]).catch(() => "timeout");
    };
    let outcome = await generateOnce();
    if (outcome === "error") {
      const message = await firstCard.getByRole("alert").filter({ hasText: /görsel üretemedi/ }).innerText();
      check(/Ücretli bir servise geçilmedi/.test(message), "ücretsiz servis düşünce anlaşılır hata, ücretli servise geçilmedi");
      console.log(`  (dış servis hatası, 20 sn sonra bir kez yeniden deneniyor: ${message.slice(0, 160)})`);
      await page.waitForTimeout(20_000);
      outcome = await generateOnce();
    }
    const generated = outcome === "ok";
    const cardText = await firstCard.innerText();
    check(generated, `gerçek ücretsiz görsel üretildi${generated ? ` (${cardText.match(/Pollinations|Cloudflare|ComfyUI/)?.[0] ?? "?"})` : ` — DIŞ SERVİS: ${outcome}`}`);
    if (!generated) await dialog.getByRole("button", { name: "Görsel stüdyosunu kapat" }).click();
    if (generated) {
      check(/sana|flux|model bildirilmedi/i.test(cardText) && /filigranlı|Apache-2\.0|lisans/i.test(cardText), "aday gerçek model adı ve lisans notuyla");
      await firstCard.getByRole("button", { name: "Bu görseli seç" }).first().click();
      const alt = firstCard.getByLabel(/Alt metin/);
      if (!(await alt.inputValue()).trim()) await alt.fill("Reklam bütçesi planlama görseli");
      const isCover = (await firstCard.getByRole("combobox", { name: "Hedef bölüm" }).inputValue()) === "cover";
      const risk = dialog.getByRole("checkbox", { name: /Bilerek ekliyorum/ });
      if (await risk.count()) await risk.check();
      await dialog.getByRole("button", { name: "Seçili görselleri taslağa ekle" }).click();
      check(await toast(page, /görsel taslağa eklendi/, 40_000), "seçilen görsel medya kütüphanesine yüklenip taslağa eklendi");
      await dialog.getByRole("button", { name: "Görsel stüdyosunu kapat" }).click();
      coverInserted = isCover;
      if (isCover) {
        const coverImg = () => page.getByRole("article", { name: "Yazı tuvali" }).locator("img").first();
        check((await coverImg().count()) > 0, "kapak görseli tuvalde");
        await page.getByRole("button", { name: "Geri al" }).click();
        check((await page.getByRole("article", { name: "Yazı tuvali" }).locator("img").count()) === 0, "Geri al: kapak görseli de geri alındı");
        await page.getByRole("button", { name: "İleri al" }).click();
        check((await coverImg().count()) > 0, "İleri al: kapak geri geldi");
      }
      await page.getByRole("button", { name: "Taslak Kaydet" }).click();
      check(await toast(page, "Taslak kaydedildi."), "görselli taslak kaydedildi");
      await page.reload({ waitUntil: "networkidle" });
      await page.getByRole("textbox", { name: "Yazı başlığı" }).waitFor();
      const [saved] = await sql(ref, `select cover_media_id, content::text like '%"type":"image"%' as has_image_block from public.blog_posts where id = '${postId}'`);
      check(isCover ? Boolean(saved.cover_media_id) : saved.has_image_block, `yenilemeden sonra ${isCover ? "kapak" : "bölüm görseli"} veritabanında korunuyor`);
    }
  } else {
    await dialog.getByRole("button", { name: "Görsel stüdyosunu kapat" }).click();
  }

  step("Yayınlama ve herkese açık sayfa");
  await page.getByRole("button", { name: "Yayınla" }).click();
  check(await toast(page, "Yazı yayında."), "yazı yayınlandı");
  const publicPage = await mobile.newPage();
  const response = await publicPage.goto(`${base}/blog/${RUN}-butce`, { waitUntil: "networkidle" });
  check(response.status() === 200 && (await publicPage.locator("h1").innerText()).includes("E2E Reklam Bütçesi"), "yayındaki yazı herkese açık sayfada görünüyor");
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
  await dpage.evaluate(() => localStorage.setItem("persona-admin-device", "1"));
  await dpage.getByRole("link", { name: /ana sayfa$/ }).first().click();
  await dpage.waitForURL((url) => url.pathname === "/", { timeout: 15_000 });
  check(true, "masaüstünde (işaretli olsa bile) logo ana sayfaya gider");
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
