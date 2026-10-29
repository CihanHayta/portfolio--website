// AI ile Yaz — kalıcılık (GERÇEK) ve hata ekranları (SAHTE AI yanıtı).
//   node scripts/supabase/dev-test.mjs   (ayrı terminalde)
//   node tests/e2e/ai-write-flow.e2e.mjs
// GERÇEK: yeni yazı → not + 2 ekran görüntüsü özel kovaya kaydedilir (taslak
// kendiliğinden oluşur) → stüdyo kapanır → sayfa yenilenir → "Kaldığın yerden
// devam et" ile metin, ekran görüntüleri ve yaklaşımlar geri gelir.
// SAHTE (raporda ayrı): /api/admin/ai/screenshots, /similar, /template, /source
// yanıtları — yoğunluk (503), okuma hatası ve başarılı taslak senaryoları.

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
const out = process.env.QA_OUT ?? mkdtempSync(join(tmpdir(), "persona-write-"));
const VIEWPORTS = (process.env.ONLY ?? "390,1440").split(",").map(Number);
const RUN = `e2e-yaz-${Date.now().toString(36)}`;
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
await service.from("blog_admins").insert({ user_id: user.user.id, display_name: "E2E Yaz" }).throwOnError();
const before = (await service.from("blog_posts").select("id", { count: "exact", head: true })).count;

const NOTES = "Meta reklamlarında bütçe planlaması: önce hedef ve dönüşüm maliyeti belirlenir, sonra kampanya yapısı kurulur. Küçük bütçelerde tek kampanyayla başlamak, öğrenme aşamasını hızlandırır.";
const shot = async (name, shade) => {
  const path = join(out, name);
  writeFileSync(path, await sharp({ create: { width: 900, height: 1400, channels: 3, background: { r: shade, g: shade, b: shade } } }).png().toBuffer());
  return path;
};
const DRAFT = {
  blocks: [
    { id: "dh1aaaaaa", type: "heading", props: { text: "Bütçe nasıl planlanır", level: "2", href: "", align: "left" } },
    { id: "dt1aaaaaa", type: "text", props: { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Taslak metni." }] }] } } },
    { id: "dh2aaaaaa", type: "heading", props: { text: "Sık sorulan sorular", level: "2", href: "", align: "left" } },
  ],
  fields: { title: "Meta reklam bütçesi planlama", slug: "", excerpt: "Özet", seoTitle: "Meta reklam bütçesi", seoDescription: "Açıklama", tags: [], categoryId: "" },
  stats: { words: 950, targetWords: 900, auto: true, unfilled: 0, dropped: 0 },
  warnings: [],
  coverage: null,
};

const browser = await chromium.launch();
try {
  const shotA = await shot("ekran-1.png", 240);
  const shotB = await shot("ekran-2.png", 200);
  for (const w of VIEWPORTS) {
    const h = w < 1024 ? 844 : 900;
    const mobile = w < 1024;
    console.log(`\n=== ${w}x${h}`);
    const context = await prepareContext(await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile }), base);
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
    const log = { screenshots: [], template: [], similar: 0, mode: "busy" };
    await context.route("**/api/admin/ai/screenshots", async (route) => {
      log.screenshots.push(route.request().headers()["content-type"] ?? "");
      if (log.mode === "busy") return route.fulfill({ status: 503, json: { error: "Ücretsiz metin sağlayıcılarının hiçbiri yanıt veremedi (Gemini: yoğun; OVH AI Endpoints: zaman aşımı). Ücretli bir modele geçilmedi; taslağın korunuyor, biraz sonra yeniden dene.", kind: "busy" } });
      return route.fulfill({ json: { source: { kind: "screenshots", title: "Ekran görüntüleri", text: `${NOTES} `.repeat(6), wordCount: 180, images: [], screenshotCount: 2 }, model: "sahte" } });
    });
    await context.route("**/api/admin/ai/similar", (route) => {
      log.similar += 1;
      return route.fulfill({ json: { status: "ok", matches: [], top: null, archive: { scanned: 2, total: 2, limited: false, published: 2, scheduled: 0, drafts: 0 }, profile: null, method: "local", notes: [] } });
    });
    await context.route("**/api/admin/ai/template", async (route) => {
      log.template.push(JSON.parse(route.request().postData()));
      await new Promise((resolve) => setTimeout(resolve, 300));
      return route.fulfill({ json: DRAFT });
    });
    await context.route("**/api/admin/ai/source", async (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: { providers: [{ key: "local", available: true }, { key: "jina", available: true }, { key: "firecrawl", available: false, reason: "anahtar yok" }, { key: "browser", available: false, reason: "Vercel" }] } });
      const lines = [
        { type: "stage", stage: "local", label: "Yerel okuyucu", status: "start" },
        { type: "stage", stage: "local", label: "Yerel okuyucu", status: "thin" },
        { type: "fallback", error: "Sayfadan yeterli metin çıkarılamadı.", attempts: [{ stage: "local", label: "Yerel okuyucu", status: "thin" }, { stage: "jina", label: "Jina Reader", status: "failed" }] },
      ];
      return route.fulfill({ status: 200, contentType: "application/x-ndjson", body: lines.map((line) => JSON.stringify(line)).join("\n") + "\n" });
    });

    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && !/Failed to load resource|503/.test(m.text()) && errors.push(m.text()));
    await page.goto(`${base}/admin/login?next=/admin/blog/new`, { waitUntil: "networkidle" });
    await page.getByLabel("E-posta").fill(email);
    await page.getByLabel("Şifre", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    await page.waitForURL(/\/admin\/blog\/new/, { timeout: 30_000 });
    await page.getByRole("article", { name: "Yazı tuvali" }).waitFor({ timeout: 30_000 });
    const tap = (locator) => (mobile ? locator.tap() : locator.click());
    const openStudio = async () => {
      if (mobile) await tap(page.locator("[class*=mobileBar]").getByRole("button", { name: "AI ile Yaz" }));
      else await page.getByRole("button", { name: "AI Blog Stüdyosu" }).first().click();
      const dialog = page.getByRole("dialog", { name: "AI Blog Stüdyosu" });
      await dialog.waitFor();
      return dialog;
    };

    // 1) Metin + ekran görüntüleri + yaklaşımlar
    let studio = await openStudio();
    await tap(studio.getByRole("button", { name: /Metin veya not ekle/ }));
    await studio.getByLabel("Metin ya da not").fill(NOTES);
    await tap(studio.getByText("Ekran görüntüsünden ekle"));
    await studio.locator("input[type=file]").first().setInputFiles([shotA, shotB]);
    await studio.getByText("Taslağa kaydedildi").nth(1).waitFor({ timeout: 30_000 });
    check(/\/admin\/blog\/[0-9a-f-]{36}$/.test(page.url()), "ekran görüntüsü yüklenince taslak kimliği oluştu (adres güncellendi)");
    const postId = page.url().split("/").pop();
    await tap(studio.getByText("Yaklaşım:"));
    for (const label of ["Problem ve çözüm", "Sık Sorulan Sorular (SSS)", "Pratik öneriler"]) await tap(studio.getByRole("button", { name: label, exact: true }));
    check(await studio.getByRole("button", { name: "Karşılaştırma", exact: true }).isDisabled(), "en fazla 3 yaklaşım seçilebiliyor");
    const analyze = studio.getByRole("button", { name: "Analiz Et ve Taslağı Hazırla" });
    const box = await analyze.boundingBox();
    check(box && box.y + box.height <= h && box.y >= 0, "metin eklendikten sonra 'Analiz Et' düğmesi kaydırmadan görünüyor (altta sabit)");
    // Kayıt gecikmeli (debounce + ağ): en fazla 15 sn yoklanır.
    let session = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      session = (await service.from("blog_studio_sessions").select("data").eq("post_id", postId).maybeSingle()).data?.data;
      if (session?.notes === NOTES && session.shots?.length === 2 && session.approaches?.length === 3) break;
      await page.waitForTimeout(500);
    }
    check(session?.notes === NOTES && session.shots?.length === 2 && session.approaches?.length === 3, "not, 2 ekran görüntüsü ve yaklaşımlar Supabase'e kaydedildi");
    const files = (await service.storage.from("studio-sources").list(postId)).data ?? [];
    check(files.length === 2, "ekran görüntüleri özel kovada (2 dosya)");

    // 2) Kapat → yenile → kaldığın yerden devam
    await tap(studio.getByRole("button", { name: "Stüdyoyu kapat" }));
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("article", { name: "Yazı tuvali" }).waitFor();
    studio = await openStudio();
    await studio.getByText("Yarım kalan çalışma (taslağa kayıtlı)").waitFor({ timeout: 15_000 });
    await tap(studio.getByRole("button", { name: "Kaldığın yerden devam et" }));
    check((await studio.getByLabel("Metin ya da not").inputValue()) === NOTES, "yenilemeden sonra metin geri geldi");
    await studio.locator("ol[class*=thumbs] img").nth(1).waitFor({ timeout: 15_000 });
    check((await studio.locator("ol[class*=thumbs] img").count()) === 2, "yenilemeden sonra 2 ekran görüntüsü önizlemesiyle geri geldi");
    check((await studio.locator("[aria-pressed=true]").filter({ hasText: /Problem ve çözüm|SSS|Pratik öneriler/ }).count()) === 3, "yaklaşımlar geri geldi");

    // 3) AI yoğun (503): sade mesaj, uygun eylemler, teknik ayrıntı ayrı; tek istek
    await analyze.dblclick();
    const alert = studio.getByRole("alert");
    await alert.waitFor({ timeout: 20_000 });
    const alertText = await alert.innerText();
    check(alertText.includes("Ücretsiz yapay zekâ servisleri şu an yoğun") && !/Gemini|OVH/.test(alertText.split("Teknik ayrıntılar")[0]), "yoğunluk: sade başlık; sağlayıcı ayrıntısı ana mesajda yok");
    check(await alert.getByRole("button", { name: "Tekrar dene" }).isVisible() && await alert.getByRole("button", { name: "Metni kendim ekle" }).isVisible() && await alert.getByRole("button", { name: "Kaynak metni kopyala" }).isVisible(), "eylemler: Tekrar dene · Metni kendim ekle · Kaynak metni kopyala");
    await tap(alert.getByText("Teknik ayrıntılar"));
    check((await alert.innerText()).includes("Gemini: yoğun"), "teknik ayrıntılar açılır bölümde");
    check(log.screenshots.length === 1 && log.screenshots[0].includes("application/json"), "çift dokunmada tek analiz isteği; kayıtlı görüntülerin yolları gönderildi (yeniden yükleme yok)");
    await tap(alert.getByRole("button", { name: "Kaynak metni kopyala" }));
    check((await page.evaluate(() => navigator.clipboard.readText().catch(() => ""))).includes("Meta reklamlarında"), "kaynak metin panoya kopyalandı");

    // 4) Tekrar dene → başarılı taslak; yaklaşımlar istekte; editöre aktarıldı
    log.mode = "ok";
    await tap(alert.getByRole("button", { name: "Tekrar dene" }));
    await studio.waitFor({ state: "hidden", timeout: 30_000 });
    const sent = log.template.at(-1);
    check(JSON.stringify(sent?.approaches) === JSON.stringify(["problemSolution", "faq", "tips"]) && sent.templateKey === "problemSolution", "yaklaşımlar taslak isteğinde; ana şablon ilk yaklaşımdan");
    check((await page.getByRole("textbox", { name: "Yazı başlığı" }).inputValue()) === DRAFT.fields.title, "taslak editöre aktarıldı");

    // 5) Okuma hatası (yapay zekâ hatası DEĞİL)
    studio = await openStudio();
    await studio.getByLabel("Kaynak linki").fill("https://okunamayan.example.com/yazi");
    await tap(studio.getByRole("button", { name: "Analiz Et ve Taslağı Hazırla" }));
    const readAlert = studio.getByRole("alert");
    await readAlert.waitFor({ timeout: 20_000 });
    const readText = await readAlert.innerText();
    check(readText.includes("Kaynak sayfa okunamadı") && readText.includes("yapay zekâ hatası değil"), "okuma hatası AI hatasından ayrı gösterildi");
    check(await readAlert.getByRole("button", { name: "Ücretsiz okuyucuyla tekrar dene" }).isVisible() && await readAlert.getByRole("button", { name: "Metni kendim ekle" }).isVisible() && await readAlert.getByRole("button", { name: "Ekran görüntüsü yükle" }).isVisible(), "eylemler: Ücretsiz okuyucuyla tekrar dene · Metni kendim ekle · Ekran görüntüsü yükle");
    await tap(readAlert.getByRole("button", { name: "Metni kendim ekle" }));
    check(await studio.getByLabel("Metin ya da not").isVisible(), "'Metni kendim ekle' metin alanını açtı; link korunuyor");
    check((await studio.getByLabel("Kaynak linki").inputValue()) === "https://okunamayan.example.com/yazi", "link kaybolmadı");
    check(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, "yatay taşma yok");
    await page.screenshot({ path: join(out, `yaz-${w}.png`) });
    await tap(studio.getByRole("button", { name: "Stüdyoyu kapat" }));
    check(errors.length === 0, `JS hatası yok ${errors.join(" | ").slice(0, 200)}`);
    await context.close();
  }
} catch (failure) {
  failures++;
  console.log(`  FAIL beklenmeyen hata: ${failure.message.split("\n")[0]} ${(failure.message.match(/waiting for (.+)/) ?? [])[1]?.slice(0, 160) ?? ""}`);
  for (const context of browser.contexts()) for (const open of context.pages()) await open.screenshot({ path: join(out, `hata-${Date.now()}.png`) }).catch(() => {});
} finally {
  await browser.close();
  // Temizlik: bu kullanıcının oluşturduğu taslaklar, özel kovadaki ekran görüntüleri.
  const posts = (await service.from("blog_posts").select("id").eq("author_id", user.user.id)).data ?? [];
  for (const post of posts) {
    const files = (await service.storage.from("studio-sources").list(post.id)).data ?? [];
    if (files.length) await service.storage.from("studio-sources").remove(files.map((file) => `${post.id}/${file.name}`));
  }
  if (posts.length) await service.from("blog_posts").delete().in("id", posts.map((post) => post.id));
  await service.auth.admin.deleteUser(user.user.id);
  const after = (await service.from("blog_posts").select("id", { count: "exact", head: true })).count;
  console.log(`\ntemizlik: ${after === before ? "tamam" : "EKSİK"} (yazı ${before}→${after}) · ekran görüntüleri: ${out}`);
  if (after !== before) failures++;
  console.log(failures ? `\n${failures} kontrol başarısız` : "\nTÜM KONTROLLER GEÇTİ");
  process.exitCode = failures ? 1 : 0;
}
