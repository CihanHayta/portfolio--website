// Blok ayarlarında "Yapay zekâyla oluştur" — GERÇEK editör, test veritabanı ve depolama (:3100).
//   node scripts/supabase/dev-test.mjs   (ayrı terminalde)
//   node tests/e2e/block-ai-image.e2e.mjs
// Otomatik görsel üretimi yoktur: istem hazırlanır, ChatGPT yeni sekmede açılır
// (kullanıcının kendi hesabı; otomatikleştirilmez), "ürettiğin görsel" yerine test
// bir dosya verir. Kabul edilene kadar bloktaki görsel değişmez; kabul edilince
// medya kaydı (origin: handoff, taslağa bağlı) oluşur ve blok görseli değişir.

import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { projectKeys } from "../../scripts/supabase/_api.mjs";
import { resolveRef } from "../../scripts/supabase/project.mjs";
import { prepareContext } from "./_target.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const out = process.env.QA_OUT ?? mkdtempSync(join(tmpdir(), "persona-blockai-"));
const VIEWPORTS = (process.env.ONLY ?? "390,1440").split(",").map((w) => [Number(w), { 390: 844, 1440: 900 }[w] ?? 900]);
const RUN = `e2e-bai-${Date.now().toString(36)}`;
let failures = 0;
const check = (ok, label) => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`);
};

const keys = await projectKeys(resolveRef("test"));
const service = createClient(keys.url, keys.serviceRole, { auth: { persistSession: false } });
const email = `${RUN}@example.com`;
const password = randomBytes(18).toString("base64url");
const { data: user, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw error;
await service.from("blog_admins").insert({ user_id: user.user.id, display_name: "E2E Blok AI" }).throwOnError();
const before = { posts: (await service.from("blog_posts").select("id", { count: "exact", head: true })).count, media: (await service.from("blog_media").select("id", { count: "exact", head: true })).count };

// Bloktaki "eski" görsel: test deposuna yüklenmiş gerçek bir medya kaydı.
const originalPath = `e2e/${RUN}-eski.webp`;
const originalBuffer = await sharp({ create: { width: 640, height: 360, channels: 3, background: { r: 40, g: 40, b: 40 } } }).webp().toBuffer();
await service.storage.from("blog-media").upload(originalPath, originalBuffer, { contentType: "image/webp" });
const ORIGINAL = service.storage.from("blog-media").getPublicUrl(originalPath).data.publicUrl;
await service.from("blog_media").insert({ storage_path: originalPath, url: ORIGINAL, mime_type: "image/webp", size_bytes: originalBuffer.length, width: 640, height: 360, alt_text: "Eski görsel", created_by: user.user.id }).throwOnError();
const BLOCKS = [
  { id: "hblk00001", type: "heading", props: { text: "Bütçe dağılımı nasıl yapılır", level: "2", href: "", align: "left" } },
  { id: "iblk00001", type: "image", props: { image: { url: ORIGINAL, alt: "Eski görsel", width: 640, height: 360 }, caption: "", href: "", newTab: false } },
];
const file = join(out, "chatgpt.png");
writeFileSync(file, await sharp({ create: { width: 900, height: 500, channels: 3, background: { r: 224, g: 144, b: 47 } } }).png().toBuffer());

const browser = await chromium.launch();
const postIds = [];
try {
  for (const [w, h] of VIEWPORTS) {
    console.log(`\n=== ${w}x${h}`);
    const mobile = w < 1024;
    const { data: post } = await service.from("blog_posts").insert({ title: `E2E Blok AI ${w}`, slug: `${RUN}-${w}`, content: { type: "blocks", version: 1, blocks: BLOCKS }, author_id: user.user.id }).select("id").single().throwOnError();
    postIds.push(post.id);
    const context = await prepareContext(await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile }), base);
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/admin/login?next=${encodeURIComponent(`/admin/blog/${post.id}`)}`, { waitUntil: "networkidle" });
    await page.getByLabel("E-posta").fill(email);
    await page.getByLabel("Şifre", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    await page.waitForURL(new RegExp(`/admin/blog/${post.id}$`), { timeout: 30_000 });
    await page.getByRole("textbox", { name: "Yazı başlığı" }).waitFor({ timeout: 30_000 });

    await page.getByRole("group", { name: /^Görsel bloğu/ }).click();
    if (mobile) await page.locator("[class*=mobileBar]").getByRole("button", { name: "Ayarlar" }).click();
    const settings = page.getByRole("complementary", { name: "Ayarlar" });
    await settings.getByRole("button", { name: "Yapay zekâyla oluştur" }).waitFor({ timeout: 15_000 });
    check((await settings.getByRole("button", { name: "Görsel yükle" }).count()) === 1, "blok ayarlarında 'Görsel yükle' ve 'Yapay zekâyla oluştur' var");
    await settings.getByRole("button", { name: "Yapay zekâyla oluştur" }).click();
    const dialog = page.getByRole("dialog", { name: "Yapay zekâyla görsel oluştur" });
    await dialog.waitFor();
    const text = await dialog.innerText();
    check(/Ücretsiz otomatik görsel servisi yok/.test(text) && /senin hesabınla/.test(text), "pencere üretimin elle (ChatGPT) olduğunu açıkça söylüyor");
    check(text.includes("Bütçe dağılımı nasıl yapılır"), "pencere bloğun bölümünü gösteriyor");
    for (const group of ["Bu yazıdaki görseller", "Yüklediklerin", "Daha önce yapay zekâyla oluşturulanlar"]) check((await dialog.getByRole("region", { name: group }).count()) === 1, `grup: ${group}`);
    check((await dialog.getByRole("button", { name: "İstemi hazırla" }).isDisabled()), "açıklama yazılmadan istem hazırlanmıyor");
    await dialog.getByRole("region", { name: "Bu yazıdaki görseller" }).getByRole("checkbox").first().check();
    await dialog.getByLabel("Ne istediğini Türkçe anlat").fill("Bütçe dağılımını gösteren sade bir şema, turuncu vurgulu");
    check((await dialog.innerText()).includes("1 referans seçili"), "referans seçimi sayıldı");
    await dialog.getByRole("button", { name: "İstemi hazırla" }).click();
    const panel = dialog.getByTestId("handoff-panel");
    await panel.waitFor();
    const popupPromise = context.waitForEvent("page");
    await panel.getByRole("button", { name: /İstemi kopyala ve ChatGPT/ }).click();
    const popup = await popupPromise;
    check(popup.url().replace(/\/$/, "") === "https://chatgpt.com", "ChatGPT yeni sekmede açıldı (referans var: istem panoda)");
    await popup.close();
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
    check(clip.includes("Bütçe dağılımını gösteren sade bir şema") && /birebir kopyalama/.test(clip), "istem kullanıcının Türkçe isteğini ve kopyalamama kuralını içeriyor");
    await panel.locator("input[type=file]").setInputFiles(file);
    await panel.getByRole("img", { name: "Eklenecek görselin önizlemesi" }).waitFor();
    await panel.getByRole("button", { name: "Reddet" }).click();
    const canvasImage = page.getByRole("group", { name: /^Görsel bloğu/ }).locator("img").first();
    const shown = `${await canvasImage.getAttribute("src")} ${await canvasImage.getAttribute("srcset")}`;
    check(shown.includes(encodeURIComponent(originalPath)) || shown.includes(originalPath), "reddedince bloktaki eski görsel duruyor");
    await panel.locator("input[type=file]").setInputFiles(file);
    await panel.getByRole("button", { name: "Kabul et ve bloğa koy" }).click();
    await dialog.waitFor({ state: "detached", timeout: 30_000 });
    await page.waitForTimeout(4500);
    const saved = (await service.from("blog_posts").select("content").eq("id", post.id).single()).data;
    const block = saved.content.blocks.find((item) => item.id === "iblk00001");
    const media = (await service.from("blog_media").select("url, origin, provider, draft_post_id").eq("draft_post_id", post.id)).data ?? [];
    check(saved.content.blocks.length === 2 && block?.props.image.url !== ORIGINAL && media.some((row) => row.url === block.props.image.url && row.origin === "handoff" && row.provider === "chatgpt"), "kabul edilen görsel aynı bloğa kondu ve kalıcı kaydedildi (origin: handoff)");
    check(block?.props.image.alt?.length > 3, "alt metin dolu");
    // Kapak alanında da aynı seçenek (maskot referanslarıyla)
    if (mobile) {
      if (!(await settings.isVisible())) await page.locator("[class*=mobileBar]").getByRole("button", { name: "Ayarlar" }).click();
    }
    await settings.getByRole("tab", { name: "Sayfa Ayarları" }).click();
    await settings.getByRole("region", { name: "Kapak Görseli" }).getByRole("button", { name: "Yapay zekâyla oluştur" }).click().catch(async () => {
      await settings.locator("section[aria-labelledby=set-cover]").getByRole("button", { name: "Yapay zekâyla oluştur" }).click();
    });
    const coverDialog = page.getByRole("dialog", { name: "Kapak görselini yapay zekâyla oluştur" });
    await coverDialog.waitFor();
    check((await coverDialog.getByText(/Maskot referansların/).count()) === 1, "kapak penceresinde maskot referansları var");
    await coverDialog.getByRole("button", { name: "Kapat" }).click();
    check(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, "yatay taşma yok");
    check(errors.length === 0, `JS hatası yok ${errors.join(" | ").slice(0, 160)}`);
    await page.screenshot({ path: join(out, `blok-ai-${w}.png`) });
    await context.close();
  }
} catch (failure) {
  failures++;
  console.log(`  FAIL beklenmeyen hata: ${failure.message.split("\n")[0]} ${(failure.message.match(/waiting for (.+)/) ?? [])[1]?.slice(0, 160) ?? ""}`);
  for (const context of browser.contexts()) for (const open of context.pages()) await open.screenshot({ path: join(out, `hata-${Date.now()}.png`) }).catch(() => {});
} finally {
  await browser.close();
  if (postIds.length) {
    const rows = (await service.from("blog_media").select("id, storage_path").or(`draft_post_id.in.(${postIds.join(",")}),created_by.eq.${user.user.id}`)).data ?? [];
    if (rows.length) {
      await service.storage.from("blog-media").remove(rows.map((row) => row.storage_path));
      await service.from("blog_media").delete().in("id", rows.map((row) => row.id));
    }
    await service.from("blog_posts").delete().in("id", postIds);
  }
  await service.auth.admin.deleteUser(user.user.id);
  const after = { posts: (await service.from("blog_posts").select("id", { count: "exact", head: true })).count, media: (await service.from("blog_media").select("id", { count: "exact", head: true })).count };
  const clean = after.posts === before.posts && after.media === before.media;
  console.log(`\ntemizlik: ${clean ? "tamam" : "EKSİK"} (yazı ${before.posts}→${after.posts}, medya ${before.media}→${after.media}) · ekran görüntüleri: ${out}`);
  if (!clean) failures++;
  console.log(failures ? `\n${failures} kontrol başarısız` : "\nTÜM KONTROLLER GEÇTİ");
  process.exitCode = failures ? 1 : 0;
}
