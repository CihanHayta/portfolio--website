// Sürükle-bırak — GERÇEK editör ve test veritabanı (:3100), sahte yanıt yok.
//   node scripts/supabase/dev-test.mjs   (ayrı terminalde)
//   node tests/e2e/dnd.e2e.mjs
// Masaüstü: fare (Pointer Events). Telefon: CDP ile GERÇEK dokunma olayları
// (touchStart/touchMove/touchEnd → pointerType "touch").
// Kontroller: blok taşıma, paragraflar arasına bırakma (metin bölünür), Esc ile
// iptal, "Konuma taşı", kütüphaneden dokunmatik sürükleme, çift tetiklenme yok,
// geri al / ileri al, otomatik kayıt → yenileme → aynı sıra, önizlemede aynı sıra.

import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { projectKeys } from "../../scripts/supabase/_api.mjs";
import { resolveRef } from "../../scripts/supabase/project.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const out = process.env.QA_OUT ?? mkdtempSync(join(tmpdir(), "persona-dnd-"));
const VIEWPORTS = (process.env.ONLY ?? "1440,390").split(",").map((w) => [Number(w), { 390: 844, 430: 932, 820: 1180, 1440: 900 }[w] ?? 900]);
const RUN = `e2e-dnd-${Date.now().toString(36)}`;
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
await service.from("blog_admins").insert({ user_id: user.user.id, display_name: "E2E DnD" }).throwOnError();

const para = (value) => ({ type: "paragraph", content: [{ type: "text", text: value }] });
const BLOCKS = [
  { id: "t1paragr1", type: "text", props: { doc: { type: "doc", content: [para("Birinci paragraf."), para("İkinci paragraf."), para("Üçüncü paragraf.")] } } },
  { id: "h1bolumaa", type: "heading", props: { text: "Bölüm A", level: "2", href: "", align: "left" } },
  { id: "t2bolumaa", type: "text", props: { doc: { type: "doc", content: [para("Bölüm A metni.")] } } },
  { id: "imgblok01", type: "image", props: {} },
  { id: "h2bolumbb", type: "heading", props: { text: "Bölüm B", level: "2", href: "", align: "left" } },
  { id: "q1alinti1", type: "quote", props: { text: "Kısa bir alıntı." } },
];

const browser = await chromium.launch();
const postIds = [];
try {
  for (const [w, h] of VIEWPORTS) {
    console.log(`\n=== ${w}x${h}`);
    const mobile = w < 1024;
    const { data: post } = await service.from("blog_posts").insert({ title: `E2E DnD ${w}`, slug: `${RUN}-${w}`, content: { type: "blocks", version: 1, blocks: BLOCKS }, author_id: user.user.id }).select("id").single().throwOnError();
    postIds.push(post.id);
    const context = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
    await page.goto(`${base}/admin/login?next=${encodeURIComponent(`/admin/blog/${post.id}`)}`, { waitUntil: "networkidle" });
    await page.getByLabel("E-posta").fill(email);
    await page.getByLabel("Şifre", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    await page.waitForURL(new RegExp(`/admin/blog/${post.id}$`), { timeout: 30_000 });
    const canvas = page.getByRole("article", { name: "Yazı tuvali" });
    await canvas.waitFor({ timeout: 30_000 });

    const order = () => canvas.evaluate((el) => [...el.querySelectorAll("[data-block-id]")].map((frame) => frame.dataset.blockId));
    const frame = (id) => canvas.locator(`[data-block-id="${id}"]`);
    const select = async (id) => {
      const target = frame(id).locator("[class*=frameLabel]").first();
      await frame(id).scrollIntoViewIfNeeded();
      if (mobile) await frame(id).tap({ position: { x: 20, y: 10 } });
      else await frame(id).click({ position: { x: 20, y: 10 } });
      await frame(id).locator("[data-drag-handle]").waitFor();
      return target;
    };
    const center = async (locator) => {
      const box = await locator.boundingBox();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    // Y: iki bloğun (ya da paragrafın) arasındaki çizgi
    const between = async (aId, bId) => {
      const a = await frame(aId).boundingBox();
      const b = await frame(bId).boundingBox();
      return { x: a.x + a.width / 2, y: (a.y + a.height + b.y) / 2 };
    };
    const cdp = mobile ? await context.newCDPSession(page) : null;
    const drag = async (from, to, { cancel = false } = {}) => {
      if (mobile) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] });
        for (let step = 1; step <= 12; step += 1) {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + ((to.x - from.x) * step) / 12, y: from.y + ((to.y - from.y) * step) / 12 }] });
        }
        await page.waitForTimeout(80);
        if (cancel) await page.keyboard.press("Escape");
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      } else {
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: 12 });
        await page.waitForTimeout(80);
        if (cancel) await page.keyboard.press("Escape");
        await page.mouse.up();
      }
      await page.waitForTimeout(150);
    };
    const original = await order();

    // 1) Blok taşıma
    await select("h2bolumbb");
    const handle = frame("h2bolumbb").locator("[data-drag-handle]");
    await drag(await center(handle), await between("t1paragr1", "h1bolumaa"));
    check(JSON.stringify(await order()) === JSON.stringify(["t1paragr1", "h2bolumbb", "h1bolumaa", "t2bolumaa", "imgblok01", "q1alinti1"]), `${mobile ? "dokunarak" : "fareyle"} blok taşındı (Bölüm B, Bölüm A'nın üstüne)`);
    check(await page.locator("[class*=dropLine]").isHidden(), "bırakma çizgisi bırakınca kayboldu");

    // 2) Geri al / ileri al
    const undo = page.getByRole("button", { name: "Geri al" }).first();
    const redo = page.getByRole("button", { name: "İleri al" }).first();
    await undo.click();
    check(JSON.stringify(await order()) === JSON.stringify(original), "geri al: tek adımda eski sıra");
    await redo.click();
    check((await order())[1] === "h2bolumbb", "ileri al: taşıma geri geldi");
    await undo.click();

    // 3) Paragraflar arasına bırakma (metin bölünür)
    await select("imgblok01");
    const paragraphs = frame("t1paragr1").locator("[data-doc-root] > *");
    const p1 = await paragraphs.nth(0).boundingBox();
    const p2 = await paragraphs.nth(1).boundingBox();
    await drag(await center(frame("imgblok01").locator("[data-drag-handle]")), { x: p1.x + p1.width / 2, y: (p1.y + p1.height + p2.y) / 2 });
    const split = await order();
    const texts = await canvas.evaluate((el) => [...el.querySelectorAll("[data-block-id]")].map((frameEl) => frameEl.innerText.replace(/\s+/g, " ").trim().slice(0, 40)));
    check(split[0] === "t1paragr1" && split[1] === "imgblok01" && split.length === original.length + 1 && texts[0].includes("Birinci") && !texts[0].includes("İkinci") && texts[2].includes("İkinci") && texts[2].includes("Üçüncü"), "görsel iki paragrafın arasına girdi; metin kayıpsız ikiye bölündü");
    check(new Set(split).size === split.length, "blok kimlikleri tekil (çift kayıt yok)");

    // 4) Esc ile iptal
    const beforeCancel = await order();
    await select("q1alinti1");
    await drag(await center(frame("q1alinti1").locator("[data-drag-handle]")), await between(beforeCancel[0], beforeCancel[1]), { cancel: true });
    check(JSON.stringify(await order()) === JSON.stringify(beforeCancel), "Esc ile iptal: sıra değişmedi");

    // 5) Konuma taşı (klavye/erişilebilir alternatif)
    await select("q1alinti1");
    await frame("q1alinti1").getByLabel("Konuma taşı").selectOption({ label: "En başa" });
    check((await order())[0] === "q1alinti1", "“Konuma taşı” ile en başa taşındı");

    // 6) Telefonda kütüphaneden sürükleme
    if (mobile) {
      await page.locator("[class*=mobileBar]").getByRole("button", { name: "Bloklar" }).tap();
      const card = page.locator("[data-palette=quote]");
      await card.scrollIntoViewIfNeeded();
      const grip = card.locator("[class*=cardGrip]");
      const count = (await order()).length;
      const pos = await order();
      const gripBox = await grip.boundingBox();
      // Hedef: ilk iki bloğun arası (çekmece sürükleme başlayınca kenara çekilir).
      const first = await frame(pos[0]).boundingBox();
      await drag({ x: gripBox.x + gripBox.width / 2, y: gripBox.y + gripBox.height / 2 }, { x: Math.min(w - 40, first.x + first.width / 2 + 60), y: first.y + first.height + 4 });
      const after = await order();
      check(after.length === count + 1 && after[0] === pos[0] && !pos.includes(after[1]), "kütüphaneden dokunarak sürüklenen blok tek kez ve doğru yere eklendi");
      check(await page.locator("[class*=backdrop]").count() === 0 || await page.locator("[class*=backdrop]").isHidden(), "çekmece bırakınca kapandı");
    }
    check(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, "yatay taşma yok");
    await page.screenshot({ path: join(out, `dnd-${w}.png`) });

    // 7) Kayıt → yenileme → aynı sıra; önizlemede aynı sıra
    const finalOrder = await order();
    let saved = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      saved = (await service.from("blog_posts").select("content").eq("id", post.id).single()).data.content.blocks.map((block) => block.id);
      if (JSON.stringify(saved) === JSON.stringify(finalOrder)) break;
      await page.waitForTimeout(500);
    }
    check(JSON.stringify(saved) === JSON.stringify(finalOrder), "otomatik kayıt: Supabase'deki sıra ekranla aynı");
    await page.reload({ waitUntil: "networkidle" });
    await canvas.waitFor();
    check(JSON.stringify(await order()) === JSON.stringify(finalOrder), "yenilemeden sonra aynı sıra");
    await page.goto(`${base}/admin/blog/${post.id}/preview`, { waitUntil: "networkidle" });
    const previewText = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    const iA = previewText.indexOf("Bölüm A");
    const iB = previewText.indexOf("Bölüm B");
    const iQ = previewText.indexOf("Kısa bir alıntı");
    const i1 = previewText.indexOf("Birinci paragraf");
    const i2 = previewText.indexOf("İkinci paragraf");
    check(iQ !== -1 && iQ < i1 && i1 < i2 && i2 < iA && iA < iB, "önizleme (herkese açık görünüm) aynı sırayı gösteriyor");
    check(errors.length === 0, `JS hatası yok ${errors.join(" | ").slice(0, 200)}`);
    await context.close();
  }
} catch (failure) {
  failures++;
  console.log(`  FAIL beklenmeyen hata: ${failure.message.split("\n")[0]} ${(failure.message.match(/waiting for (.+)/) ?? [])[1]?.slice(0, 160) ?? ""}`);
  for (const context of browser.contexts()) for (const open of context.pages()) await open.screenshot({ path: join(out, `hata-${Date.now()}.png`) }).catch(() => {});
} finally {
  await browser.close();
  if (postIds.length) await service.from("blog_posts").delete().in("id", postIds);
  await service.auth.admin.deleteUser(user.user.id);
  const left = (await service.from("blog_posts").select("id").like("slug", `${RUN}%`)).data ?? [];
  console.log(`\ntemizlik: ${left.length === 0 ? "tamam" : `EKSİK (${left.length})`} · ekran görüntüleri: ${out}`);
  if (left.length) failures++;
  console.log(failures ? `\n${failures} kontrol başarısız` : "\nTÜM KONTROLLER GEÇTİ");
  process.exitCode = failures ? 1 : 0;
}
