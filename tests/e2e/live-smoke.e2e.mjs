// CANLI duman testi (Production) — personadijitalpazarlama.com. HİÇBİR ŞEY YAYIMLANMAZ.
//   E2E_ALLOW_PRODUCTION=1 node tests/e2e/live-smoke.e2e.mjs
// Yalnızca bu testin kayıtları: geçici yönetici (e2e-…@example.com), "CANLI-SMOKE-TEST-2026"
// başlıklı taslak(lar) ve bu test için üretilen iki PNG. Sonunda yalnızca bunlar silinir;
// başta/sonda kayıt sayıları karşılaştırılır. Mevcut yazılara ve ayarlara dokunulmaz.
// Gerçek AI (yalnızca ücretsiz, FREE_ONLY): kaynak okuma (AI değil), 1 görsel planı ve
// isteğe bağlı 1 tam taslak (E2E_LIVE_AI_DRAFT=1). Kimlik bilgileri yazdırılmaz.

import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { linkedProject, projectKeys, sql } from "../../scripts/supabase/_api.mjs";

const base = process.env.BASE_URL ?? "https://personadijitalpazarlama.com";
if (process.env.E2E_ALLOW_PRODUCTION !== "1") throw new Error("Canlı test için E2E_ALLOW_PRODUCTION=1 gerekli.");
const out = process.env.QA_OUT ?? mkdtempSync(join(tmpdir(), "persona-smoke-"));
const TITLE = "CANLI-SMOKE-TEST-2026";
const RUN = `e2e-${Date.now().toString(36)}`;
const ref = linkedProject().ref;
const results = [];
const record = (status, label, note = "") => {
  results.push({ status, label, note });
  console.log(`  ${status.padEnd(10)} ${label}${note ? ` — ${note}` : ""}`);
};
const check = (ok, label, note = "") => record(ok ? "PASS" : "FAIL", label, note);
const step = (label) => console.log(`\n— ${label}`);
const sha = (data) => createHash("sha256").update(data).digest("hex");

const counts = async () =>
  (await sql(ref, `select (select count(*) from public.blog_posts) posts, (select count(*) from public.blog_posts where status = 'published') published,
    (select count(*) from public.blog_media) media, (select count(*) from storage.objects where bucket_id = 'blog-media') files,
    (select count(*) from public.blog_admins) admins, (select count(*) from auth.users) users, (select count(*) from public.blog_studio_sessions) sessions`))[0];
const before = await counts();
const keys = await projectKeys(ref);
const service = createClient(keys.url, keys.serviceRole, { auth: { persistSession: false } });
const email = `${RUN}@example.com`;
const password = randomBytes(18).toString("base64url");
const { data: created, error: createError } = await service.auth.admin.createUser({ email, password, email_confirm: true });
if (createError) throw createError;
const userId = created.user.id;
await service.from("blog_admins").insert({ user_id: userId, display_name: "E2E Canlı Duman" }).throwOnError();

const png = async (name, r, g, b) => {
  const path = join(out, name);
  writeFileSync(path, await sharp({ create: { width: 1200, height: 630, channels: 3, background: { r, g, b } } }).png().toBuffer());
  return path;
};
const sectionPng = await png("smoke-bolum.png", 224, 144, 47);
const coverPng = await png("smoke-kapak.png", 20, 20, 24);
const postIds = new Set();
const browser = await chromium.launch();
const errors = [];

async function login(context) {
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => message.type() === "error" && !/Failed to load resource|401|status of 4\d\d/.test(message.text()) && errors.push(message.text().slice(0, 200)));
  await page.goto(`${base}/admin/login`, { waitUntil: "networkidle" });
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await page.waitForURL(/\/admin\/blog$/, { timeout: 30_000 });
  return page;
}

try {
  step("D. Giriş ve yönetim listesi");
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await desktop.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  const wrong = await desktop.newPage();
  await wrong.goto(`${base}/admin/login`, { waitUntil: "networkidle" });
  await wrong.getByLabel("E-posta").fill(email);
  await wrong.getByLabel("Şifre", { exact: true }).fill("yanlis-sifre-123");
  await wrong.getByRole("button", { name: "Giriş Yap" }).click();
  check(await wrong.locator('form [role="alert"]').waitFor({ timeout: 20_000 }).then(async () => (await wrong.locator('form [role="alert"]').innerText()).includes("E-posta ya da şifre hatalı"), () => false), "giriş ekranı: yanlış şifre reddedildi");
  await wrong.close();
  const page = await login(desktop);
  check(true, "giriş ekranı: doğru şifreyle yönetim paneli açıldı");
  check((await page.getByRole("link", { name: "Yeni Blog Yazısı" }).count()) > 0 && (await page.locator("table, [role=table], ul").count()) > 0, "blog listeleme ekranı açıldı");

  step("E. CANLI-SMOKE-TEST-2026: oluştur, bloklar, sıra, kaynak, SEO, görsel, kapak");
  await page.goto(`${base}/admin/blog/new`, { waitUntil: "networkidle" });
  const titleBox = page.getByRole("textbox", { name: "Yazı başlığı" });
  await titleBox.waitFor({ timeout: 30_000 });
  await titleBox.fill(TITLE);
  check((await titleBox.inputValue()) === TITLE, "başlık oluşturuldu");
  const library = page.getByRole("complementary", { name: "Blok kütüphanesi" });
  await library.getByRole("button", { name: "Başlık", exact: true }).click();
  await page.getByRole("tab", { name: "Blok Ayarları" }).click();
  await page.getByLabel("Başlık metni").fill("Smoke bölüm başlığı");
  await library.getByRole("button", { name: /^Paragraf/ }).first().click();
  await page.getByRole("textbox", { name: "Paragraf metni" }).click();
  const paragraphText = "Canlı duman testi paragrafı; kaynakçaya atıf [1].";
  await page.keyboard.type(paragraphText);
  await library.getByRole("button", { name: /^Ayırıcı/ }).first().click();
  const typesInCanvas = () => page.locator("article[aria-label='Yazı tuvali'] [data-block-type]").evaluateAll((els) => els.map((el) => el.getAttribute("data-block-type")));
  check(JSON.stringify(await typesInCanvas()) === JSON.stringify(["heading", "text", "divider"]), "paragraf ve iki farklı blok eklendi (başlık, ayırıcı)", (await typesInCanvas()).join(" › "));
  const divider = page.getByRole("group", { name: /^Ayırıcı bloğu/ });
  await divider.click();
  await divider.getByRole("button", { name: "Yukarı taşı" }).click();
  check(JSON.stringify(await typesInCanvas()) === JSON.stringify(["heading", "divider", "text"]), "blok sırası değiştirildi (ayırıcı yukarı)", (await typesInCanvas()).join(" › "));

  await page.getByRole("tab", { name: "Sayfa Ayarları" }).click();
  await page.getByRole("textbox", { name: "Kalıcı bağlantı" }).fill(`canli-smoke-test-2026-${RUN}`);
  await page.getByLabel("SEO başlığı").fill("CANLI-SMOKE SEO başlığı");
  await page.getByLabel("Meta açıklaması").fill("Canlı duman testi meta açıklaması: kalıcılık ve kaynakça doğrulaması.");
  await page.getByRole("radio", { name: "Koyu tema" }).check();
  const sourcesPanel = page.getByRole("region", { name: "Kaynakça" });
  await sourcesPanel.getByRole("button", { name: "Kaynak ekle" }).click();
  await sourcesPanel.getByLabel("Kaynak adresi (URL)").fill("https://example.com/canli-smoke-kaynak");
  await sourcesPanel.getByLabel("Başlık").fill("Smoke test kaynağı");
  await sourcesPanel.getByRole("button", { name: "Kaynağı ekle" }).click();
  check((await sourcesPanel.locator("ol > li").count()) === 1, "kaynak eklendi (Kaynakça)");

  // Görseller: bölüme görsel yükle + kapak yükle (yalnızca bu test için üretilen PNG'ler)
  await page.getByRole("button", { name: "Görseller", exact: true }).click();
  const images = page.getByRole("dialog", { name: "Görseller" });
  await images.locator("[data-section=cover]").waitFor({ timeout: 30_000 });
  const sectionCard = images.locator("ol > li[data-section]:not([data-section=cover]):not([data-section=intro])").first();
  check((await sectionCard.innerText()).includes("Smoke bölüm başlığı") && (await sectionCard.innerText()).includes("Bu bölümde henüz görsel yok."), "Görseller: gerçek başlıklı bölüm kartı ve boş durum mesajı");
  let chooser = page.waitForEvent("filechooser");
  await sectionCard.getByRole("button", { name: "Görsel yükle" }).click();
  await (await chooser).setFiles(sectionPng);
  await images.getByText(/1 görsel yüklendi ve Bölüm 1/).waitFor({ timeout: 60_000 });
  check(!(await sectionCard.innerText()).includes("Bu bölümde henüz görsel yok."), "bölüme görsel yüklendi ve doğru bölümde görünüyor");
  chooser = page.waitForEvent("filechooser");
  await images.locator("[data-section=cover]").getByRole("button", { name: "Görsel yükle" }).click();
  await (await chooser).setFiles(coverPng);
  await images.getByText(/kapak olarak ayarlandı/).waitFor({ timeout: 60_000 });
  check(true, "kapak görseli yüklendi ve ayarlandı");
  await images.getByText("Seçimler taslağa kaydedildi").waitFor({ timeout: 20_000 }).catch(() => {});
  await images.getByRole("button", { name: "Bitti" }).click();

  // Taslak Kaydet → liste
  await page.getByRole("button", { name: "Taslak Kaydet" }).first().click();
  await page.waitForURL(/\/admin\/blog\?kaydedildi=[0-9a-f-]{36}$/, { timeout: 30_000 });
  const postId = new URL(page.url()).searchParams.get("kaydedildi");
  postIds.add(postId);
  check(await page.getByText("Taslak kaydedildi.").first().isVisible(), "taslak kaydedildi bildirimi; admin blog listesine dönüldü");
  check((await page.locator("[data-saved]").first().innerText()).includes(TITLE), "kaydedilen taslak listede işaretli");

  // Gerçek Supabase kaydı
  const [row] = await sql(ref, `select title, status, seo_title, seo_description, slug, cover_media_id, content from public.blog_posts where id = '${postId}'`);
  const blockTypes = row.content.blocks.map((block) => block.type);
  check(row.status === "draft" && row.title === TITLE, "Supabase: taslak olarak kaydedildi (yayımlanmadı)");
  check(JSON.stringify(blockTypes) === JSON.stringify(["heading", "image", "divider", "text"]), "Supabase: blok sırası (başlık › görsel › ayırıcı › paragraf)", blockTypes.join(" › "));
  check(JSON.stringify(row.content).includes(paragraphText), "Supabase: paragraf metni");
  check(row.content.meta?.sources?.[0]?.url === "https://example.com/canli-smoke-kaynak" && row.content.meta?.theme === "dark", "Supabase: kaynak ve tema (content.meta)");
  check(row.seo_title === "CANLI-SMOKE SEO başlığı" && row.seo_description.startsWith("Canlı duman testi meta"), "Supabase: SEO başlığı ve açıklaması");
  const media = await sql(ref, `select id, url, storage_path, origin from public.blog_media where draft_post_id = '${postId}' order by created_at`);
  check(media.length === 2 && media.every((item) => item.origin === "upload") && media.some((item) => item.id === row.cover_media_id), "Supabase: 2 görsel taslağa bağlı (köken: yükleme), biri kapak");
  const imageBlock = row.content.blocks.find((block) => block.type === "image");
  check(media.some((item) => item.url === imageBlock?.props?.image?.url), "bölüm görseli medya kaydıyla eşleşiyor");
  const objects = await sql(ref, `select name from storage.objects where bucket_id = 'blog-media' and name in (${media.map((item) => `'${item.storage_path}'`).join(",")})`);
  check(objects.length === 2, "Storage: iki dosya gerçekten saklandı");
  const fetched = await Promise.all(media.map(async (item) => (await fetch(item.url)).ok));
  check(fetched.every(Boolean), "Storage: dosyalar herkese açık adresten erişilebilir (webp)");
  const session = (await sql(ref, `select data from public.blog_studio_sessions where post_id = '${postId}'`))[0]?.data;
  check(Boolean(session) && (session.images ?? []).filter((item) => ["placed", "cover"].includes(item.state)).length === 2, "Supabase: Görseller oturumu (yerleşim + kapak) taslağa bağlı kaydedildi");

  step("E. Yeniden aç ve yenile: içerik, kaynak, SEO, sıra, kapak korunuyor mu?");
  await page.goto(`${base}/admin/blog/${postId}`, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await titleBox.waitFor();
  check((await titleBox.inputValue()) === TITLE, "yenilemeden sonra başlık");
  check(JSON.stringify(await typesInCanvas()) === JSON.stringify(["heading", "image", "divider", "text"]), "yenilemeden sonra blok sırası", (await typesInCanvas()).join(" › "));
  // Paragraf metin kutusu yalnızca blok seçiliyken düzenlenebilir; içerik tuvalde okunur.
  check((await page.getByRole("article", { name: "Yazı tuvali" }).innerText()).includes("Canlı duman testi paragrafı"), "yenilemeden sonra paragraf");
  check((await page.getByRole("article", { name: "Yazı tuvali" }).getAttribute("data-tone")) === "dark", "yenilemeden sonra tema (koyu)");
  await page.getByRole("tab", { name: "Sayfa Ayarları" }).click();
  check((await page.getByLabel("SEO başlığı").inputValue()) === "CANLI-SMOKE SEO başlığı", "yenilemeden sonra SEO başlığı");
  check((await page.getByRole("region", { name: "Kaynakça" }).innerText()).includes("Smoke test kaynağı"), "yenilemeden sonra kaynak");
  check((await page.locator("section[aria-labelledby=set-cover] img").count()) > 0, "yenilemeden sonra kapak görseli");
  await page.getByRole("button", { name: "Görseller", exact: true }).click();
  const reopened = page.getByRole("dialog", { name: "Görseller" });
  await reopened.locator("[data-section=cover]").waitFor({ timeout: 30_000 });
  const reCard = reopened.locator("ol > li[data-section]:not([data-section=cover]):not([data-section=intro])").first();
  check((await reCard.innerText()).includes("Bu bölümde kullanılan görsel") && !(await reopened.locator("[data-section=cover]").innerText()).includes("Henüz kapak görseli yok"), "yeniden açılınca görsel bölümü ve kapak korunuyor");
  await reopened.getByRole("button", { name: "Bitti" }).click();

  step("D. Önizleme (canlı veritabanı, aynı makale bileşeni)");
  const preview = await desktop.newPage();
  await preview.goto(`${base}/admin/blog/${postId}/preview`, { waitUntil: "networkidle" });
  check((await preview.locator("h1").first().innerText()).includes(TITLE), "önizleme başlığı");
  check((await preview.locator("article[data-tone]").first().getAttribute("data-tone")) === "dark", "önizlemede koyu tema");
  const sources = preview.getByRole("region", { name: "Yazıda kullanılan kaynaklar" });
  check((await sources.count()) === 1 && (await sources.locator("#kaynak-1 a").first().getAttribute("href")) === "https://example.com/canli-smoke-kaynak", "önizlemede numaralı kaynakça ve bağlantı");
  check((await preview.locator('[data-article-body] sup a[href="#kaynak-1"]').count()) === 1, "metindeki [1] atıfı kaynakçaya bağlı");
  check((await preview.getByRole("region", { name: /Cihan Hayta|E2E Canlı Duman/ }).count()) === 1, "önizlemede yazar kutusu");
  await preview.screenshot({ path: join(out, "onizleme-koyu.png") });
  await preview.close();

  step("D. Blok silme ve yayınlama kontrolü (yayımlanmaz)");
  const dividerAgain = page.getByRole("group", { name: /^Ayırıcı bloğu/ });
  await dividerAgain.click();
  await dividerAgain.getByRole("button", { name: "Sil" }).click();
  await page.waitForTimeout(4_000);
  const [afterDelete] = await sql(ref, `select content from public.blog_posts where id = '${postId}'`);
  check(!afterDelete.content.blocks.some((block) => block.type === "divider") && afterDelete.content.blocks.length === 3, "blok silindi ve otomatik kayıt Supabase'e yazdı");
  await page.getByRole("button", { name: "Yayınla", exact: true }).first().click();
  const confirm = page.getByRole("dialog", { name: "Yazı yayınlansın mı?" });
  await confirm.waitFor();
  check((await confirm.innerText()).includes("canli-smoke-test-2026") && !(await confirm.innerText()).includes("Kaynakça eksik"), "yayın onayı adresi gösteriyor; kaynak olduğu için kaynakça uyarısı yok");
  await confirm.getByRole("button", { name: "Vazgeç" }).click();
  check((await sql(ref, `select status from public.blog_posts where id = '${postId}'`))[0].status === "draft", "Vazgeç: yazı yayımlanmadı (taslak)");

  step("F. Kaynak okuma ve gerçek ücretsiz AI");
  const readSource = (url) =>
    page.evaluate(async (target) => {
      const response = await fetch("/api/admin/ai/source", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: target }) });
      const lines = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
      const last = lines.at(-1);
      return { status: response.status, type: last.type, words: last.source?.wordCount ?? 0, error: last.error ?? "", siteName: last.source?.siteName ?? "" };
    }, url);
  const good = await readSource("https://tr.wikipedia.org/wiki/Dijital_pazarlama");
  check(good.type === "result" && good.words > 300, "kaynak URL okunuyor (gerçek sayfa)", `${good.words} sözcük`);
  const bad = await readSource("https://example.com/");
  check(bad.type !== "result" && /yeterli|okunamad|metin/i.test(bad.error), "okunamayan kaynakta anlaşılır mesaj", bad.error.slice(0, 120));
  const plan = await page.evaluate(async (id) => {
    const response = await fetch("/api/admin/ai/visual-plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ opId: crypto.randomUUID(), postId: id, title: "CANLI-SMOKE-TEST-2026", sections: [{ id: "smokesec1", level: 2, heading: "Smoke bölüm başlığı", text: "", words: 0 }] }) });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, postId);
  check(plan.status === 200 && (plan.body.plan?.items?.length ?? 0) > 0, "gerçek ücretsiz AI (görsel planı) canlıda yanıt verdi", `${plan.body.provider ?? plan.body.error ?? plan.status} · ${plan.body.model ?? ""}`);

  if (process.env.E2E_LIVE_AI_DRAFT === "1") {
    step("F. Gerçek AI ile tam taslak (stüdyo, kaynak URL) → kaydet → yeniden aç");
    await page.goto(`${base}/admin/blog/new`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "AI Blog Stüdyosu" }).first().click();
    const studio = page.getByRole("dialog", { name: "AI Blog Stüdyosu" });
    await studio.getByLabel("Kaynak linki").fill("https://tr.wikipedia.org/wiki/Dijital_pazarlama");
    await studio.getByRole("button", { name: "Analiz Et ve Taslağı Hazırla" }).click();
    let state = "bekliyor";
    for (let waited = 0; waited < 330_000 && state === "bekliyor"; waited += 2_000) {
      if (!(await studio.isVisible().catch(() => true)) && (await page.locator("[data-block-id]").count()) >= 3) state = "editörde";
      else if (await studio.getByRole("button", { name: /Editöre aktar/ }).isVisible().catch(() => false)) {
        await studio.getByRole("button", { name: /Editöre aktar/ }).click();
      } else if (await studio.getByRole("radio", { name: /Yine de yeni yazı oluştur/ }).isVisible().catch(() => false)) {
        await studio.getByRole("radio", { name: /Yine de yeni yazı oluştur/ }).click();
      } else if (await studio.getByRole("alert").first().isVisible().catch(() => false)) state = `hata: ${(await studio.getByRole("alert").first().innerText()).slice(0, 160)}`;
      else await page.waitForTimeout(2_000);
    }
    if (state === "editörde") {
      await titleBox.fill(`${TITLE} (AI)`);
      await page.getByRole("button", { name: "Taslak Kaydet" }).first().click();
      await page.waitForURL(/\/admin\/blog\?kaydedildi=/, { timeout: 30_000 });
      const aiId = new URL(page.url()).searchParams.get("kaydedildi");
      postIds.add(aiId);
      const [aiRow] = await sql(ref, `select content from public.blog_posts where id = '${aiId}'`);
      const aiSources = aiRow.content.meta?.sources ?? [];
      check(aiRow.content.blocks.length >= 4, "gerçek AI taslağı kaydedildi", `${aiRow.content.blocks.length} blok`);
      check(aiSources.some((item) => item.url.includes("wikipedia.org")), "okunan kaynak taslakla birlikte kaynakçaya kaydedildi", aiSources.map((item) => item.siteName || item.url).join(", "));
      await page.goto(`${base}/admin/blog/${aiId}`, { waitUntil: "networkidle" });
      check((await page.locator("[data-block-id]").count()) >= 4, "AI taslağı yeniden açılıyor");
    } else {
      record(state.startsWith("hata") ? "FAIL" : "BLOCKED", "gerçek AI ile tam taslak", state);
      check(await studio.getByLabel("Kaynak linki").isVisible().catch(() => false) || /korunuyor/.test(state), "hata durumunda girdiler korunuyor");
    }
  } else {
    record("NOT TESTED", "gerçek AI ile tam taslak", "E2E_LIVE_AI_DRAFT=1 verilmedi");
  }
  await desktop.close();

  step("H. Telefon (390): editörün alt çubuğu, ayarlar, Görseller");
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobilePage = await login(phone);
  const mainId = [...postIds][0];
  await mobilePage.goto(`${base}/admin/blog/${mainId}`, { waitUntil: "networkidle" });
  const actions = mobilePage.getByRole("navigation", { name: "Yazı işlemleri" });
  const sizes = await actions.getByRole("button").evaluateAll((buttons) => buttons.map((button) => Math.round(Math.min(button.getBoundingClientRect().width, button.getBoundingClientRect().height))));
  check((await actions.isVisible()) && sizes.every((size) => size >= 44), "alt işlem çubuğu görünür, hedefler ≥44 px", sizes.join(", "));
  await mobilePage.locator("[class*=mobileBar]").getByRole("button", { name: "Ayarlar" }).tap();
  // Çekmece kayarak açılır: sekmenin görünmesi en fazla 5 sn beklenir.
  const drawerOpened = await mobilePage.getByRole("tab", { name: "Sayfa Ayarları" }).waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false);
  if (!drawerOpened) await mobilePage.screenshot({ path: join(out, "telefon-ayarlar.png") });
  check(drawerOpened, "ayarlar çekmecesi açılıyor");
  await mobilePage.getByRole("button", { name: "Ayarları kapat" }).tap();
  await mobilePage.locator("[class*=mobileBar]").getByRole("button", { name: "Görseller" }).tap();
  await mobilePage.getByRole("dialog", { name: "Görseller" }).locator("[data-section=cover]").waitFor({ timeout: 30_000 });
  check(await mobilePage.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, "telefonda Görseller ekranında yatay taşma yok");
  await mobilePage.screenshot({ path: join(out, "telefon-gorseller.png") });
  await phone.close();
  record("NOT TESTED", "gerçek iPhone klavyesi", "yalnızca Chromium mobil öykünmesi; gerçek cihaz kullanılmadı");
  check(errors.length === 0, "yönetim ekranlarında JavaScript hatası yok", errors.join(" | ").slice(0, 200));
} catch (failure) {
  record("FAIL", "beklenmeyen hata", `${failure.message.split("\n")[0]} ${(failure.message.match(/waiting for (.+)/) ?? [])[1]?.slice(0, 140) ?? ""}`);
  for (const context of browser.contexts()) for (const open of context.pages()) await open.screenshot({ path: join(out, `hata-${Date.now()}.png`) }).catch(() => {});
} finally {
  await browser.close();
  // Temizlik: YALNIZCA bu testin taslakları, onların medya kayıtları/dosyaları ve geçici yönetici.
  const ids = [...postIds];
  const own = ids.length ? await sql(ref, `select id, storage_path from public.blog_media where draft_post_id in (${ids.map((id) => `'${id}'`).join(",")})`) : [];
  if (ids.length) await service.from("blog_posts").update({ cover_media_id: null }).in("id", ids);
  if (own.length) {
    await service.storage.from("blog-media").remove(own.map((item) => item.storage_path));
    await service.from("blog_media").delete().in("id", own.map((item) => item.id));
  }
  if (ids.length) await service.from("blog_posts").delete().in("id", ids);
  await service.from("blog_admins").delete().eq("user_id", userId);
  await service.auth.admin.deleteUser(userId);
  const after = await counts();
  const same = ["posts", "published", "media", "files", "admins", "users", "sessions"].every((key) => Number(after[key]) === Number(before[key]));
  console.log(`\ntemizlik: ${same ? "tamam" : "EKSİK"} · önce ${JSON.stringify(before)} · sonra ${JSON.stringify(after)} · ekran görüntüleri: ${out}`);
  if (!same) record("FAIL", "temizlik (kayıt sayıları başlangıçla aynı)");
  const summary = results.reduce((acc, item) => ({ ...acc, [item.status]: (acc[item.status] ?? 0) + 1 }), {});
  console.log(`\nÖZET ${JSON.stringify(summary)}`);
  process.exitCode = results.some((item) => item.status === "FAIL") ? 1 : 0;
}
