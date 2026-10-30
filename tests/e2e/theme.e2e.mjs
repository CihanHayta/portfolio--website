// Yazı teması (Açık / Koyu) — GERÇEK editör ve test veritabanı (:3100).
//   node scripts/supabase/dev-test.mjs   (ayrı terminalde)
//   node tests/e2e/theme.e2e.mjs
// Editör: tema seçimi content.meta.theme olarak kaydedilir, yenilemede korunur, tuval
// aynı tonda görünür; "koyu temayı dene" önerisi reddedilince tekrar çıkmaz.
// Herkese açık sayfa: seçilen tema uygulanır (koyu zemin, açık metin; kontrast ölçülür).

import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { projectKeys } from "../../scripts/supabase/_api.mjs";
import { resolveRef } from "../../scripts/supabase/project.mjs";
import { prepareContext } from "./_target.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const out = process.env.QA_OUT ?? mkdtempSync(join(tmpdir(), "persona-theme-"));
const VIEWPORTS = (process.env.ONLY ?? "390,1440").split(",").map(Number);
const PUBLIC = process.env.PUBLIC_CHECKS !== "0";
const RUN = `e2e-thm-${Date.now().toString(36)}`;
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
await service.from("blog_admins").insert({ user_id: user.user.id, display_name: "E2E Tema" }).throwOnError();
const before = (await service.from("blog_posts").select("id", { count: "exact", head: true })).count;

const para = (text) => ({ type: "paragraph", content: [{ type: "text", text }] });
const BLOCKS = [
  { id: "thtext001", type: "text", props: { doc: { type: "doc", content: [para("Giriş paragrafı. ".repeat(20))] } } },
  { id: "thhead001", type: "heading", props: { text: "Birinci bölüm", level: "2", href: "", align: "left" } },
  { id: "thtext002", type: "text", props: { doc: { type: "doc", content: [para("Bölüm metni. ".repeat(40))] } } },
];

// WCAG göreli parlaklık ve kontrast (rgb(a) dizgilerinden).
const luminance = (rgb) => {
  const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

const browser = await chromium.launch();
const postIds = [];
try {
  for (const w of VIEWPORTS) {
    const h = w < 1024 ? 844 : 900;
    const mobile = w < 1024;
    console.log(`\n=== ${w}x${h}`);
    const slug = `${RUN}-${w}`;
    const { data: post } = await service.from("blog_posts").insert({ title: `E2E Tema ${w}`, slug, excerpt: "Tema testi", content: { type: "blocks", version: 1, blocks: BLOCKS }, author_id: user.user.id }).select("id").single().throwOnError();
    postIds.push(post.id);
    const context = await prepareContext(await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile }), base);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/admin/login?next=${encodeURIComponent(`/admin/blog/${post.id}`)}`, { waitUntil: "networkidle" });
    await page.getByLabel("E-posta").fill(email);
    await page.getByLabel("Şifre", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    await page.waitForURL(new RegExp(`/admin/blog/${post.id}$`), { timeout: 30_000 });
    await page.getByRole("textbox", { name: "Yazı başlığı" }).waitFor({ timeout: 30_000 });
    const openPage = async () => {
      if (mobile) await page.locator("[class*=mobileBar]").getByRole("button", { name: "Ayarlar" }).click();
      await page.getByRole("tab", { name: "Sayfa Ayarları" }).click();
      return page.getByRole("region", { name: "Görünüm" });
    };
    let section = await openPage();
    check(await section.getByRole("radio", { name: "Açık tema" }).isChecked(), "yeni yazının teması varsayılan olarak açık");
    check(await section.getByText("Yeni koyu temayı denemek ister misin?").isVisible(), "koyu tema önerisi bir kez gösteriliyor");
    await section.getByRole("button", { name: "Koyu temayı dene" }).click();
    check(await section.getByRole("radio", { name: "Koyu tema" }).isChecked(), "öneriden koyu tema seçildi");
    check((await page.getByRole("article", { name: "Yazı tuvali" }).getAttribute("data-tone")) === "dark", "tuval koyu tonda");
    check((await section.getByText("Yeni koyu temayı denemek ister misin?").count()) === 0, "öneri kabul edilince kapandı");
    if (mobile) await page.getByRole("button", { name: "Ayarları kapat" }).click();
    await page.waitForTimeout(3500);
    const saved = (await service.from("blog_posts").select("content").eq("id", post.id).single()).data;
    check(saved.content.meta?.theme === "dark", "tema Supabase'de (content.meta.theme = dark)");
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("textbox", { name: "Yazı başlığı" }).waitFor();
    section = await openPage();
    check(await section.getByRole("radio", { name: "Koyu tema" }).isChecked(), "yenilemeden sonra koyu tema seçili");
    await section.getByRole("radio", { name: "Açık tema" }).check();
    check((await section.getByText("Yeni koyu temayı denemek ister misin?").count()) === 0, "öneri bu tarayıcıda tekrar çıkmıyor");
    await section.getByRole("radio", { name: "Koyu tema" }).check();
    if (mobile) await page.getByRole("button", { name: "Ayarları kapat" }).click();
    await page.waitForTimeout(3500);

    if (PUBLIC) {
      // Herkese açık sayfa: yazıyı yayımla (test verisi), koyu temayı ölç.
      await service.from("blog_posts").update({ status: "published", published_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", post.id).throwOnError();
      const visitor = await prepareContext(await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile }), base);
      const view = await visitor.newPage();
      const response = await view.goto(`${base}/blog/${slug}`, { waitUntil: "networkidle" });
      check(response.status() === 200, "yazı herkese açık");
      const colors = await view.evaluate(() => {
        const root = document.querySelector("[data-theme=blog]");
        const body = document.querySelector("[data-reading-body] p");
        const h1 = document.querySelector("h1");
        const h2 = document.querySelector("[data-reading-body] h2");
        const bg = getComputedStyle(root).backgroundColor;
        return { bg, p: getComputedStyle(body).color, h1: getComputedStyle(h1).color, h2: getComputedStyle(h2).color, tone: document.querySelector("article[data-tone]")?.getAttribute("data-tone") };
      });
      check(colors.tone === "dark", "makale data-tone=dark");
      check(luminance(colors.bg) < 0.05, `koyu zemin (${colors.bg})`);
      check(contrast(colors.p, colors.bg) >= 4.5, `gövde metni kontrastı ≥4.5 (${contrast(colors.p, colors.bg).toFixed(2)})`);
      check(contrast(colors.h1, colors.bg) >= 7 && contrast(colors.h2, colors.bg) >= 7, `başlıklar beyaz/çok yüksek kontrast (${contrast(colors.h1, colors.bg).toFixed(1)})`);
      await view.screenshot({ path: join(out, `koyu-${w}.png`) });
      await visitor.close();
    }
    check(errors.length === 0, `JS hatası yok ${errors.join(" | ").slice(0, 160)}`);
    await context.close();
  }
} catch (failure) {
  failures++;
  console.log(`  FAIL beklenmeyen hata: ${failure.message.split("\n")[0]} ${(failure.message.match(/waiting for (.+)/) ?? [])[1]?.slice(0, 160) ?? ""}`);
} finally {
  await browser.close();
  if (postIds.length) await service.from("blog_posts").delete().in("id", postIds);
  await service.auth.admin.deleteUser(user.user.id);
  const after = (await service.from("blog_posts").select("id", { count: "exact", head: true })).count;
  console.log(`\ntemizlik: ${after === before ? "tamam" : "EKSİK"} (yazı ${before}→${after}) · ekran görüntüleri: ${out}`);
  if (after !== before) failures++;
  console.log(failures ? `\n${failures} kontrol başarısız` : "\nTÜM KONTROLLER GEÇTİ");
  process.exitCode = failures ? 1 : 0;
}
