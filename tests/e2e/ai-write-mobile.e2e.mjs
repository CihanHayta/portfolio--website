// Telefonda (390 px) "AI ile Yaz": kaynak bağlantısı → analiz → taslak → editöre aktar → kaydet.
// GERÇEK okuyucu ve GERÇEK ücretsiz metin servisi (birkaç çağrı); veri TEST projesinde.
//   node scripts/supabase/dev-test.mjs   (ayrı terminalde)  &&  node tests/e2e/ai-write-mobile.e2e.mjs
// SOURCE_URL ile kaynak değiştirilebilir. Geçici yönetici ve yazı sonunda silinir.

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { projectKeys, sql } from "../../scripts/supabase/_api.mjs";
import { resolveRef } from "../../scripts/supabase/project.mjs";
import { prepareContext } from "./_target.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const source = process.env.SOURCE_URL ?? "https://tr.wikipedia.org/wiki/Dijital_pazarlama";
const RUN = `e2e-${Date.now().toString(36)}`;
const ref = resolveRef("test");
let failures = 0;
const check = (ok, label) => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`);
};

const keys = await projectKeys(ref);
const service = createClient(keys.url, keys.serviceRole, { auth: { persistSession: false } });
const email = `${RUN}@example.com`;
const password = randomBytes(18).toString("base64url");
const { data: created, error: createError } = await service.auth.admin.createUser({ email, password, email_confirm: true });
if (createError) throw createError;
const userId = created.user.id;
await service.from("blog_admins").insert({ user_id: userId, display_name: "E2E AI" }).throwOnError();

const browser = await chromium.launch();
const errors = [];
let postId = null;
try {
  const context = await prepareContext(await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), base);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => message.type() === "error" && !/Failed to load resource|status of 4\d\d/.test(message.text()) && errors.push(message.text().slice(0, 200)));

  await page.goto(`${base}/admin/login`, { waitUntil: "networkidle" });
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await page.waitForURL(/\/admin\/blog$/, { timeout: 30_000 });

  await page.goto(`${base}/admin/blog/new`, { waitUntil: "networkidle" });
  await page.locator("[class*=mobileBar]").getByRole("button", { name: "AI ile Yaz" }).tap();
  const studio = page.getByRole("dialog").filter({ hasText: "Yeni blog yazısı oluştur" });
  await studio.waitFor({ timeout: 15_000 });
  check(true, "telefonda 'AI ile Yaz' tek dokunuşla açıldı");
  await studio.getByPlaceholder("https://ornek.com/makale").fill(source);
  await studio.getByRole("button", { name: "Analiz Et ve Taslağı Hazırla" }).tap();

  // Taslak hazır olana kadar (ya da arşivde benzer yazı varsa karar adımında) beklenir.
  const toEditor = page.getByRole("button", { name: "Editöre aktar" });
  const decide = page.getByRole("radio", { name: /Yine de yeni yazı oluştur/ });
  const failed = page.getByRole("alert").filter({ hasText: /sorun|başarısız|yanıt veremedi/ });
  let state = "bekliyor";
  for (let waited = 0; waited < 300_000 && state === "bekliyor"; waited += 2_000) {
    if (await toEditor.isVisible().catch(() => false)) state = "taslak";
    // Boş yeni yazıda taslak onay sormadan doğrudan editöre aktarılır (stüdyo kapanır).
    else if (!(await studio.isVisible().catch(() => true)) && (await page.locator("[data-block-id]").count()) >= 3) state = "editörde";
    else if (await decide.isVisible().catch(() => false)) {
      await decide.tap();
      console.log("  (arşivde benzer yazı bulundu: 'Yine de yeni yazı oluştur' seçildi)");
    } else if (await failed.first().isVisible().catch(() => false)) state = `hata: ${(await failed.first().innerText()).slice(0, 160)}`;
    else await page.waitForTimeout(2_000);
  }
  check(state === "taslak" || state === "editörde", `kaynak analiz edildi ve taslak hazırlandı (${state})`);
  check(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, "AI stüdyosunda yatay taşma yok");

  if (state === "taslak" || state === "editörde") {
    if (state === "taslak") await toEditor.tap();
    await studio.waitFor({ state: "hidden", timeout: 20_000 }).catch(() => {});
    const title = await page.getByRole("textbox", { name: "Yazı başlığı" }).inputValue();
    const blocks = await page.locator("[data-block-id]").count();
    check(title.trim().length > 5 && blocks >= 3, `taslak editöre aktarıldı (başlık var, ${blocks} blok)`);
    await page.getByRole("navigation", { name: "Yazı işlemleri" }).getByRole("button", { name: "Taslak Kaydet" }).tap();
    // Kayıt gerçekten bitince yazı listesine dönülür.
    const back = await page.waitForURL(/\/admin\/blog\?kaydedildi=[0-9a-f-]{36}$/, { timeout: 30_000 }).then(() => true, () => false);
    check(back && (await page.getByText("Taslak kaydedildi.").first().isVisible()), "taslak alt çubuktan kaydedildi; listeye dönüldü");
    postId = new URL(page.url()).searchParams.get("kaydedildi");
    const [row] = await sql(ref, `select title, status, jsonb_array_length(content->'blocks') as blocks from public.blog_posts where id = '${postId}'`);
    check(row?.status === "draft" && row.blocks >= 3 && row.title === title, `yenilemeden sonra taslak veritabanında (${row?.blocks} blok, taslak)`);
    // Gerçek AI çıktısı: konuya özel SSS var ve CTA dili tekil birinci şahıs.
    const [shape] = await sql(ref, `select exists(select 1 from jsonb_array_elements(content->'blocks') b where b->>'type' = 'faq' and jsonb_array_length(b->'props'->'items') >= 2) as has_faq, content_text ~* '(bizimle|ekibimiz|bize ulaşın)' as plural_cta from public.blog_posts where id = '${postId}'`);
    check(shape?.has_faq === true, "gerçek AI taslağında konuya özel SSS bloğu var (en az 2 soru)");
    check(shape?.plural_cta === false, "taslakta çoğul/kurumsal CTA dili yok ('bizimle', 'ekibimiz')");
  }
  check(errors.length === 0, `JS hatası yok ${errors.join(" | ").slice(0, 400)}`);
} catch (error) {
  failures++;
  console.log(`  FAIL beklenmeyen hata: ${error.message.split("\n")[0]}`);
} finally {
  await browser.close();
  const posts = (await service.from("blog_posts").select("id").eq("author_id", userId)).data ?? [];
  const ids = [...new Set([...posts.map((post) => post.id), ...(postId ? [postId] : [])])];
  if (ids.length) await service.from("blog_posts").delete().in("id", ids);
  const media = (await service.from("blog_media").select("id, storage_path").eq("created_by", userId)).data ?? [];
  if (media.length) {
    await service.from("blog_media").delete().in("id", media.map((item) => item.id));
    await service.storage.from("blog-media").remove(media.map((item) => item.storage_path));
  }
  await service.auth.admin.deleteUser(userId);
  console.log(`\ntemizlik: ${ids.length} yazı, ${media.length} medya ve geçici yönetici silindi`);
  console.log(failures ? `\n${failures} kontrol başarısız` : "\nTÜM KONTROLLER GEÇTİ");
  process.exitCode = failures ? 1 : 0;
}
