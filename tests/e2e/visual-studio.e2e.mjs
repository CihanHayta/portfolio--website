// AI Görsel Stüdyosu — GERÇEK editör (test projesine bağlı :3100), SAHTE AI/medya yanıtları.
//   node scripts/supabase/dev-test.mjs   (ayrı terminalde)
//   node tests/e2e/visual-studio.e2e.mjs
// Yazı test veritabanında oluşturulur; AI uçları ve medya yüklemesi tarayıcıda
// sahte yanıtla karşılanır (kota ve depolama harcanmaz). 5 ekran boyutu.

import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { projectKeys } from "../../scripts/supabase/_api.mjs";
import { resolveRef } from "../../scripts/supabase/project.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const out = process.env.QA_OUT ?? mkdtempSync(join(tmpdir(), "persona-visual-"));
const VIEWPORTS = (process.env.ONLY ?? "360,390,430,820,1440").split(",").map((w) => [Number(w), { 360: 800, 390: 844, 430: 932, 820: 1180, 1440: 900 }[w] ?? 900]);
const RUN = `e2e-${Date.now().toString(36)}`;
let failures = 0;
const check = (ok, label) => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`);
};

const ref = resolveRef("test");
const keys = await projectKeys(ref);
const service = createClient(keys.url, keys.serviceRole, { auth: { persistSession: false } });
const email = `${RUN}@example.com`;
const password = randomBytes(18).toString("base64url");
const { data: user, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw error;
await service.from("blog_admins").insert({ user_id: user.user.id, display_name: "E2E Test" }).throwOnError();

const text = (id, value) => ({ id, type: "text", props: { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: value }] }] } } });
const heading = (id, value, level = "2") => ({ id, type: "heading", props: { text: value, level, href: "", align: "left" } });
const BLOCKS = [
  text("p0intro01", "Giriş: reklam bütçesi planlamanın temel adımları."),
  heading("hsec00001", "Meta reklam bütçesi nasıl belirlenir"),
  text("p1para001", "Bütçe hedefe ve dönüşüm maliyetine göre belirlenir."),
  heading("hsec00002", "Manuel ve otomatik teklif karşılaştırması"),
  text("p2para002", "İki teklif yaklaşımının avantajları farklıdır."),
  heading("hsec00003", "Örnek kampanya kurgusu", "3"),
  text("p3para003", "Örnek bir kampanya kurgusu adım adım anlatılır."),
  heading("hsec00004", "Sonuç"),
  text("p4para004", "Özet ve öneriler."),
];
const webp = async (r, g, b) => `data:image/webp;base64,${(await sharp({ create: { width: 640, height: 400, channels: 3, background: { r, g, b } } }).composite([{ input: Buffer.from('<svg width="640" height="400"><circle cx="320" cy="200" r="120" fill="white"/></svg>') }]).webp().toBuffer()).toString("base64")}`;
const IMG_A = await webp(40, 90, 160);
const IMG_B = await webp(170, 60, 40);
const sourceImage = `${base}/og/persona-og.png`;
const SOURCE = { url: "https://kaynak.example.com/meta-butce", title: "Meta Ads Budget Guide", text: "# Meta Ads Budget\n## Setting a budget\nText", images: [{ src: `${base}/images/sahin-emlak-cover.png`, alt: "Bütçe tablosu", section: "Setting a budget" }, { src: sourceImage, alt: "Teklif karşılaştırması", section: "Manual vs automatic bidding" }], wordCount: 1840, provider: "jina", truncated: false, missingFrom: null, savedAt: Date.now() };
const item = (id, target, headingText, kind, purpose, prompt, alt, sourceImg = null, priority = 1, aspect = "3:2") => ({ id, target, heading: headingText, kind, purpose, description: "", composition: "Sade, metinsiz kompozisyon", aspect, prompt, negative: "text", alt, caption: "", sourceImage: sourceImg, priority, status: "planned" });
const PLAN = {
  plan: {
    items: [
      item("v1", "cover", "Kapak", "cover", "Ana konuyu ilk bakışta anlatmak", "budget planning desk, no text", "Reklam bütçesi planlaması yapılan çalışma masası", null, 1, "16:9"),
      item("v2", "hsec00002", "Manuel ve otomatik teklif karşılaştırması", "comparison", "İki teklif yaklaşımının farkını göstermek", "two bidding approaches side by side", "Manuel ve otomatik teklif karşılaştırma görseli"),
      item("v3", "hsec00001", "Meta reklam bütçesi nasıl belirlenir", "section", "Bütçe dağılımını göstermek", "budget allocation chart", "Reklam bütçesi dağılım tablosu", { src: SOURCE.images[0].src, alt: "Bütçe tablosu", section: "Setting a budget" }, 2),
    ],
    skipped: [{ sectionId: "hsec00004", heading: "Sonuç", reason: "Kapanış bölümü" }],
    analysis: null,
  },
  budget: 3, provider: "gemini", model: "gemini-3.6-flash", source: null,
  sourceSummary: { url: SOURCE.url, title: SOURCE.title, wordCount: 1840, images: 2, truncated: false, provider: "jina" },
};
const SERVICES = { available: { text: 1, image: 2 }, services: [
  { category: "image", provider: "comfyui", label: "ComfyUI", configured: false, state: "missing-key", tasks: ["görsel üretimi", "referans görselden üretim"] },
  { category: "image", provider: "cloudflare", label: "Cloudflare Workers AI (görsel)", configured: true, state: "active", tasks: ["görsel üretimi", "referans görselden üretim"] },
  { category: "image", provider: "pollinations", label: "Pollinations (anonim)", configured: true, state: "active", tasks: ["görsel üretimi"] },
] };

const browser = await chromium.launch();
const postIds = [];
try {
  for (const [w, h] of VIEWPORTS) {
    console.log(`\n=== ${w}x${h}`);
    const mobile = w <= 1180;
    const { data: post } = await service.from("blog_posts").insert({ title: `E2E Görsel ${w}`, slug: `${RUN}-${w}`, content: { type: "blocks", version: 1, blocks: BLOCKS }, author_id: user.user.id }).select("id").single().throwOnError();
    postIds.push(post.id);
    const context = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 1024, hasTouch: w < 1024 });
    const log = { plan: 0, images: [], media: [], imports: 0, failNext: { v2: true } };
    await context.addInitScript(({ source, key }) => {
      if (!sessionStorage.getItem("qa-seeded")) {
        localStorage.setItem(key, JSON.stringify(source));
        sessionStorage.setItem("qa-seeded", "1");
      }
    }, { source: SOURCE, key: `persona-source:${post.id}` });
    await context.route("**/api/admin/**", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.pathname === "/api/admin/ai/services") return route.fulfill({ json: SERVICES });
      if (url.pathname === "/api/admin/ai/visual-plan") {
        if (req.method() === "GET") return route.fulfill({ json: { job: null } });
        log.plan += 1;
        log.planBody = JSON.parse(req.postData());
        await new Promise((resolve) => setTimeout(resolve, 600));
        return route.fulfill({ json: PLAN });
      }
      if (url.pathname === "/api/admin/ai/visual-image") {
        const body = JSON.parse(req.postData());
        log.images.push(body);
        await new Promise((resolve) => setTimeout(resolve, 400));
        const card = body.item.prompt.startsWith("two bidding") ? "v2" : body.item.prompt.startsWith("budget planning") ? "v1" : "v3";
        if (log.failNext[card]) {
          log.failNext[card] = false;
          return route.fulfill({ status: 429, json: { error: "Ücretsiz görsel sağlayıcılarının hiçbiri görsel üretemedi (Cloudflare Workers AI: ücretsiz kota doldu). Ücretli bir servise geçilmedi.", kind: "quota" } });
        }
        const polli = body.provider === "pollinations";
        const refMode = body.mode === "reference";
        return route.fulfill({ json: { candidate: { id: body.opId, image: polli ? IMG_B : IMG_A, width: 640, height: 400, provider: polli ? "pollinations" : "cloudflare", providerLabel: polli ? "Pollinations" : "Cloudflare Workers AI", model: polli ? "sana" : refMode ? "@cf/black-forest-labs/flux-2-klein-4b" : "@cf/black-forest-labs/flux-1-schnell", modelLabel: polli ? "sana (anonim, filigranlı)" : refMode ? "FLUX.2 [klein] 4B" : "FLUX.1 [schnell]", mode: refMode ? "reference" : "text", aspect: "16:9", seed: body.seed, cached: false }, attempts: [] } });
      }
      if (url.pathname === "/api/admin/media") {
        // Gerçekte medya adresi izinli Supabase depolamasıdır; testte site içi göreli yol.
        log.media.push(req.postData() ?? "");
        return route.fulfill({ status: 201, json: { media: { id: `${String(log.media.length).padStart(8, "0")}-0000-4000-8000-000000000000`, url: "/brand/persona-mark.png", width: 512, height: 512 } } });
      }
      if (url.pathname === "/api/admin/ai/import-image") {
        log.imports += 1;
        log.importBody = JSON.parse(req.postData());
        return route.fulfill({ status: 201, json: { media: { id: "10000000-0000-4000-8000-000000000000", url: "/og/persona-og.png", width: 1200, height: 630 } } });
      }
      return route.continue();
    });

    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && !/Failed to load resource|429/.test(m.text()) && errors.push(m.text()));
    await page.goto(`${base}/admin/login?next=${encodeURIComponent(`/admin/blog/${post.id}`)}`, { waitUntil: "networkidle" });
    await page.getByLabel("E-posta").fill(email);
    await page.getByLabel("Şifre", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    await page.waitForURL(new RegExp(`/admin/blog/${post.id}$`), { timeout: 30_000 });
    check(true, "gerçek girişten sonra hedef yazıya dönüldü (?next)");
    await page.getByRole("textbox", { name: "Yazı başlığı" }).waitFor({ timeout: 30_000 });
    const openStudio = async () => {
      if (mobile) {
        // Telefonda "Görseller" → "Yeni üret" → bölüm bölüm AI görsel planı.
        await page.locator("[class*=mobileBar]").getByRole("button", { name: "Görseller" }).click();
        const images = page.getByRole("dialog", { name: "Görseller" });
        await images.waitFor();
        await images.getByRole("tab", { name: "Yeni üret" }).click();
        await images.getByRole("button", { name: /AI Görselleri/ }).click();
      } else {
        await page.getByRole("button", { name: "AI Görselleri" }).click();
      }
      const dialog = page.getByRole("dialog", { name: "AI Görselleri" });
      await dialog.waitFor();
      return dialog;
    };
    let dialog = await openStudio();
    const sourceText = await dialog.getByRole("region", { name: "Kaynak ve analiz" }).innerText();
    check(sourceText.includes("Meta Ads Budget Guide") && (await dialog.getByPlaceholder("https://…").count()) === 0, "kaynak bağlamı yeniden kullanıldı; URL sorulmadı");
    await dialog.getByRole("button", { name: "Görsel planını hazırla" }).dblclick();
    await dialog.locator("li[aria-labelledby^='visual-v']").first().waitFor();
    check(log.plan === 1 && log.planBody.sections.length === 4 && log.planBody.source?.url === SOURCE.url, "çift dokunmada tek plan isteği; veritabanındaki bölümler + saklı kaynak gönderildi");
    const cards = dialog.locator("li[aria-labelledby^='visual-v']");
    const xs = await cards.evaluateAll((list) => list.map((el) => Math.round(el.getBoundingClientRect().x)));
    check((await cards.count()) === 3 && (w < 1000 ? new Set(xs).size === 1 : new Set(xs).size === 2), `3 öneri, ${w < 1000 ? "tek" : "iki"} sütun`);
    await dialog.getByRole("button", { name: "Görsel stüdyosunu kapat" }).click();
    check((await page.getByRole("button", { name: /Önerilen görsel:/ }).count()) === 2, "editörde 2 önerilen görsel noktası işaretli");
    dialog = await openStudio();
    const card = (id) => dialog.locator(`li[aria-labelledby='visual-${id}-title']`);

    await card("v1").getByRole("button", { name: "Görsel üret" }).dblclick();
    await card("v1").getByText("FLUX.1 [schnell]").first().waitFor();
    check(log.images.filter((b) => b.item.prompt.startsWith("budget planning")).length === 1, "çift dokunmada tek görsel üretimi");
    check(await card("v1").getByText(/Apache-2\.0/).first().isVisible(), "aday gerçek model ve lisans notuyla");
    await card("v1").getByText("Başka modelle alternatif").click();
    check((await card("v1").getByRole("button", { name: "ComfyUI" }).count()) === 0, "yapılandırılmamış servis alternatif sunulmadı");
    await card("v1").getByRole("button", { name: /^Pollinations/ }).click();
    await card("v1").getByText(/sana \(anonim, filigranlı\)/).first().waitFor();
    check(log.images.at(-1).provider === "pollinations", "alternatif yalnızca seçilen servisten istendi");
    await card("v1").getByRole("button", { name: /Pollinations görselini büyüt/ }).click();
    const lightbox = page.getByRole("dialog", { name: "Görsel önizleme" });
    check(await lightbox.isVisible(), "büyük önizleme açıldı");
    await lightbox.getByRole("button", { name: "Önizlemeyi kapat" }).click();
    await card("v1").getByRole("button", { name: "Bu görseli seç" }).nth(1).click();

    await card("v2").getByRole("button", { name: "Görsel üret" }).click();
    await card("v2").getByRole("alert").waitFor();
    check((await card("v2").getByRole("alert").innerText()).includes("Ücretli bir servise geçilmedi") && (await card("v2").getByRole("button", { name: "Bu görseli seç" }).count()) === 0, "kota hatası anlaşılır; başarısız aday seçilemez");
    const failedOp = log.images.at(-1).opId;
    await card("v2").getByRole("button", { name: "Yeniden dene" }).click();
    await card("v2").getByText("FLUX.1 [schnell]").first().waitFor();
    check(log.images.at(-1).opId === failedOp, "yeniden deneme aynı işlem kimliğiyle (çift üretim yok)");
    await card("v2").getByRole("button", { name: "Bu görseli seç" }).click();
    await card("v2").getByRole("combobox", { name: "Hedef bölüm" }).selectOption("hsec00003");

    await card("v3").getByRole("button", { name: "Kaynak görseli: Bütçe tablosu" }).click();
    const footer = dialog.locator("footer");
    check((await footer.innerText()).includes("kullanım hakkı onaylanmadı") && await footer.getByRole("button", { name: "Seçili görselleri taslağa ekle" }).isDisabled(), "lisans onayı olmadan kaynak görseli eklenemez");
    await card("v3").getByRole("checkbox", { name: /kullanma hakkım olduğunu onaylıyorum/ }).check();
    check(await footer.getByRole("button", { name: "Seçili görselleri taslağa ekle" }).isDisabled() && (await footer.innerText()).includes("filigranlı"), "filigranlı aday açık onay olmadan eklenemez");
    await footer.getByRole("checkbox", { name: /Bilerek ekliyorum/ }).check();
    const ddg = new URL(await card("v2").getByRole("link", { name: /DuckDuckGo/ }).getAttribute("href"));
    check(ddg.hostname === "duckduckgo.com" && ddg.searchParams.get("iax") === "images" && /kampanya/.test(ddg.searchParams.get("q")), "DuckDuckGo bağlantısı hedef bölüme göre sorgu açıyor");
    check(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0 && await dialog.evaluate((el) => el.scrollWidth - el.clientWidth) <= 0, "stüdyoda yatay taşma yok");
    await page.screenshot({ path: join(out, `studio-${w}.png`) });

    await footer.getByRole("button", { name: "Seçili görselleri taslağa ekle" }).click();
    await footer.getByText(/görsel taslağa eklendi/).waitFor({ timeout: 15_000 });
    check((await footer.innerText()).includes("3 görsel taslağa eklendi") && log.media.length === 2 && log.imports === 1, "3 görsel eklendi (2 bölüm + kapak); kaynak görseli lisanslı aktarıldı");
    check(log.media.some((body) => body.includes("AI: Pollinations · sana (anonim, filigranlı)")), "medya kaydına AI sağlayıcı/model kökeni yazıldı");
    await dialog.getByRole("button", { name: "Görsel stüdyosunu kapat" }).click();
    const order = await page.getByRole("article", { name: "Yazı tuvali" }).evaluate((article) => [...article.querySelectorAll("[aria-label$='bloğu'], [aria-label$='bloğu (seçili)']")].map((el) => (el.getAttribute("aria-label").startsWith("Görsel") ? "IMG" : el.innerText.split("\n")[0].slice(0, 24))));
    const after = (start) => order[order.findIndex((entry) => entry.startsWith(start)) + 1];
    check(after("Meta reklam bütçesi") === "IMG" && after("Örnek kampanya") === "IMG" && after("Manuel ve otomatik") !== "IMG" && order.filter((entry) => entry === "IMG").length === 2, "görseller doğru bölümlerin hemen altında");
    const coverBefore = await page.getByRole("article", { name: "Yazı tuvali" }).locator("header img").count();
    await page.getByRole("button", { name: "Geri al" }).click();
    const imgsAfterUndo = await page.getByRole("article", { name: "Yazı tuvali" }).locator("[aria-label^='Görsel bloğu']").count();
    const coverAfterUndo = await page.getByRole("article", { name: "Yazı tuvali" }).locator("header img").count();
    check(imgsAfterUndo === 0 && coverAfterUndo < coverBefore, "Geri al: bölüm görselleri ve kapak tek adımda geri alındı");

    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("textbox", { name: "Yazı başlığı" }).waitFor();
    dialog = await openStudio();
    await dialog.locator("li[aria-labelledby^='visual-v']").first().waitFor();
    check((await dialog.locator("li[aria-labelledby^='visual-v']").count()) === 3 && log.plan === 1, "yenilemeden sonra plan yeniden üretilmeden geldi");
    await card("v1").locator("img[src^='data:image/webp']").first().waitFor({ timeout: 5000 }).catch(() => {});
    check((await card("v1").locator("img[src^='data:image/webp']").count()) >= 2, "aday görselleri tarayıcı deposundan geri yüklendi");
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
  console.log(`\ntemizlik: ${left.length === 0 ? "tamam" : `EKSİK (${left.length} yazı)`} · ekran görüntüleri: ${out}`);
  if (left.length) failures++;
  console.log(failures ? `\n${failures} kontrol başarısız` : "\nTÜM KONTROLLER GEÇTİ");
  process.exitCode = failures ? 1 : 0;
}
