// Örten katman / kilitli sayfa — WebKit (Safari motoru) ve Chromium, telefon ve masaüstü.
//   node scripts/supabase/dev-test.mjs   (ayrı terminalde)
//   node tests/e2e/overlay.e2e.mjs
// Her pencere açılıp kapatıldıktan sonra: açık <dialog> kalmamalı, sayfa "inert"
// olmamalı, ekrandaki nokta ızgarasında örten bir katman bulunmamalı ve editör
// düğmeleri gerçekten tıklanabilmeli. Sahte AI yanıtı: yalnızca servis listesi.

import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium, webkit } from "playwright-core";
import { projectKeys } from "../../scripts/supabase/_api.mjs";
import { resolveRef } from "../../scripts/supabase/project.mjs";
import { prepareContext } from "./_target.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const out = process.env.QA_OUT ?? mkdtempSync(join(tmpdir(), "persona-overlay-"));
const ENGINES = (process.env.ENGINES ?? "webkit,chromium").split(",");
const VIEWPORTS = (process.env.ONLY ?? "390,1440").split(",").map(Number);
const RUN = `e2e-ovl-${Date.now().toString(36)}`;
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
await service.from("blog_admins").insert({ user_id: user.user.id, display_name: "E2E Katman" }).throwOnError();
const para = (value) => ({ type: "paragraph", content: [{ type: "text", text: value }] });
const BLOCKS = [
  { id: "t1ovl0001", type: "text", props: { doc: { type: "doc", content: [para("Giriş paragrafı.")] } } },
  { id: "h1ovl0001", type: "heading", props: { text: "Bölüm", level: "2", href: "", align: "left" } },
];

// Ekrandaki ızgara: kapatılmış pencereden geriye örten bir öğe kalmış mı?
const coverage = (page) =>
  page.evaluate(() => {
    const hits = [];
    for (let y = 0.15; y < 0.95; y += 0.2) {
      for (let x = 0.1; x < 1; x += 0.2) {
        const el = document.elementFromPoint(innerWidth * x, innerHeight * y);
        const blocker = el?.closest("dialog, [role=dialog], [aria-modal=true]");
        if (blocker) hits.push(blocker.getAttribute("aria-labelledby") || blocker.getAttribute("aria-label") || blocker.className);
      }
    }
    return {
      openDialogs: document.querySelectorAll("dialog[open]").length,
      inert: [...document.querySelectorAll("[inert]")].length + (document.body.inert ? 1 : 0),
      bodyLocked: getComputedStyle(document.body).overflow === "hidden" || getComputedStyle(document.documentElement).overflow === "hidden",
      hits,
    };
  });

const browsers = [];
const postIds = [];
try {
  for (const engine of ENGINES) {
    const browser = await (engine === "webkit" ? webkit : chromium).launch();
    browsers.push(browser);
    for (const w of VIEWPORTS) {
      const h = w < 1024 ? 844 : 900;
      const mobile = w < 1024;
      console.log(`\n=== ${engine} ${w}x${h}`);
      const { data: post } = await service.from("blog_posts").insert({ title: `E2E Katman ${engine} ${w}`, slug: `${RUN}-${engine}-${w}`, content: { type: "blocks", version: 1, blocks: BLOCKS }, author_id: user.user.id }).select("id").single().throwOnError();
      postIds.push(post.id);
      const context = await prepareContext(await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile && engine !== "firefox", hasTouch: mobile }), base);
      await context.route("**/api/admin/ai/services", (route) => route.fulfill({ json: { services: [] } }));
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${base}/admin/login?next=${encodeURIComponent(`/admin/blog/${post.id}`)}`, { waitUntil: "networkidle" });
      await page.getByLabel("E-posta").fill(email);
      await page.getByLabel("Şifre", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Giriş Yap" }).click();
      await page.waitForURL(new RegExp(`/admin/blog/${post.id}$`), { timeout: 30_000 });
      await page.getByRole("article", { name: "Yazı tuvali" }).waitFor({ timeout: 30_000 });
      const bar = mobile ? page.locator("[class*=mobileBar]") : page.locator("header");
      const tap = (locator) => (mobile ? locator.tap() : locator.click());

      // Sayfa gerçekten tıklanabiliyor mu: Önizle aç/kapat.
      const interactive = async () => {
        const toggle = page.getByRole("button", { name: /^(Önizle|Düzenle)$/ }).last();
        const read = () => toggle.getAttribute("aria-pressed").catch(() => null);
        const settle = async (from) => {
          for (let i = 0; i < 30; i += 1) {
            const value = await read();
            if (value !== from) return value;
            await page.waitForTimeout(100);
          }
          return from;
        };
        const before = await read();
        if (!(await toggle.click({ timeout: 4000 }).then(() => true, () => false))) return false;
        const after = await settle(before);
        if (after === before) return false;
        await toggle.click({ timeout: 4000 });
        return (await settle(after)) === before;
      };
      const verify = async (label) => {
        await page.waitForTimeout(350);
        const state = await coverage(page);
        const clickable = await interactive();
        check(state.openDialogs === 0 && state.inert === 0 && state.hits.length === 0 && !state.bodyLocked && clickable, `${label}: örten katman yok, sayfa tıklanabilir ${JSON.stringify({ ...state, clickable })}`);
        if (!clickable || state.hits.length) await page.screenshot({ path: join(out, `katman-${engine}-${w}-${label.replace(/\W+/g, "-")}.png`) });
      };

      // 1) Görseller penceresi: aç → kapat (X)
      await tap(bar.getByRole("button", { name: "Görseller", exact: true }));
      let dialog = page.getByRole("dialog", { name: "Görseller" });
      await dialog.waitFor();
      await tap(dialog.getByRole("button", { name: "Stüdyoyu kapat" }));
      await verify("Görseller kapatıldı");

      // 2) AI ile Yaz → Metin ekle → yaz → kapat
      if (mobile) await tap(bar.getByRole("button", { name: "AI ile Yaz" }));
      else {
        await page.getByRole("button", { name: "AI Blog Stüdyosu" }).first().click();
      }
      dialog = page.getByRole("dialog", { name: "AI Blog Stüdyosu" });
      await dialog.waitFor();
      await tap(dialog.getByRole("button", { name: /Metin veya not ekle/ }));
      await dialog.getByLabel("Metin ya da not").fill("Bu bir deneme notudur. Kapatınca sayfa kilitli kalmamalı ve beyaz bir katman çıkmamalı.");
      await tap(dialog.getByRole("button", { name: "Stüdyoyu kapat" }));
      await verify("AI ile Yaz → Metin ekle kapatıldı");

      // 3) Esc ile kapatma (masaüstü)
      if (!mobile) {
        await page.getByRole("button", { name: "Görseller", exact: true }).click();
        await page.getByRole("dialog", { name: "Görseller" }).waitFor();
        await page.keyboard.press("Escape");
        await verify("Görseller Esc ile kapatıldı");
      }

      // 4) Görseller → ChatGPT ile elle üretim paneli → kapat (yeni bölüm ekranı)
      if (mobile) await tap(bar.getByRole("button", { name: "Görseller", exact: true }));
      else await page.getByRole("button", { name: "Görseller", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Görseller" });
      await dialog.locator("[data-section=cover]").waitFor({ timeout: 20_000 });
      await tap(dialog.locator("[data-section=cover]").getByRole("button", { name: /Kapak oluştur \(ChatGPT\)/ }));
      await dialog.getByTestId("handoff-panel").waitFor();
      await tap(dialog.getByTestId("handoff-panel").getByRole("button", { name: "Paneli kapat" }));
      await tap(dialog.getByRole("button", { name: "Bitti" }));
      await verify("Görseller (ChatGPT paneli) kapatıldı");

      // 4b) Sayfa ayarları → kapak → "Yapay zekâyla oluştur" penceresi → kapat
      if (mobile) await tap(bar.getByRole("button", { name: "Ayarlar" }));
      await tap(page.getByRole("tab", { name: "Sayfa Ayarları" }));
      await tap(page.locator("section[aria-labelledby=set-cover]").getByRole("button", { name: "Yapay zekâyla oluştur" }));
      dialog = page.getByRole("dialog", { name: "Kapak görselini yapay zekâyla oluştur" });
      await dialog.waitFor();
      await tap(dialog.getByRole("button", { name: "Kapat" }));
      if (mobile) await tap(page.getByRole("button", { name: "Ayarları kapat" }));
      await verify("Yapay zekâyla oluştur penceresi kapatıldı");

      // 5) Bağlantı paneli: paragrafta bağlantı ekle → kaydet
      const text = page.locator('[data-block-id="t1ovl0001"]');
      await tap(text);
      const editor = text.locator(".ProseMirror");
      await editor.waitFor();
      await editor.click();
      await page.keyboard.press(process.platform === "darwin" && engine === "webkit" ? "Meta+A" : "Control+A");
      const linkButton = text.getByRole("button", { name: /Bağlantı/ }).first();
      if (await linkButton.count()) {
        await tap(linkButton);
        const input = text.getByRole("textbox", { name: "Bağlantı adresi" }).first();
        if (await input.count()) {
          await input.fill("https://example.com");
          await input.press("Enter");
        }
      }
      await tap(page.getByRole("textbox", { name: "Yazı başlığı" }));
      await verify("Bağlantı paneli kapatıldı");
      check(errors.length === 0, `JS hatası yok ${errors.join(" | ").slice(0, 200)}`);
      await context.close();
    }
  }
} catch (failure) {
  failures++;
  console.log(`  FAIL beklenmeyen hata: ${failure.message.split("\n")[0]} ${(failure.message.match(/waiting for (.+)/) ?? [])[1]?.slice(0, 160) ?? ""}`);
  for (const browser of browsers) for (const context of browser.contexts()) for (const open of context.pages()) await open.screenshot({ path: join(out, `hata-${Date.now()}.png`) }).catch(() => {});
} finally {
  for (const browser of browsers) await browser.close();
  if (postIds.length) await service.from("blog_posts").delete().in("id", postIds);
  await service.auth.admin.deleteUser(user.user.id);
  console.log(`\ntemizlik: tamam · ekran görüntüleri: ${out}`);
  console.log(failures ? `\n${failures} kontrol başarısız` : "\nTÜM KONTROLLER GEÇTİ");
  process.exitCode = failures ? 1 : 0;
}
