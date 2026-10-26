// CANLI yönetici akışı (Playwright, telefon 390 px) — personadijitalpazarlama.com.
//   E2E_ALLOW_PRODUCTION=1 node tests/e2e/live-admin.e2e.mjs
// Yalnızca izole kayıtlar: geçici yönetici (e2e-…@example.com) ve "e2e-…" slug'lı tek yazı.
// - Yazı kısa süre yayınlanır, herkese açık sayfası doğrulanır, ARAYÜZDEN yayından
//   kaldırılır (önbellek tazelenir) ve 404 döndüğü doğrulanır; sonra silinir.
// - Gerçek AI: yalnızca 1 görsel planı (ücretsiz metin servisi). Görsel üretilmez.
// - Canlı limit ayarlarına dokunulmaz. Başta ve sonda kayıt sayıları karşılaştırılır.
// Kimlik bilgileri Supabase CLI oturumuyla Yönetim API'sinden yalnızca belleğe alınır.

import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { linkedProject, projectKeys, sql } from "../../scripts/supabase/_api.mjs";

const base = process.env.BASE_URL ?? "https://personadijitalpazarlama.com";
if (process.env.E2E_ALLOW_PRODUCTION !== "1") throw new Error("Canlı test için E2E_ALLOW_PRODUCTION=1 gerekli.");
const out = mkdtempSync(join(tmpdir(), "persona-live-"));
const RUN = `e2e-${Date.now().toString(36)}`;
const ref = linkedProject().ref;
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
const counts = async () =>
  (await sql(ref, `select (select count(*) from public.blog_posts) posts, (select count(*) from public.blog_posts where status = 'published') published,
    (select count(*) from public.blog_media) media, (select count(*) from public.blog_admins) admins, (select count(*) from auth.users) users,
    (select count(*) from public.ai_limit_overrides) overrides, (select coalesce(json_agg(o order by key), '[]') from public.ai_limit_overrides o) override_rows`))[0];
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const usage = async () => (await sql(ref, `select coalesce(sum(requests), 0) requests from public.ai_usage_counters where key like 'text:%' and day = '${today}'`))[0].requests;

const before = await counts();
const usageBefore = Number(await usage());
const keys = await projectKeys(ref);
const service = createClient(keys.url, keys.serviceRole, { auth: { persistSession: false } });
const email = `${RUN}@example.com`;
const password = randomBytes(18).toString("base64url");
const { data: created, error: createError } = await service.auth.admin.createUser({ email, password, email_confirm: true });
if (createError) throw createError;
const userId = created.user.id;
await service.from("blog_admins").insert({ user_id: userId, display_name: "E2E Canlı Test" }).throwOnError();

const browser = await chromium.launch();
const errors = [];
const toast = (page, text, timeout = 25_000) => page.getByText(text).first().waitFor({ timeout }).then(() => true, () => false);

try {
  const html = await (await fetch(`${base}/blog`)).text();
  check(html.includes(ref), "canlı site canlı veritabanına bağlı (beklenen proje)");

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`[${currentStep}] ${error.message}`));
  page.on("console", (message) => message.type() === "error" && !/Failed to load resource|401|status of 4\d\d/.test(message.text()) && errors.push(`[${currentStep}] ${message.text().slice(0, 300)}`));

  step("Mobil logo → giriş");
  await page.goto(`${base}/blog`, { waitUntil: "networkidle" });
  const logo = page.getByRole("link", { name: /ana sayfa$/ }).first();
  await logo.tap();
  const byTap = await page.waitForURL(/\/admin/, { timeout: 8_000 }).then(() => true, () => false);
  if (!byTap) {
    await page.goto(`${base}/blog`, { waitUntil: "networkidle" });
    await logo.dispatchEvent("pointerdown", { pointerType: "touch", isPrimary: true, button: 0 });
    await page.waitForTimeout(800);
    await logo.dispatchEvent("pointerup", { pointerType: "touch", isPrimary: true, button: 0 });
    await page.waitForURL(/\/admin\/login/, { timeout: 15_000 });
  }
  check(/\/admin\/login/.test(page.url()), `logodan giriş ekranı açıldı (${byTap ? "tek dokunuş" : "uzun basma"})`);

  step("Giriş");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill("yanlis-sifre-123");
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  check(await page.locator('form [role="alert"]').waitFor({ timeout: 20_000 }).then(async () => (await page.locator('form [role="alert"]').innerText()).includes("E-posta ya da şifre hatalı"), () => false), "yanlış şifre reddedildi");
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await page.waitForURL(/\/admin\/blog$/, { timeout: 30_000 });
  check(true, "doğru şifreyle yönetim paneli açıldı");

  step("Yazı: oluştur, kaydet, yenile, düzenle");
  await page.goto(`${base}/admin/blog/new`, { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Yazı başlığı" }).fill(`E2E canlı test ${RUN}`);
  const bar = page.locator("[class*=mobileBar]");
  await bar.getByRole("button", { name: "Bloklar" }).click();
  await page.getByRole("complementary", { name: "Blok kütüphanesi" }).getByRole("button", { name: /^Paragraf/ }).first().click();
  await page.getByRole("button", { name: "Kütüphaneyi kapat" }).click({ timeout: 1_500 }).catch(() => {});
  await page.getByRole("textbox", { name: "Paragraf metni" }).click();
  await page.keyboard.type("Bu yazı otomatik canlı ortam testidir ve birkaç saniye içinde silinir.");
  await bar.getByRole("button", { name: "Ayarlar" }).click();
  await page.getByRole("tab", { name: "Sayfa Ayarları" }).click();
  await page.getByRole("textbox", { name: "Kalıcı bağlantı" }).fill(RUN);
  await page.getByLabel("SEO başlığı").fill("E2E canlı SEO");
  await page.getByRole("button", { name: "Ayarları kapat" }).click();
  await page.getByRole("button", { name: "Taslak Kaydet" }).click();
  check(await toast(page, "Taslak kaydedildi."), "taslak kaydedildi");
  await page.waitForURL(/\/admin\/blog\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  const postId = page.url().split("/").pop();
  await page.reload({ waitUntil: "networkidle" });
  const titleBox = page.getByRole("textbox", { name: "Yazı başlığı" });
  await titleBox.waitFor();
  check((await titleBox.inputValue()) === `E2E canlı test ${RUN}`, "yenilemeden sonra taslak canlı veritabanından yüklendi");
  await titleBox.fill(`E2E canlı test düzenlendi ${RUN}`);
  await page.getByRole("button", { name: /Taslak Kaydet|Kaydet/ }).first().click();
  check(await toast(page, /kaydedildi/), "düzenleme kaydedildi");
  const [row] = await sql(ref, `select title, slug, seo_title, status from public.blog_posts where id = '${postId}'`);
  check(row?.title === `E2E canlı test düzenlendi ${RUN}` && row.slug === RUN && row.seo_title === "E2E canlı SEO" && row.status === "draft", "başlık, slug ve SEO canlı veritabanında doğrulandı (taslak)");

  step("Önizleme");
  await page.getByRole("button", { name: "Önizle" }).first().click();
  check(await page.getByText("Bu yazı otomatik canlı ortam testidir").first().isVisible(), "önizleme içeriği gösteriyor");
  await page.getByRole("button", { name: "Düzenle" }).first().click();

  step("Gerçek AI: tek görsel planı (görsel üretilmez)");
  await bar.getByRole("button", { name: "AI Görselleri" }).click();
  const dialog = page.getByRole("dialog", { name: "AI Görselleri" });
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "Görsel planını hazırla" }).click();
  const planned = await dialog.locator("li[aria-labelledby^='visual-v']").first().waitFor({ timeout: 70_000 }).then(() => true, () => false);
  check(planned, "canlıda ücretsiz metin servisiyle görsel planı oluştu");
  await dialog.getByRole("button", { name: "Görsel stüdyosunu kapat" }).click();
  const usageAfter = Number(await usage());
  check(usageAfter > usageBefore, `AI kullanım sayacı canlı Supabase'de arttı (${usageBefore} → ${usageAfter}; AI_USAGE_STORE=supabase çalışıyor)`);

  step("Yayınla → herkese açık → yayından kaldır");
  await page.getByRole("button", { name: "Yayınla" }).click();
  check(await toast(page, "Yazı yayında."), "yazı yayınlandı");
  const publicPage = await context.newPage();
  const response = await publicPage.goto(`${base}/blog/${RUN}`, { waitUntil: "domcontentloaded" });
  check(response.status() === 200 && (await publicPage.locator("h1").innerText()).includes(RUN), "herkese açık sayfa yeni yazıyı gösteriyor");
  await page.getByRole("button", { name: "Diğer yayın seçenekleri" }).click();
  await page.getByRole("menuitem", { name: "Yayından kaldır" }).click();
  check(await toast(page, "Yazı yayından kaldırıldı ve taslağa alındı."), "arayüzden yayından kaldırıldı");
  const gone = await publicPage.goto(`${base}/blog/${RUN}`, { waitUntil: "domcontentloaded" });
  check(gone.status() === 404, `yayından kalkan yazının adresi 404 döndürüyor (${gone.status()})`);
  const listed = await (await fetch(`${base}/blog`)).text();
  check(!listed.includes(RUN), "blog listesinde test yazısı görünmüyor");
  await publicPage.close();

  step("AI Servisleri paneli (yalnızca okuma)");
  await page.goto(`${base}/admin/blog/ai-servisleri`, { waitUntil: "networkidle" });
  const panel = await page.locator("main").innerText();
  check(/Depo: supabase/.test(panel), "panel kalıcı depoyu gösteriyor: supabase");
  check(/anahtar eksik|Yapılandırılmamış/i.test(panel), "anahtarı olmayan servisler kapalı/yapılandırılmamış olarak gösteriliyor");

  step("Çıkış");
  await page.goto(`${base}/admin/blog`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Çıkış yap" }).click();
  await page.waitForURL(/\/admin\/login/, { timeout: 20_000 });
  await page.goto(`${base}/admin/blog`);
  check(/\/admin\/login/.test(page.url()), "çıkıştan sonra yönetim sayfası giriş ekranına döner");
  check(errors.length === 0, `JS hatası yok ${errors.join(" | ").slice(0, 600)}`);
} catch (error) {
  failures++;
  console.log(`  FAIL beklenmeyen hata [${currentStep}]: ${error.message.split("\n")[0]}`);
  for (const context of browser.contexts()) for (const open of context.pages()) await open.screenshot({ path: join(out, `hata-${Date.now()}.png`) }).catch(() => {});
} finally {
  await browser.close();
  // Temizlik: yalnızca bu çalıştırmanın yazısı, medyası ve geçici kullanıcısı.
  const posts = (await service.from("blog_posts").select("id, status").like("slug", `${RUN}%`)).data ?? [];
  if (posts.some((post) => post.status === "published")) console.log("  UYARI: test yazısı hâlâ yayında görünüyordu; siliniyor");
  if (posts.length) await service.from("blog_posts").delete().in("id", posts.map((post) => post.id));
  const media = (await service.from("blog_media").select("id, storage_path").eq("created_by", userId)).data ?? [];
  if (media.length) {
    await service.from("blog_media").delete().in("id", media.map((item) => item.id));
    await service.storage.from("blog-media").remove(media.map((item) => item.storage_path));
  }
  await service.auth.admin.deleteUser(userId);
  const after = await counts();
  const same = ["posts", "published", "media", "admins", "users", "overrides"].every((key) => Number(after[key]) === Number(before[key])) && JSON.stringify(after.override_rows) === JSON.stringify(before.override_rows);
  console.log(`\ntemizlik: ${same ? "tamam — canlı kayıt sayıları ve limit ayarları testten önceki hâliyle aynı" : `FARK VAR önce=${JSON.stringify(before)} sonra=${JSON.stringify(after)}`} · ekran görüntüleri: ${out}`);
  if (!same) failures++;
  console.log(failures ? `\n${failures} kontrol başarısız` : "\nTÜM KONTROLLER GEÇTİ");
  process.exitCode = failures ? 1 : 0;
}
