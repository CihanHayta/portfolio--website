// Görseller adımı — GERÇEK editör, GERÇEK test veritabanı ve depolama (:3100).
//   node scripts/supabase/dev-test.mjs   (ayrı terminalde)
//   node tests/e2e/studio-images.e2e.mjs
// Gerçek: giriş, oturum kaydı (blog_studio_sessions), kaynak görselinin sunucuda
// indirilip medya kütüphanesine aktarılması, yükleme, yerleşim, otomatik kayıt,
// yenileme sonrası geri yükleme, reddedilen görselin silinmesi.
// SAHTE (raporda ayrı): AI görsel üretimi — /api/admin/ai/visual-image yanıtı test
// tarafından gerçek bir medya kaydıyla oluşturulur (kota harcanmaz).
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
const out = process.env.QA_OUT ?? mkdtempSync(join(tmpdir(), "persona-images-"));
const VIEWPORTS = (process.env.ONLY ?? "390,1440").split(",").map((w) => [Number(w), { 360: 800, 390: 844, 430: 932, 820: 1180, 1440: 900 }[w] ?? 900]);
const RUN = `e2e-img-${Date.now().toString(36)}`;
const SOURCE_IMAGES = [
  { src: "https://personadijitalpazarlama.com/og/persona-og.png", alt: "Persona kapak görseli", section: "Manual vs automatic bidding", role: "og" },
  { src: "https://personadijitalpazarlama.com/images/sahin-emlak-cover.png", alt: "Kampanya örneği ekranı", section: "Example campaign", role: "content" },
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
await service.from("blog_admins").insert({ user_id: user.user.id, display_name: "E2E Görsel" }).throwOnError();
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
];
const SERVICES = {
  services: [
    { category: "image", provider: "comfyui", label: "ComfyUI", configured: false, state: "missing-key", tasks: ["görsel üretimi", "referans görselden üretim"] },
    { category: "image", provider: "pollinations", label: "Pollinations (anonim)", configured: true, state: "active", tasks: ["görsel üretimi"] },
  ],
};
const pngFile = async (name, r, g, b) => {
  const path = join(out, name);
  writeFileSync(path, await sharp({ create: { width: 800, height: 450, channels: 3, background: { r, g, b } } }).png().toBuffer());
  return path;
};
// AI üretimi yerine: sunucunun persist:true ile yapacağını taklit eden gerçek medya kaydı.
let fakeCount = 0;
async function fakeAiMedia(postId, alt) {
  fakeCount += 1;
  const buffer = await sharp({ create: { width: 640, height: 360, channels: 3, background: { r: 201, g: 162, b: 75 } } }).webp().toBuffer();
  const path = `e2e/${RUN}-${fakeCount}.webp`;
  await service.storage.from("blog-media").upload(path, buffer, { contentType: "image/webp" });
  const url = service.storage.from("blog-media").getPublicUrl(path).data.publicUrl;
  const { data } = await service
    .from("blog_media")
    .insert({ storage_path: path, url, mime_type: "image/webp", size_bytes: buffer.length, width: 640, height: 360, alt_text: alt, caption: "AI: Pollinations · flux · referans tarif edilerek", created_by: user.user.id, origin: "ai", provider: "pollinations", model: "flux", draft_post_id: postId })
    .select("id, url, width, height")
    .single()
    .throwOnError();
  return data;
}

const browser = await chromium.launch();
const postIds = [];
try {
  const ownPng = await pngFile("kendi.png", 30, 30, 30);
  const handoffPng = await pngFile("chatgpt.png", 120, 80, 50);
  for (const [w, h] of VIEWPORTS) {
    console.log(`\n=== ${w}x${h}`);
    const mobile = w < 1024;
    const { data: post } = await service
      .from("blog_posts")
      .insert({ title: `E2E Görseller ${w}`, slug: `${RUN}-${w}`, content: { type: "blocks", version: 1, blocks: BLOCKS }, author_id: user.user.id })
      .select("id")
      .single()
      .throwOnError();
    postIds.push(post.id);
    // Önceki stüdyo çalışmasından kalan kaynak (taslağa bağlı oturum).
    await service.from("blog_studio_sessions").insert({ post_id: post.id, data: { version: 1, url: "https://kaynak.example.com/meta", source: { url: "https://kaynak.example.com/meta", title: "Meta Ads Budget", text: "Metin ".repeat(30), images: SOURCE_IMAGES }, images: [], phase: "applied" } }).throwOnError();

    const context = await prepareContext(await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile }), base);
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
    const log = { visual: [] };
    await context.route("**/api/admin/ai/services", (route) => route.fulfill({ json: SERVICES }));
    await context.route("**/api/admin/ai/visual-image", async (route) => {
      const body = JSON.parse(route.request().postData());
      log.visual.push(body);
      const media = await fakeAiMedia(body.postId, body.item.alt);
      return route.fulfill({ json: { candidate: { id: body.opId, image: null, media, width: 640, height: 360, provider: "pollinations", providerLabel: "Pollinations", model: "flux", modelLabel: "flux (anonim uç nokta)", mode: body.mode === "describe" ? "described" : body.mode, aspect: "16:9" }, attempts: [] } });
    });

    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
    await page.goto(`${base}/admin/login?next=${encodeURIComponent(`/admin/blog/${post.id}`)}`, { waitUntil: "networkidle" });
    await page.getByLabel("E-posta").fill(email);
    await page.getByLabel("Şifre", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    await page.waitForURL(new RegExp(`/admin/blog/${post.id}$`), { timeout: 30_000 });
    await page.getByRole("textbox", { name: "Yazı başlığı" }).waitFor({ timeout: 30_000 });

    const openImages = async () => {
      const button = mobile ? page.locator("[class*=mobileBar]").getByRole("button", { name: "Görseller" }) : page.getByRole("button", { name: "Görseller", exact: true });
      await button.click();
      const dialog = page.getByRole("dialog", { name: "Görseller" });
      await dialog.waitFor();
      await dialog.getByRole("tab", { name: /^Kaynak/ }).waitFor();
      return dialog;
    };
    const notice = (dialog) => dialog.locator("p[role=status]").first();
    let dialog = await openImages();
    const cards = dialog.locator("li[class*=imageCard]");
    await cards.first().waitFor();
    check((await dialog.getByRole("tab", { name: "Kaynak (2)" }).count()) === 1 && (await cards.count()) === 2, "kaynak görselleri taslağın kayıtlı oturumundan geldi (link yeniden okunmadı)");

    // 1) Seç → hedef → lisans → bloga ekle
    await cards.nth(0).locator("label[class*=imageThumb]").click();
    await cards.nth(1).locator("label[class*=imageThumb]").click();
    const bar = dialog.getByRole("region", { name: "Seçilen görsellerle işlem" });
    check((await bar.innerText()).includes("2 görsel seçili"), "iki görsel seçildi; işlem çubuğu göründü");
    const target0 = await cards.nth(0).getByLabel("Nereye eklensin?").inputValue();
    check(target0 === "cover", "og görseli için önerilen hedef kapak");
    await cards.nth(0).getByLabel("Nereye eklensin?").selectOption("block:hsec00002");
    await cards.nth(1).getByLabel("Nereye eklensin?").selectOption("block:hsec00003");
    await bar.getByRole("button", { name: "Seçilen görselleri bloga ekle (2)" }).click();
    check(/kullanım hakkın olduğunu onayla/.test(await notice(dialog).innerText()), "lisans onayı olmadan kaynak görseli eklenmedi ve neden söylendi");
    await bar.getByRole("checkbox", { name: /kullanma hakkım var/ }).check();
    await bar.getByRole("button", { name: "Seçilen görselleri bloga ekle (2)" }).click();
    await dialog.getByText("2 görsel bloga eklendi.").waitFor({ timeout: 45_000 });
    check((await cards.nth(0).innerText()).includes("Yazıda") && (await cards.nth(1).innerText()).includes("Yazıda"), "iki kart da 'Yazıda' durumunda; seçim temizlendi");
    check(!/\b0 görsel/.test(await dialog.innerText()), "hiçbir yerde '0 görsel eklendi' yok");
    await page.screenshot({ path: join(out, `gorseller-${w}.png`) });

    // 2) Kapak
    await cards.nth(0).locator("label[class*=imageThumb]").click();
    await bar.getByRole("button", { name: "Kapak görseli yap" }).click();
    await dialog.getByText("Kapak görseli ayarlandı.").waitFor({ timeout: 20_000 });
    check((await cards.nth(0).innerText()).includes("Kapak"), "kapak durumu kartta görünüyor");

    // 3) AI ile benzer yeni görsel (tarif modu) → reddet → yeniden → bloga ekle
    await cards.nth(1).locator("label[class*=imageThumb]").click();
    await bar.getByRole("button", { name: "AI ile benzer yeni görsel oluştur" }).click();
    await dialog.getByText("1 yeni görsel üretildi; onayını bekliyor.").waitFor({ timeout: 30_000 });
    const sent = log.visual.at(-1);
    check(sent.mode === "describe" && sent.persist === true && sent.postId === post.id && sent.reference?.kind === "media", "referans kütüphanedeki kopya; tarif modu; sonuç taslağa bağlı kalıcı kayıt istendi");
    check(/#c9a24b/.test(sent.item.prompt) && /Kampanya örneği|kampanya/i.test(sent.item.section + sent.item.alt), "istem marka rengini ve hedef bölümü içeriyor");
    const candidate = dialog.locator("li[data-state=candidate]");
    check((await candidate.innerText()).includes("tarif edilip sıfırdan üretildi") && (await candidate.innerText()).includes("Pollinations"), "aday sağlayıcı/model ve dürüst yöntem notuyla gösterildi");
    const firstAi = (await service.from("blog_media").select("id").eq("draft_post_id", post.id).eq("origin", "ai")).data;
    await candidate.getByRole("button", { name: "Reddet" }).click();
    await dialog.getByText("Görsel reddedildi ve medya kütüphanesinden silindi.").waitFor();
    const afterReject = (await service.from("blog_media").select("id").in("id", firstAi.map((row) => row.id))).data;
    check(afterReject.length === 0, "reddedilen AI görseli kütüphaneden gerçekten silindi");
    await dialog.getByRole("tab", { name: /^Kaynak/ }).click();
    await cards.nth(1).locator("label[class*=imageThumb]").click();
    await bar.getByRole("button", { name: "AI ile benzer yeni görsel oluştur" }).click();
    await candidate.first().waitFor();
    await candidate.first().getByRole("button", { name: "Bloga ekle" }).click();
    await dialog.getByText("1 görsel bloga eklendi.").waitFor();

    // 4) Kendi görselin: alt metin zorunlu
    await dialog.locator("input[type=file][multiple]").setInputFiles(ownPng);
    await dialog.getByText("1 görsel kütüphaneye kaydedildi ve seçildi.").waitFor({ timeout: 30_000 });
    await bar.getByRole("button", { name: "Blogda kullan" }).click();
    check(/Alt metni boş/.test(await notice(dialog).innerText()), "alt metni boş görsel eklenmedi; açık uyarı verildi");
    const own = dialog.locator("li[data-selected]").first();
    await own.getByLabel("Alt metin").fill("Kendi çektiğimiz kampanya paneli");
    await own.getByLabel("Nereye eklensin?").selectOption("end");
    await bar.getByRole("button", { name: "Blogda kullan" }).click();
    await dialog.getByText("1 görsel bloga eklendi.").waitFor();

    // 5) ChatGPT ile üret (elle devir): istem + yeni sekme + dönüşte dosya
    await dialog.getByRole("tab", { name: "Yeni üret" }).click();
    await dialog.getByRole("button", { name: "ChatGPT ile üret" }).click();
    const popupPromise = context.waitForEvent("page");
    await dialog.getByRole("button", { name: /İstemi kopyala ve ChatGPT/ }).click();
    const popup = await popupPromise;
    check(/^https:\/\/chatgpt\.com\/\?q=/.test(popup.url()), "ChatGPT yeni sekmede hazır istemle açıldı");
    await popup.close();
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
    check(/hiçbir yazı/.test(clip) && /#c9a24b/.test(clip), "istem panoya kopyalandı (marka rengi, metinsiz kuralı)");
    await dialog.locator("section[aria-labelledby=handoff-title] input[type=file]").setInputFiles(handoffPng);
    await dialog.getByText(/onaylayıp yazıya ekleyebilirsin/).waitFor({ timeout: 30_000 });
    const handoff = dialog.locator("li[data-state=candidate]").filter({ hasText: "ChatGPT" });
    check((await handoff.count()) === 1, "ChatGPT görseli onay bekleyen aday olarak geldi");
    await handoff.getByRole("button", { name: "Kabul et" }).click();
    check((await dialog.locator("li[data-selected]").filter({ hasText: "ChatGPT" }).count()) === 1, "kabul edilen ChatGPT görseli seçili hâle geldi (yazıya kendiliğinden eklenmedi)");
    check(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, "yatay taşma yok");
    await page.screenshot({ path: join(out, `gorseller-son-${w}.png`) });

    // Kayıt: oturum kaydı ve yazının otomatik kaydı
    await dialog.getByText("Seçimler taslağa kaydedildi").waitFor({ timeout: 10_000 });
    await dialog.getByRole("button", { name: "Bitti" }).click();
    const canvas = page.getByRole("article", { name: "Yazı tuvali" });
    const order = await canvas.evaluate((article) => [...article.querySelectorAll("[aria-label$='bloğu'], [aria-label$='bloğu (seçili)']")].map((el) => (el.getAttribute("aria-label").startsWith("Görsel") ? "IMG" : el.innerText.split("\n")[0].slice(0, 20))));
    const iH2 = order.findIndex((label) => label.startsWith("Manuel ve otomatik"));
    const iH3 = order.findIndex((label) => label.startsWith("Örnek kampanya"));
    check(order[iH2 + 1] === "IMG" && order[iH3 + 1] === "IMG" && order[iH3 + 2] === "IMG" && order.at(-1) === "IMG", `görseller seçilen başlıkların hemen altında ve sonda (${order.join(" › ")})`);
    await page.waitForFunction(() => /Kaydedildi|kaydedildi/.test(document.body.innerText), null, { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const saved = (await service.from("blog_posts").select("content, cover_media_id").eq("id", post.id).single()).data;
    const savedImages = saved.content.blocks.filter((block) => block.type === "image").length;
    check(savedImages === 4 && Boolean(saved.cover_media_id), `yazı Supabase'e kaydedildi: 4 görsel bloğu + kapak (${savedImages})`);
    const media = (await service.from("blog_media").select("origin, draft_post_id, source_url").eq("draft_post_id", post.id)).data;
    check(media.filter((row) => row.origin === "source" && /personadijitalpazarlama\.com/.test(row.source_url)).length === 2 && media.some((row) => row.origin === "upload") && media.some((row) => row.origin === "handoff") && media.some((row) => row.origin === "ai"), "medya kayıtlarında köken bilgisi var (source/upload/ai/handoff + taslak)");
    const session = (await service.from("blog_studio_sessions").select("data").eq("post_id", post.id).single()).data.data;
    check(session.images.filter((item) => item.state === "placed").length >= 3 && session.images.some((item) => item.state === "cover") && !JSON.stringify(session).includes("data:image") && !JSON.stringify(session).includes("blob:"), "oturumda durumlar kayıtlı; gömülü veri ya da geçici adres yok");

    // Yenileme: her şey geri gelir
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("textbox", { name: "Yazı başlığı" }).waitFor();
    dialog = await openImages();
    await cards.first().waitFor();
    check((await cards.nth(0).innerText()).includes("Kapak") && (await cards.nth(1).innerText()).includes("Yazıda"), "yenilemeden sonra kaynak görsellerinin durumu geri geldi");
    await dialog.getByRole("tab", { name: /Görsellerim/ }).click();
    check((await dialog.locator("li[data-selected]").filter({ hasText: "ChatGPT" }).count()) === 1, "yenilemeden sonra seçim (ChatGPT görseli) korundu");
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
    const rows = (await service.from("blog_media").select("id, storage_path").or(`draft_post_id.in.(${postIds.join(",")}),storage_path.like.e2e/${RUN}%`)).data ?? [];
    if (rows.length) {
      await service.from("blog_posts").update({ cover_media_id: null }).in("id", postIds);
      await service.storage.from("blog-media").remove(rows.map((row) => row.storage_path));
      await service.from("blog_media").delete().in("id", rows.map((row) => row.id));
    }
    for (const id of postIds) {
      const files = (await service.storage.from("studio-sources").list(id)).data ?? [];
      if (files.length) await service.storage.from("studio-sources").remove(files.map((file) => `${id}/${file.name}`));
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
