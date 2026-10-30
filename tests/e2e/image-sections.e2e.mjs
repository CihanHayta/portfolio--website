// Görseller ekranı (bölüm sırası) — GERÇEK editör, GERÇEK test veritabanı ve depolama (:3100).
//   node scripts/supabase/dev-test.mjs   (ayrı terminalde)
//   node tests/e2e/image-sections.e2e.mjs
// Gerçek: giriş, oturum kaydı (blog_studio_sessions), kaynak görselinin sunucuda
// indirilip medya kütüphanesine aktarılması, yükleme, yerleşim, görsel değiştirme,
// otomatik kayıt, yenileme sonrası geri yükleme.
// ChatGPT'nin kendisi otomatikleştirilmez (şartlara aykırı; kullanıcı kendi hesabıyla
// üretir): açılan sekmenin adresi ve panodaki istem doğrulanır, "ürettiğin görsel"
// yerine test bir dosya verir. Otomatik AI görsel üretimi YOK (çağrı yapılmadığı da doğrulanır).
// Kaynak görselleri sitenin canlı, herkese açık dosyalarıdır (yalnızca okunur).

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
const out = process.env.QA_OUT ?? mkdtempSync(join(tmpdir(), "persona-sections-"));
const VIEWPORTS = (process.env.ONLY ?? "390,1440").split(",").map((w) => [Number(w), { 360: 800, 390: 844, 430: 932, 768: 1024, 1440: 900 }[w] ?? 900]);
const RUN = `e2e-sec-${Date.now().toString(36)}`;
const SOURCE_IMAGES = [
  { src: "https://personadijitalpazarlama.com/og/persona-og.png", alt: "Persona kapak görseli", section: "", role: "og" },
  { src: "https://personadijitalpazarlama.com/images/sahin-emlak-cover.png", alt: "Teklif karşılaştırma ekranı", section: "Manual vs automatic bidding", role: "content" },
  { src: "https://personadijitalpazarlama.com/brand/persona-mark.png", alt: "Bütçe şeması", section: "Meta reklam bütçesi belirleme adımları", role: "content" },
  { src: "https://personadijitalpazarlama.com/videos/projects/kpi-control-center-poster.jpg", alt: "Ekip fotoğrafı", section: "About us", role: "content" },
];
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
await service.from("blog_admins").insert({ user_id: user.user.id, display_name: "E2E Bölüm" }).throwOnError();
const before = { posts: (await service.from("blog_posts").select("id", { count: "exact", head: true })).count, media: (await service.from("blog_media").select("id", { count: "exact", head: true })).count };

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
  heading("hsec00004", "Ölçüm ve raporlama"),
  text("p4para004", "Haftalık rapor maliyeti ve dönüşümü izler."),
];
const pngFile = async (name, r, g, b) => {
  const path = join(out, name);
  writeFileSync(path, await sharp({ create: { width: 800, height: 450, channels: 3, background: { r, g, b } } }).png().toBuffer());
  return path;
};
const postRow = async (postId) => (await service.from("blog_posts").select("content, cover_media_id").eq("id", postId).single()).data;
const draftMedia = async (postId) => (await service.from("blog_media").select("id, origin, url, source_url").eq("draft_post_id", postId)).data ?? [];

const browser = await chromium.launch();
const postIds = [];
try {
  const ownPng = await pngFile("kendi.png", 30, 30, 30);
  const handoffPng = await pngFile("chatgpt.png", 120, 80, 50);
  const coverPng = await pngFile("kapak.png", 20, 20, 24);
  const replacePng = await pngFile("degisim.png", 200, 120, 40);
  const mascotPng = await pngFile("maskot.png", 224, 144, 47);
  for (const [w, h] of VIEWPORTS) {
    console.log(`\n=== ${w}x${h}`);
    const mobile = w < 1024;
    const { data: post } = await service
      .from("blog_posts")
      .insert({ title: `E2E Bölümler ${w}`, slug: `${RUN}-${w}`, content: { type: "blocks", version: 1, blocks: BLOCKS }, author_id: user.user.id })
      .select("id")
      .single()
      .throwOnError();
    postIds.push(post.id);
    // Önceki stüdyo çalışmasından kalan kaynak ve sunucuda doğrulanmış bölüm eşlemesi.
    await service
      .from("blog_studio_sessions")
      .insert({ post_id: post.id, data: { version: 1, url: "https://kaynak.example.com/meta", source: { url: "https://kaynak.example.com/meta", title: "Meta Ads Budget", text: "Metin ".repeat(30), images: SOURCE_IMAGES }, images: [], sectionMap: { hsec00002: "Manual vs automatic bidding" }, phase: "applied" } })
      .throwOnError();

    const context = await prepareContext(await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile }), base);
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
    const aiCalls = [];
    await context.route("**/api/admin/ai/visual-image", (route) => {
      aiCalls.push(route.request().url());
      return route.abort();
    });

    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && !/Failed to load resource|ERR_BLOCKED|net::/.test(m.text()) && errors.push(m.text()));
    await page.goto(`${base}/admin/login?next=${encodeURIComponent(`/admin/blog/${post.id}`)}`, { waitUntil: "networkidle" });
    await page.getByLabel("E-posta").fill(email);
    await page.getByLabel("Şifre", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    await page.waitForURL(new RegExp(`/admin/blog/${post.id}$`), { timeout: 30_000 });
    await page.getByRole("textbox", { name: "Yazı başlığı" }).waitFor({ timeout: 30_000 });

    const openImages = async () => {
      const button = mobile ? page.locator("[class*=mobileBar]").getByRole("button", { name: "Görseller" }) : page.getByRole("button", { name: "Görseller", exact: true });
      await button.click();
      const found = page.getByRole("dialog", { name: "Görseller" });
      await found.waitFor();
      await found.locator("[data-section=cover]").waitFor({ timeout: 20_000 });
      return found;
    };
    const notice = (scope) => scope.locator("p[role=status]").first();
    let dialog = await openImages();
    const card = (key) => dialog.locator(`[data-section="${key}"]`);
    const panel = () => dialog.getByTestId("handoff-panel");
    await card("hsec00002").getByRole("checkbox").first().waitFor({ timeout: 15_000 }).catch(() => {});

    // 1) Düzen: Kapak → Giriş → Bölüm 1..3, gerçek başlıklar ve gerçek sıra
    const order = await dialog.locator("ol > li[data-section]").evaluateAll((items) => items.map((item) => item.getAttribute("data-section")));
    check(JSON.stringify(order) === JSON.stringify(["cover", "intro", "hsec00001", "hsec00002", "hsec00004"]), `kartlar makale sırasında: ${order.join(" › ")}`);
    const titles = await dialog.locator("ol > li[data-section] h3").allInnerTexts();
    check(titles[2] === "Meta reklam bütçesi nasıl belirlenir" && titles[3] === "Manuel ve otomatik teklif karşılaştırması" && titles[4] === "Ölçüm ve raporlama", "bölüm kartlarında gerçek H2 başlıkları");
    const sec2 = await card("hsec00002").innerText();
    check(/Bölüm 2/i.test(sec2) && sec2.includes("Örnek kampanya kurgusu"), "Bölüm 2 numarası ve H3 alt başlığı gösteriliyor");
    check((await card("hsec00004").innerText()).includes("Bu bölümde henüz görsel yok."), "görseli olmayan bölümde 'Bu bölümde henüz görsel yok.'");
    for (const name of ["Görsel yükle", "Mevcutlardan seç", "Yeni görsel oluştur (ChatGPT)"]) {
      check((await card("hsec00004").getByRole("button", { name }).count()) === 1, `boş bölümde '${name}' seçeneği`);
    }
    check((await card("hsec00002").getByRole("checkbox").count()) === 1 && sec2.includes("Kaynakta aynı bölüm"), "Bölüm 2: kaynakla doğrulanan eşleme ('Kaynakta aynı bölüm')");
    check((await card("hsec00001").getByRole("checkbox").count()) === 1 && (await card("hsec00001").innerText()).includes("Başlık kelimeleri eşleşti"), "Bölüm 1: başlık kelimeleri eşleşen kaynak görseli");
    check((await card("hsec00004").getByRole("checkbox").count()) === 0, "Bölüm 3'e başka bölümün görseli yakıştırılmadı");
    const unmatched = dialog.locator("details").filter({ hasText: "Bölümü doğrulanamayan kaynak görselleri (1)" });
    check((await unmatched.count()) === 1, "eşleşmesi doğrulanamayan görsel ayrı grupta (1)");
    check((await card("cover").getByRole("checkbox").count()) === 1 && (await card("cover").innerText()).includes("Kaynağın kendi kapak görseli"), "kaynağın kapak görseli kapak kartında");

    // 2) Çoklu seçim → üç ayrı işlem
    await card("hsec00001").getByRole("checkbox").first().check();
    await card("hsec00002").getByRole("checkbox").first().check();
    const bar = dialog.getByRole("region", { name: "Seçilen görsellerle işlem" });
    check((await bar.innerText()).includes("2 görsel seçili"), "iki görsel seçildi; işlem çubuğu göründü");
    for (const name of ["Blogda kullan (2)", "Arşive kaydet (2)", "Referans olarak kullan (2)"]) check((await bar.getByRole("button", { name }).count()) === 1, `çubukta '${name}'`);
    const heights = await bar.locator("[class*=barActions] button").evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().height)));
    check(heights.length === 3 && heights.every((value) => value >= 44), `işlem düğmeleri ≥44 px (${heights.join(", ")})`);
    check((await card("hsec00002").getByLabel("Hangi bölüme?").inputValue()) === "block:hsec00002", "seçilen kaynak görselinin bölümü kendiliğinden doğru (Bölüm 2)");
    await bar.getByRole("button", { name: "Blogda kullan (2)" }).click();
    check(/kullanım hakkın olduğunu onayla/.test(await notice(dialog).innerText()), "lisans onayı olmadan kaynak görseli eklenmedi; neden söylendi");
    await bar.getByRole("checkbox", { name: /kullanma hakkım var/ }).check();
    await bar.getByRole("button", { name: "Blogda kullan (2)" }).click();
    await dialog.getByText("2 görsel yazıya eklendi.").waitFor({ timeout: 45_000 });
    check((await card("hsec00001").innerText()).includes("Bu bölümde kullanılan görsel") && (await card("hsec00002").innerText()).includes("Bu bölümde kullanılan görsel"), "iki görsel kendi bölümünde 'Bu bölümde kullanılan görsel'");
    check(!/\b0 (görsel|yazı)/.test(await dialog.innerText()), "hiçbir yerde '0 görsel/0 yazı' yok");
    await page.screenshot({ path: join(out, `bolumler-${w}.png`) });

    // 3) Referans olarak kullan: bloga hiçbir şey eklemez; ChatGPT elle üretim
    await page.waitForTimeout(3500); // otomatik kayıt
    const blocksBefore = (await postRow(post.id)).content.blocks.length;
    if (!(await unmatched.evaluate((node) => node.open))) await unmatched.locator("summary").click();
    await unmatched.getByRole("checkbox").first().check();
    await bar.getByRole("button", { name: "Referans olarak kullan (1)" }).click();
    await panel().waitFor();
    const panelText = await panel().innerText();
    check(panelText.includes("Elle üretim") && panelText.includes("senin hesabınla"), "panel üretimin elle (kullanıcının ChatGPT hesabı) olduğunu açıkça söylüyor");
    check((await panel().locator("ul[class*=refList] > li").count()) === 1, "seçilen referans panelde listelendi");
    const popupPromise = context.waitForEvent("page");
    await panel().getByRole("button", { name: /İstemi kopyala ve ChatGPT/ }).click();
    const popup = await popupPromise;
    check(popup.url().replace(/\/$/, "") === "https://chatgpt.com", `referans varken ChatGPT istem gönderilmeden açıldı (${popup.url().slice(0, 40)})`);
    await popup.close();
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
    check(clip.length > 60, "istem panoya kopyalandı");
    await panel().locator("input[type=file]").setInputFiles(handoffPng);
    await panel().getByRole("img", { name: "Eklenecek görselin önizlemesi" }).waitFor();
    const mediaBefore = (await draftMedia(post.id)).length;
    check((await draftMedia(post.id)).every((row) => row.origin !== "handoff"), "önizleme sırasında hiçbir şey kaydedilmedi");
    await panel().getByRole("button", { name: "Reddet" }).click();
    check((await panel().getByRole("img", { name: "Eklenecek görselin önizlemesi" }).count()) === 0 && (await draftMedia(post.id)).length === mediaBefore, "reddedilen görsel hiçbir yere kaydedilmedi");
    check((await postRow(post.id)).content.blocks.length === blocksBefore, "referans seçmek bloga görsel eklemedi");
    await panel().locator("input[type=file]").setInputFiles(handoffPng);
    await panel().getByLabel("Alt metin (zorunlu)").fill("ChatGPT ile üretilen bütçe şeması");
    await panel().getByRole("button", { name: /Kabul et ve bu bölüme ekle/ }).click();
    await dialog.getByText(/ChatGPT görseli .* bölümüne eklendi/).waitFor({ timeout: 45_000 });

    // 4) Boş bölüme görsel yükle
    const chooser = page.waitForEvent("filechooser");
    await card("hsec00004").getByRole("button", { name: "Görsel yükle" }).click();
    await (await chooser).setFiles(ownPng);
    await dialog.getByText(/1 görsel yüklendi ve Bölüm 3: Ölçüm ve raporlama bölümüne eklendi/).waitFor({ timeout: 45_000 });
    check(!(await card("hsec00004").innerText()).includes("Bu bölümde henüz görsel yok."), "boş bölüm artık görselli");

    // 5) Görseli değiştir (yeni seçenek): yeni blok eklenmez, aynı blokta değişir
    await card("hsec00004").getByRole("button", { name: "Yeni seçenek üret" }).click();
    await panel().waitFor();
    await panel().locator("input[type=file]").setInputFiles(replacePng);
    await panel().getByRole("button", { name: /Kabul et ve görseli değiştir/ }).click();
    await dialog.getByText(/Görsel değiştirildi/).waitFor({ timeout: 45_000 });

    // 6) Kapak: kullanıcının maskotu (varsayılan + yüklenen) + yazıya özgü istem
    const mascots = card("cover").locator("details").filter({ hasText: "Maskot referansların" });
    await mascots.locator("summary").click();
    await mascots.getByTestId("mascot-refs").locator("img").first().waitFor();
    const mascotChooser = page.waitForEvent("filechooser");
    await mascots.getByRole("button", { name: "Maskot görseli ekle" }).click();
    await (await mascotChooser).setFiles(mascotPng);
    await mascots.locator("ul li").nth(1).waitFor({ timeout: 30_000 });
    const mascotRow = (await service.from("blog_media").select("storage_path").like("storage_path", "maskot/%").eq("created_by", user.user.id)).data ?? [];
    check(mascotRow.length === 1, "maskot referansı medya arşivinde 'maskot/' klasörüne kalıcı kaydedildi");
    check((await mascots.locator("summary").innerText()).includes("2 kullanılıyor"), "varsayılan tilki işareti + yüklenen maskot istemde kullanılıyor");
    await card("cover").getByRole("button", { name: /Kapak oluştur \(ChatGPT\)/ }).click();
    await panel().waitFor();
    check((await panel().locator("ul[class*=refList] > li").count()) === 2, "kapak panelinde 2 maskot referansı");
    const coverPopup = context.waitForEvent("page");
    await panel().getByRole("button", { name: /İstemi kopyala ve ChatGPT/ }).click();
    const coverTab = await coverPopup;
    check(coverTab.url().replace(/\/$/, "") === "https://chatgpt.com", "kapak: maskot eklenecek, istem panoda (adreste gönderilmedi)");
    await coverTab.close();
    const coverPrompt = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
    check(coverPrompt.includes(`E2E Bölümler ${w}`) && /KENDİ maskotudur/.test(coverPrompt) && /HİÇBİR yazı, harf/.test(coverPrompt) && /Ölçüm|Meta reklam bütçesi/.test(coverPrompt), "kapak istemi: yazı başlığı, kendi maskotu, yazısız kuralı, öne çıkan bölüm");
    await panel().locator("input[type=file]").setInputFiles(coverPng);
    await panel().getByLabel("Alt metin (zorunlu)").fill("Reklam bütçesi kapak görseli");
    await panel().getByRole("button", { name: /Kabul et ve kapak yap/ }).click();
    await dialog.getByText("ChatGPT görseli kapak olarak ayarlandı.").waitFor({ timeout: 45_000 });
    check((await card("cover").innerText()).includes("Kapak") && !(await card("cover").innerText()).includes("Henüz kapak görseli yok"), "kapak kartında yeni kapak görünüyor");
    check(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, "yatay taşma yok");
    check(aiCalls.length === 0, "otomatik AI görsel servisine hiç istek gitmedi");
    await page.screenshot({ path: join(out, `bolumler-son-${w}.png`) });

    // Kayıt: oturum ve yazının otomatik kaydı
    await dialog.getByText("Seçimler taslağa kaydedildi").waitFor({ timeout: 15_000 });
    await dialog.getByRole("button", { name: "Bitti" }).click();
    await page.waitForTimeout(4500);
    const saved = await postRow(post.id);
    const ids = saved.content.blocks.map((block) => (block.type === "image" ? "IMG" : block.id));
    const next = (id) => ids[ids.indexOf(id) + 1];
    check(next("hsec00001") === "IMG" && next("hsec00002") === "IMG" && next("hsec00004") === "IMG", `görseller doğru başlıkların altında (${ids.join(" › ")})`);
    const images = saved.content.blocks.filter((block) => block.type === "image");
    check(images.length === 4 && Boolean(saved.cover_media_id), `Supabase'e kaydedildi: 4 görsel bloğu + kapak (${images.length})`);
    const lastImage = saved.content.blocks[ids.indexOf("hsec00004") + 1];
    const media = await draftMedia(post.id);
    check(media.filter((row) => row.origin === "handoff").some((row) => row.url === lastImage.props.image.url), "Bölüm 3'teki görsel ChatGPT sonucuyla yerinde değişti (yeni blok yok)");
    const origins = ["source", "handoff", "upload"].map((kind) => media.filter((row) => row.origin === kind).length);
    check(origins[0] === 2 && origins[1] === 3 && origins[2] === 1, `taslağa bağlı medya kökenleri doğru (kaynak ${origins[0]}, ChatGPT ${origins[1]}, yükleme ${origins[2]})`);
    const session = (await service.from("blog_studio_sessions").select("data").eq("post_id", post.id).single()).data.data;
    check(session.sectionMap?.hsec00002 === "Manual vs automatic bidding" && !JSON.stringify(session).includes("blob:") && !JSON.stringify(session).includes("data:image"), "oturumda bölüm eşlemesi korunuyor; geçici adres yok");

    // Yenileme: düzen ve durumlar geri gelir
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("textbox", { name: "Yazı başlığı" }).waitFor();
    dialog = await openImages();
    check(!(await card("cover").innerText()).includes("Henüz kapak görseli yok") && (await card("hsec00002").innerText()).includes("Yazıda"), "yenilemeden sonra kapak ve bölüm görselleri geri geldi");
    check(!(await card("hsec00004").innerText()).includes("Bu bölümde henüz görsel yok."), "yenilemeden sonra Bölüm 3 görseli korunuyor");
    const mascotsAfter = card("cover").locator("details").filter({ hasText: "Maskot referansların" });
    await mascotsAfter.locator("summary").click();
    await mascotsAfter.locator("ul li").nth(1).waitFor({ timeout: 15_000 }).catch(() => {});
    check((await mascotsAfter.locator("ul li").count()) >= 2, "yenilemeden sonra maskot referansı korunuyor");
    check(errors.length === 0, `JS hatası yok ${errors.join(" | ").slice(0, 200)}`);
    await context.close();
  }
} catch (failure) {
  failures++;
  console.log(`  FAIL beklenmeyen hata: ${failure.message.split("\n")[0]} ${(failure.message.match(/waiting for (.+)/) ?? [])[1]?.slice(0, 160) ?? ""}`);
  for (const context of browser.contexts()) for (const open of context.pages()) await open.screenshot({ path: join(out, `hata-${Date.now()}.png`) }).catch(() => {});
} finally {
  await browser.close();
  // Temizlik: bu çalıştırmanın medya kayıtları ve dosyaları, oturumlar (yazıyla birlikte), yazılar, kullanıcı.
  if (postIds.length) {
    const rows = (await service.from("blog_media").select("id, storage_path").or(`draft_post_id.in.(${postIds.join(",")}),storage_path.like.e2e/${RUN}%,created_by.eq.${user.user.id}`)).data ?? [];
    if (rows.length) {
      await service.from("blog_posts").update({ cover_media_id: null }).in("id", postIds);
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
