// Erişilebilirlik taraması (axe-core, WCAG 2.2 A/AA) + klavye odağı görünürlüğü.
//   node scripts/supabase/dev-test.mjs   (ayrı terminalde) && node tests/e2e/a11y.e2e.mjs
//   BASE_URL=https://<preview>.vercel.app node scripts/e2e/with-preview-bypass.mjs node tests/e2e/a11y.e2e.mjs
// Ekranlar: ana sayfa, blog listesi, blog yazısı, giriş, yönetim paneli, editör,
// AI Blog Stüdyosu, görsel stüdyosu, AI Servisleri — 1440 px ve 390 px.
// Yönetim ekranları için TEST projesinde geçici yönetici açılır, sonunda silinir.
// Kritik ve ciddi bulgular testi başarısız yapar; orta/düşük olanlar listelenir.

import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { projectKeys } from "../../scripts/supabase/_api.mjs";
import { resolveRef } from "../../scripts/supabase/project.mjs";
import { prepareContext, targetFetch } from "./_target.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const RUN = `e2e-${Date.now().toString(36)}`;
const ref = resolveRef("test");
let failures = 0;
const minor = [];
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
await service.from("blog_admins").insert({ user_id: userId, display_name: "E2E Erişilebilirlik" }).throwOnError();

const sitemap = await (await targetFetch(base, "/sitemap.xml")).text();
const postPath = `/blog/${(sitemap.match(/<loc>[^<]*\/blog\/([^<?]+)<\/loc>/) ?? [])[1] ?? ""}`;
// Koyu temalı, kaynakçalı, SSS'li geçici yazı (makale sonu bölümleri de taransın).
const darkSlug = `${RUN}-koyu`;
await service.from("blog_posts").insert({
  title: `E2E erişilebilirlik koyu ${RUN}`,
  slug: darkSlug,
  excerpt: "Koyu tema erişilebilirlik taraması",
  content: {
    type: "blocks",
    version: 1,
    blocks: [
      { id: "a11yh0001", type: "heading", props: { text: "Birinci bölüm", level: "2", href: "", align: "left" } },
      { id: "a11yt0001", type: "text", props: { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Gövde metni [1] ve " }, { type: "text", text: "vurgu", marks: [{ type: "accent" }] }] }] } } },
      { id: "a11yh0002", type: "heading", props: { text: "İkinci bölüm", level: "2", href: "", align: "left" } },
      { id: "a11yf0001", type: "faq", props: { title: "Sık sorulan sorular", schema: false, items: [{ id: "a11yq0001", question: "Soru bir mi?", answer: "Cevap bir." }] } },
    ],
    meta: { theme: "dark", sources: [{ id: "k1", url: "https://kaynak.example.com/a", title: "Kaynak A", siteName: "Kaynak", kind: "user" }] },
  },
  content_text: "Gövde metni",
  reading_minutes: 1,
  status: "published",
  published_at: new Date(Date.now() - 60_000).toISOString(),
}).throwOnError();

async function scan(page, label) {
  // Giriş animasyonları (ör. başlığın saydamlıktan gelişi) bitmeden renk ölçülmez.
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running" || animation.effect?.getTiming().iterations === Infinity), null, { timeout: 5_000 }).catch(() => {});
  await page.addScriptTag({ path: axePath });
  const result = await page.evaluate(async () =>
    window.axe.run(document, {
      exclude: [["nextjs-portal"]], // yalnızca geliştirme sunucusunun kendi göstergesi
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      resultTypes: ["violations"],
    })
  );
  const serious = result.violations.filter((violation) => ["critical", "serious"].includes(violation.impact));
  for (const violation of result.violations.filter((item) => !serious.includes(item))) minor.push(`${label}: ${violation.id} (${violation.impact}, ${violation.nodes.length})`);
  const describe = (node) => {
    const data = node.any?.[0]?.data;
    return `${node.target.join(" ")}${data?.contrastRatio ? ` (${data.fgColor} / ${data.bgColor} = ${data.contrastRatio}:1, gereken ${data.expectedContrastRatio})` : ""}`;
  };
  const detail = serious.map((violation) => `${violation.id}[${violation.impact}] ×${violation.nodes.length}: ${violation.nodes.slice(0, 3).map(describe).join(" ; ")}`).join(" | ");
  check(serious.length === 0, `${label}: kritik/ciddi erişilebilirlik bulgusu yok ${detail.slice(0, 1200)}`);
}

// Klavye: ilk birkaç Tab durağının görünür bir odak göstergesi var mı?
async function focusVisible(page, label, stops = 6) {
  const missing = [];
  for (let index = 0; index < stops; index++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) return null;
      const style = getComputedStyle(element);
      const visible = (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== "none";
      return { visible, name: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 30) || element.tagName };
    });
    if (info && !info.visible) missing.push(info.name);
  }
  check(missing.length === 0, `${label}: klavye odağı görünür ${missing.length ? `(göstergesiz: ${missing.join(", ")})` : ""}`);
}

const browser = await chromium.launch();
try {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    console.log(`\n=== ${width}px`);
    const context = await prepareContext(await browser.newContext({ viewport: { width, height }, isMobile: width < 1024, hasTouch: width < 1024 }), base);
    const page = await context.newPage();

    for (const [path, label] of [["/", "Ana sayfa"], ["/blog", "Blog listesi"], [postPath, "Blog yazısı"], [`/blog/${darkSlug}`, "Blog yazısı (koyu tema)"], ["/admin/login", "Yönetici girişi"]]) {
      await page.goto(base + path, { waitUntil: "networkidle" });
      await scan(page, `${width} ${label}`);
    }
    await page.goto(`${base}/admin/login`, { waitUntil: "networkidle" });
    await focusVisible(page, `${width} Yönetici girişi`, 4);

    await page.getByLabel("E-posta").fill(email);
    await page.getByLabel("Şifre", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    await page.waitForURL(/\/admin\/blog$/, { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await scan(page, `${width} Yönetim paneli`);

    await page.goto(`${base}/admin/blog/new`, { waitUntil: "networkidle" });
    await page.getByRole("textbox", { name: "Yazı başlığı" }).fill(`E2E erişilebilirlik ${RUN}`);
    await scan(page, `${width} Blog editörü`);
    await focusVisible(page, `${width} Blog editörü`);

    const aiWrite = width < 1024 ? page.locator("[class*=mobileBar]").getByRole("button", { name: "AI ile Yaz" }) : page.getByRole("button", { name: "AI Blog Stüdyosu" }).first();
    await aiWrite.click();
    const studio = page.getByRole("dialog").first();
    await studio.waitFor({ timeout: 15_000 });
    await scan(page, `${width} AI Blog Stüdyosu`);
    await page.keyboard.press("Escape");
    await studio.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});

    // Görseller (bölüm sırası) + ChatGPT ile elle üretim paneli
    if (width < 1024) await page.locator("[class*=mobileBar]").getByRole("button", { name: "Görseller" }).click();
    else await page.getByRole("button", { name: "Görseller", exact: true }).click();
    const images = page.getByRole("dialog", { name: "Görseller" });
    await images.locator("[data-section=cover]").waitFor({ timeout: 20_000 });
    await scan(page, `${width} Görseller`);
    await images.locator("[data-section=cover]").getByRole("button", { name: /Kapak oluştur \(ChatGPT\)/ }).click();
    await images.getByTestId("handoff-panel").waitFor();
    await scan(page, `${width} ChatGPT ile elle üretim paneli`);
    await images.getByRole("button", { name: "Bitti" }).click();

    // Kapak alanında "Yapay zekâyla oluştur" penceresi
    if (width < 1024) await page.locator("[class*=mobileBar]").getByRole("button", { name: "Ayarlar" }).click();
    await page.getByRole("tab", { name: "Sayfa Ayarları" }).click();
    await scan(page, `${width} Sayfa ayarları (tema, kaynakça)`);
    await page.locator("section[aria-labelledby=set-cover]").getByRole("button", { name: "Yapay zekâyla oluştur" }).click();
    const aiDialog = page.getByRole("dialog", { name: "Kapak görselini yapay zekâyla oluştur" });
    await aiDialog.waitFor();
    await scan(page, `${width} Yapay zekâyla oluştur penceresi`);
    await aiDialog.getByRole("button", { name: "Kapat" }).click();
    if (width < 1024) await page.getByRole("button", { name: "Ayarları kapat" }).click();

    await page.goto(`${base}/admin/blog/ai-servisleri`, { waitUntil: "networkidle" });
    await scan(page, `${width} AI Servisleri`);
    await page.getByRole("button", { name: "Çıkış yap" }).click().catch(() => {});
    await context.close();

    // Ziyaretçinin cihazı koyu modda: blog listesi koyu tema
    const darkContext = await prepareContext(await browser.newContext({ viewport: { width, height }, colorScheme: "dark", isMobile: width < 1024, hasTouch: width < 1024 }), base);
    const darkPage = await darkContext.newPage();
    await darkPage.goto(`${base}/blog`, { waitUntil: "networkidle" });
    await scan(darkPage, `${width} Blog listesi (koyu mod)`);
    await darkContext.close();
  }
} catch (error) {
  failures++;
  console.log(`  FAIL beklenmeyen hata: ${error.message.split("\n")[0]}`);
} finally {
  await browser.close();
  const posts = (await service.from("blog_posts").select("id").like("title", `%${RUN}%`)).data ?? [];
  if (posts.length) await service.from("blog_posts").delete().in("id", posts.map((post) => post.id));
  await service.auth.admin.deleteUser(userId);
  if (minor.length) console.log(`\nOrta/düşük önemli bulgular (bilgi):\n- ${[...new Set(minor)].join("\n- ")}`);
  console.log(failures ? `\n${failures} kontrol başarısız` : "\nTÜM KONTROLLER GEÇTİ");
  process.exitCode = failures ? 1 : 0;
}
