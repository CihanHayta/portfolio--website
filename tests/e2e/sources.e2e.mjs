// Kaynakça — GERÇEK editör ve test veritabanı (:3100).
//   node scripts/supabase/dev-test.mjs   (ayrı terminalde)
//   node tests/e2e/sources.e2e.mjs
// Gerçek: kaynak ekleme/düzenleme/sıralama/silme, otomatik kayıt (content.meta),
// yenileme sonrası geri yükleme, yayın kuralı (arayüz + SUNUCU), yayımlanmış sayfada
// numaralı kaynakça ve [n] atıfları (Parti C bileşenleri varsa).
// SAHTE (raporda ayrı): AI Blog Stüdyosu'nun okuyucu/şablon yanıtları — okunan kaynağın
// kaynakçaya otomatik girdiğini doğrulamak için (kota harcanmaz).

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
const out = process.env.QA_OUT ?? mkdtempSync(join(tmpdir(), "persona-sources-"));
const VIEWPORTS = (process.env.ONLY ?? "390,1440").split(",").map(Number);
const RUN = `e2e-src-${Date.now().toString(36)}`;
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
await service.from("blog_admins").insert({ user_id: user.user.id, display_name: "E2E Kaynak" }).throwOnError();
const before = (await service.from("blog_posts").select("id", { count: "exact", head: true })).count;

const SOURCE_URL = "https://kaynak.example.com/blog/meta-butce";
const DRAFT = {
  blocks: [
    { id: "sh1aaaaaa", type: "heading", props: { text: "Bütçe nasıl planlanır", level: "2", href: "", align: "left" } },
    { id: "st1aaaaaa", type: "text", props: { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Test bütçesi iki hafta sürer [1]. Ölçüm olmadan artış yapılmaz [3]." }] }] } } },
  ],
  fields: { title: `Kaynaklı yazı ${RUN}`, slug: "", excerpt: "Özet", seoTitle: "Kaynaklı yazı", seoDescription: "Açıklama", tags: [], categoryId: "" },
  stats: { words: 900, targetWords: 900, auto: true, unfilled: 0, dropped: 0 },
  warnings: [],
  coverage: null,
  sources: [{ kind: "url", url: SOURCE_URL, title: "Meta Ads Budget Guide", siteName: "Kaynak Blog", sectionUrl: "https://kaynak.example.com/blog/", sectionLabel: "Blog" }],
};

const browser = await chromium.launch();
try {
  for (const w of VIEWPORTS) {
    const h = w < 1024 ? 844 : 900;
    const mobile = w < 1024;
    console.log(`\n=== ${w}x${h}`);
    const context = await prepareContext(await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile }), base);
    await context.route("**/api/admin/ai/source", (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: { providers: [{ key: "local", available: true }] } });
      const lines = [
        { type: "stage", stage: "local", label: "Yerel okuyucu", status: "start" },
        { type: "result", source: { kind: "url", provider: "local", url: SOURCE_URL, title: "Meta Ads Budget Guide", siteName: "Kaynak Blog", sectionUrl: "https://kaynak.example.com/blog/", sectionLabel: "Blog", text: "Metin ".repeat(400), truncated: false, images: [], wordCount: 400 }, attempts: [] },
      ];
      return route.fulfill({ status: 200, contentType: "application/x-ndjson", body: lines.map((line) => JSON.stringify(line)).join("\n") + "\n" });
    });
    await context.route("**/api/admin/ai/similar", (route) => route.fulfill({ json: { status: "ok", matches: [], top: null, archive: { scanned: 0, total: 0, limited: false, published: 0, scheduled: 0, drafts: 0 }, profile: null, method: "local", notes: [] } }));
    await context.route("**/api/admin/ai/template", (route) => route.fulfill({ json: DRAFT }));

    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/admin/login?next=/admin/blog/new`, { waitUntil: "networkidle" });
    await page.getByLabel("E-posta").fill(email);
    await page.getByLabel("Şifre", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    await page.waitForURL(/\/admin\/blog\/new/, { timeout: 30_000 });
    await page.getByRole("article", { name: "Yazı tuvali" }).waitFor({ timeout: 30_000 });
    const tap = (locator) => (mobile ? locator.tap() : locator.click());

    // 1) Stüdyoda okunan kaynak kaynakçaya girer (AI yanıtları sahte)
    if (mobile) await tap(page.locator("[class*=mobileBar]").getByRole("button", { name: "AI ile Yaz" }));
    else await page.getByRole("button", { name: "AI Blog Stüdyosu" }).first().click();
    const studio = page.getByRole("dialog", { name: "AI Blog Stüdyosu" });
    await studio.waitFor();
    await studio.getByLabel("Kaynak linki").fill(SOURCE_URL);
    await tap(studio.getByRole("button", { name: "Analiz Et ve Taslağı Hazırla" }));
    await page.waitForFunction(() => document.querySelectorAll("[data-block-id]").length >= 2, null, { timeout: 60_000 });
    await studio.waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
    if (await studio.isVisible().catch(() => false)) {
      const apply = studio.getByRole("button", { name: /Editöre aktar/ });
      if (await apply.count()) await tap(apply);
    }
    const openPage = async () => {
      if (mobile) await tap(page.locator("[class*=mobileBar]").getByRole("button", { name: "Ayarlar" }));
      await page.getByRole("tab", { name: "Sayfa Ayarları" }).click();
      return page.getByRole("region", { name: "Kaynakça" });
    };
    let sources = await openPage();
    await sources.waitFor();
    const first = await sources.locator("ol > li").first().innerText().catch(() => "");
    check(first.includes("[1]") && first.includes("Meta Ads Budget Guide") && first.includes("Kaynak Blog"), "okunan kaynak kaynakçaya otomatik girdi (başlık + site adı)");
    check((await sources.innerText()).includes("[3]") && /karşılığı olmayan atıf/.test(await sources.innerText()), "metindeki [3] atıfının kaynakçada karşılığı olmadığı uyarıldı");

    // 2) Elle ekleme, geçersiz adres reddi, düzenleme, sıralama
    await sources.getByRole("button", { name: "Kaynak ekle" }).click();
    await sources.getByLabel("Kaynak adresi (URL)").fill("javascript:alert(1)");
    await sources.getByRole("button", { name: "Kaynağı ekle" }).click();
    check(/Geçerli bir http\(s\) adresi/.test(await sources.innerText()), "geçersiz adres reddedildi");
    await sources.getByLabel("Kaynak adresi (URL)").fill("https://arastirma.example.org/rapor-2026");
    await sources.getByLabel("Başlık").fill("Dijital Reklam Raporu 2026");
    await sources.getByRole("button", { name: "Kaynağı ekle" }).click();
    await sources.getByLabel("2. kaynağı yukarı taşı").click();
    const order = await sources.locator("ol > li strong").allInnerTexts();
    check(order[0] === "Dijital Reklam Raporu 2026" && order[1] === "Meta Ads Budget Guide", "kaynaklar yeniden sıralandı");
    await sources.getByLabel("1. kaynağı düzenle").click();
    await sources.getByLabel("Site adı (isteğe bağlı)").fill("Araştırma Enstitüsü");
    await sources.getByRole("button", { name: "Kaydet" }).click();
    check((await sources.locator("ol > li").first().innerText()).includes("Araştırma Enstitüsü"), "kaynak düzenlendi");
    if (mobile) await page.getByRole("button", { name: "Ayarları kapat" }).click();

    // 3) Kayıt → yenileme → kalıcı (content.meta)
    await page.getByRole("button", { name: "Taslak Kaydet" }).click();
    await page.waitForURL(/\/admin\/blog\?kaydedildi=/, { timeout: 30_000 });
    const postId = new URL(page.url()).searchParams.get("kaydedildi");
    const row = (await service.from("blog_posts").select("content").eq("id", postId).single()).data;
    const meta = row.content.meta ?? {};
    check(meta.sources?.length === 2 && meta.sources[0].siteName === "Araştırma Enstitüsü" && meta.sources[1].sectionUrl === "https://kaynak.example.com/blog/", "kaynakça Supabase'de (content.meta) sırasıyla kayıtlı; bölüm adresi korunuyor");
    await page.goto(`${base}/admin/blog/${postId}`, { waitUntil: "networkidle" });
    await page.getByRole("textbox", { name: "Yazı başlığı" }).waitFor();
    sources = await openPage();
    check((await sources.locator("ol > li").count()) === 2, "yenilemeden sonra kaynakça geri geldi");

    // 4) Sunucu kuralı: kaynakları silip yayın düğmesini zorla açmak işe yaramaz
    await sources.getByLabel("2. kaynağı sil").click();
    await sources.getByLabel("1. kaynağı sil").click();
    check(/Kaynak eklenmedi/.test(await sources.innerText()), "kaynak kalmayınca uyarı görünüyor");
    if (mobile) await page.getByRole("button", { name: "Ayarları kapat" }).click();
    await page.waitForTimeout(3500);
    const publishButton = mobile ? page.getByRole("navigation", { name: "Yazı işlemleri" }).getByRole("button", { name: "Yayınla" }) : page.getByRole("button", { name: "Yayınla", exact: true }).first();
    await publishButton.click();
    const confirm = page.getByRole("dialog", { name: "Yazı yayınlansın mı?" });
    await confirm.waitFor();
    const go = confirm.getByRole("button", { name: "Yayınla" });
    check(await go.isDisabled(), "kaynak yokken onay penceresinde yayın pasif");
    // Kurcalanmış istemci: arayüzde beyan açılır, ama sunucuya giden kayıt isteğinde
    // beyan ağ katmanında silinir. Sunucu yine de yayını reddetmeli.
    let tampered = 0;
    await page.route(`**/admin/blog/${postId}`, async (route) => {
      const request = route.request();
      const body = request.postData() ?? "";
      if (request.method() === "POST" && request.headers()["next-action"] && body.includes('"sourcesWaived":true')) {
        tampered += 1;
        return route.continue({ postData: body.replaceAll('"sourcesWaived":true', '"sourcesWaived":false') });
      }
      return route.continue();
    });
    await confirm.getByRole("switch", { name: /kendi deneyimime dayanıyor/ }).check();
    await go.click();
    await page.getByText(/kaynakçayı tamamla/).first().waitFor({ timeout: 20_000 });
    check(tampered > 0, "kayıt isteği ağ katmanında değiştirildi (beyan silindi)");
    await page.unroute(`**/admin/blog/${postId}`);
    const status = (await service.from("blog_posts").select("status").eq("id", postId).single()).data.status;
    check(status === "draft", "sunucu kaynakçasız yayını reddetti (yazı taslak kaldı)");
    await page.keyboard.press("Escape");
    check(errors.length === 0, `JS hatası yok ${errors.join(" | ").slice(0, 160)}`);
    await page.screenshot({ path: join(out, `kaynakca-${w}.png`) });
    await context.close();
  }
} catch (failure) {
  failures++;
  console.log(`  FAIL beklenmeyen hata: ${failure.message.split("\n")[0]} ${(failure.message.match(/waiting for (.+)/) ?? [])[1]?.slice(0, 160) ?? ""}`);
  for (const context of browser.contexts()) for (const open of context.pages()) await open.screenshot({ path: join(out, `hata-${Date.now()}.png`) }).catch(() => {});
} finally {
  await browser.close();
  const posts = (await service.from("blog_posts").select("id").eq("author_id", user.user.id)).data ?? [];
  if (posts.length) await service.from("blog_posts").delete().in("id", posts.map((post) => post.id));
  await service.auth.admin.deleteUser(user.user.id);
  const after = (await service.from("blog_posts").select("id", { count: "exact", head: true })).count;
  console.log(`\ntemizlik: ${after === before ? "tamam" : "EKSİK"} (yazı ${before}→${after}) · ekran görüntüleri: ${out}`);
  if (after !== before) failures++;
  console.log(failures ? `\n${failures} kontrol başarısız` : "\nTÜM KONTROLLER GEÇTİ");
  process.exitCode = failures ? 1 : 0;
}
