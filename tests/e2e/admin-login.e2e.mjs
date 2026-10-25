// Yönetici girişi: /admin yönlendirmesi, form, boş/biçimsiz gönderim, şifre
// göster/gizle, klavye açıkken yerleşim, oturumsuz sayfa ve API erişimi.
// Gerçek giriş yapılmaz; kimlik bilgisi kullanılmaz.
// WRONG_LOGIN=1 verilirse var olmayan bir hesapla iki hatalı deneme yapılır
// (Supabase Auth'a gider; kayıt oluşturmaz). Varsayılan olarak kapalıdır.
// Kullanım: npm run dev açıkken  node tests/e2e/admin-login.e2e.mjs
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.QA_OUT ?? mkdtempSync(join(tmpdir(), "persona-e2e-"));
console.log(`Adres: ${base} · ekran görüntüleri: ${out}`);
const VIEWPORTS = [[360, 800], [390, 844], [430, 932], [820, 1180], [1440, 900]];
const WRONG_LOGIN_AT = new Set(process.env.WRONG_LOGIN === "1" ? [390, 1440] : []);
const browser = await chromium.launch();
let failures = 0;
const check = (ok, label) => { if (!ok) failures++; console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`); };

for (const [w, h] of VIEWPORTS) {
  console.log(`\n=== ${w}x${h}`);
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 800, hasTouch: w < 800 });
  const page = await context.newPage();
  const errors = [];
  const actions = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("request", (r) => r.method() === "POST" && r.headers()["next-action"] && actions.push(r.url()));

  // 1-3: /admin doğrudan giriş ekranını açar; /admin/login da çalışır.
  const res = await page.goto(base + "/admin", { waitUntil: "networkidle" });
  check(new URL(page.url()).pathname === "/admin/login" && res.status() === 200, `/admin → ${new URL(page.url()).pathname} (${res.status()})`);
  const direct = await context.request.get(base + "/admin/login", { maxRedirects: 0 });
  check(direct.status() === 200, `/admin/login doğrudan 200 (${direct.status()})`);

  const ui = await page.evaluate(() => ({
    title: document.title,
    h1: document.querySelector("h1")?.textContent,
    brand: document.querySelector('a[href="/"] img') !== null && /Persona/.test(document.querySelector("main a[href='/']")?.textContent ?? ""),
    siteHeader: !!document.querySelector("header"),
    labels: [...document.querySelectorAll("label")].map((l) => l.textContent.trim()),
    overflow: document.documentElement.scrollWidth - innerWidth,
    robots: document.querySelector('meta[name="robots"]')?.content,
  }));
  check(ui.h1 === "Yönetici Girişi", `başlık "${ui.h1}"`);
  check(ui.brand, "Persona logosu ve adı görünüyor");
  check(!ui.siteHeader, "site menüsü/CTA'sı giriş ekranında yok");
  check(ui.labels.join("|") === "E-posta|Şifre", `etiketler ${ui.labels.join(", ")}`);
  check(ui.overflow <= 0, `yatay taşma yok (${ui.overflow})`);
  check(/noindex/.test(ui.robots ?? ""), "noindex");

  const email = page.getByLabel("E-posta");
  const password = page.getByLabel("Şifre", { exact: true });
  const submit = page.getByRole("button", { name: "Giriş Yap" });
  const toggle = page.getByRole("button", { name: "Şifreyi göster" });
  for (const [name, loc] of [["e-posta", email], ["şifre", password], ["göster/gizle", toggle], ["Giriş Yap", submit], ["Siteye dön", page.getByRole("link", { name: "Siteye dön" })]]) {
    const box = await loc.boundingBox();
    check(box && box.height >= 44 && box.width >= 44, `${name} dokunma alanı ${box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "yok"}`);
  }
  check((await email.getAttribute("autocomplete")) === "username" && (await password.getAttribute("autocomplete")) === "current-password", "şifre yöneticisi için autocomplete");
  check((await email.getAttribute("type")) === "email" && (await email.getAttribute("inputmode")) === "email", "e-posta klavyesi");
  const fontSize = await email.evaluate((el) => getComputedStyle(el).fontSize);
  check(fontSize === "16px", `alan yazı boyutu ${fontSize} (iOS yakınlaştırmaz)`);

  // Şifreyi göster/gizle.
  await password.fill("gizli-deger");
  await toggle.click();
  check((await password.getAttribute("type")) === "text" && (await page.getByRole("button", { name: "Şifreyi gizle" }).getAttribute("aria-pressed")) === "true", "göster → metin");
  await page.getByRole("button", { name: "Şifreyi gizle" }).click();
  check((await password.getAttribute("type")) === "password", "gizle → parola");
  await password.fill("");

  // 4: Boş form — sunucuya gitmez, alanların altında Türkçe hata.
  const before = actions.length;
  await submit.click();
  await page.waitForTimeout(300);
  check(actions.length === before, "boş form sunucuya gönderilmedi");
  check(await page.getByText("E-posta adresini yaz.").isVisible() && await page.getByText("Şifreni yaz.").isVisible(), "iki alanın altında hata metni");
  check((await email.getAttribute("aria-invalid")) === "true" && (await email.getAttribute("aria-describedby")) === "email-error", "aria-invalid + aria-describedby");
  check(await email.evaluate((el) => el === document.activeElement), "imleç ilk hatalı alanda");
  await email.fill("ad");
  check(!(await page.getByText("E-posta adresini yaz.").isVisible()), "yazınca hata kalkar");
  await password.fill("x");
  await submit.click();
  await page.waitForTimeout(200);
  check(actions.length === before && await page.getByText(/Geçerli bir e-posta/).isVisible(), "biçimsiz e-posta sunucuya gitmedi");
  await page.screenshot({ path: `${out}/login-empty-${w}.png` });

  // Klavye açık benzetimi: görünür yükseklik ~%55. Şifre alanı odaktayken
  // alanlar ve Giriş Yap düğmesi ekranda kalmalı.
  await page.reload({ waitUntil: "networkidle" });
  const kbHeight = Math.round(h * 0.55);
  await page.setViewportSize({ width: w, height: kbHeight });
  await page.getByLabel("Şifre", { exact: true }).focus();
  const visible = await page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const btn = r('button[type="submit"]'), pw = r("#password"), em = r("#email");
    return { btnBottom: btn.bottom, pwTop: pw.top, emTop: em.top, vh: innerHeight };
  });
  check(visible.btnBottom <= visible.vh && visible.pwTop >= 0, `klavye açıkken (${w}x${kbHeight}) şifre ve düğme görünür (düğme alt=${Math.round(visible.btnBottom)}/${visible.vh})`);
  await page.screenshot({ path: `${out}/login-keyboard-${w}.png` });
  await page.setViewportSize({ width: w, height: h });

  // 5: Hatalı giriş (var olmayan hesap) — yalnızca iki boyutta.
  if (WRONG_LOGIN_AT.has(w)) {
    await page.reload({ waitUntil: "networkidle" });
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    await page.route("**/admin/login**", async (route) => {
      if (route.request().method() === "POST") await gate;
      await route.continue();
    });
    await page.getByLabel("E-posta").fill("qa-yanlis-giris@example.com");
    await page.getByLabel("Şifre", { exact: true }).fill("Yanlis-Sifre-123");
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    const busy = page.getByRole("button", { name: "Giriş yapılıyor…" });
    await busy.waitFor({ timeout: 3000 });
    check(await busy.isDisabled(), "gönderirken düğme kilitli ve 'Giriş yapılıyor…'");
    release();
    // Next.js'in rota duyurucusu da role="alert" taşır; formun kendi uyarısı beklenir.
    const alert = page.locator('form [role="alert"]');
    await alert.waitFor({ timeout: 30000 });
    const text = await alert.textContent();
    check(text === "E-posta ya da şifre hatalı.", `hata mesajı: "${text}"`);
    check((await page.getByLabel("E-posta").inputValue()) === "qa-yanlis-giris@example.com", "e-posta korunuyor");
    check((await page.getByLabel("Şifre", { exact: true }).inputValue()) === "", "şifre temizlendi");
    check(await page.getByLabel("Şifre", { exact: true }).evaluate((el) => el === document.activeElement), "imleç şifre alanında");
    check(new URL(page.url()).pathname === "/admin/login", "giriş ekranında kaldı");
    await page.unroute("**/admin/login**");
    await page.screenshot({ path: `${out}/login-wrong-${w}.png` });
  }

  // 9: Oturumsuz yönetim sayfaları giriş ekranına; hedef korunur.
  for (const [path, expected] of [["/admin/blog", "/admin/login"], ["/admin/blog/new?studio=1", "/admin/login?next=%2Fadmin%2Fblog%2Fnew%3Fstudio%3D1"], ["/admin/blog/templates", "/admin/login?next=%2Fadmin%2Fblog%2Ftemplates"]]) {
    await page.goto(base + path, { waitUntil: "domcontentloaded" });
    const url = new URL(page.url());
    check(url.pathname + url.search === expected, `${path} → ${url.pathname + url.search}`);
  }
  check(await page.locator('input[name="next"]').inputValue() === "/admin/blog/templates", "gizli next alanı hedefi taşıyor");
  check(!(await page.content()).includes("Tüm Yazılar"), "yönetim içeriği görünmüyor");

  // 10: Oturumsuz API.
  for (const p of ["media", "ai/source", "ai/similar", "ai/template"]) {
    const r = await context.request.post(`${base}/api/admin/${p}`, { data: {} });
    check(r.status() === 401, `POST /api/admin/${p} → ${r.status()}`);
  }

  await page.goto(base + "/admin", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}/login-${w}.png`, fullPage: false });
  check(errors.length === 0, `konsol/JS hatası yok ${errors.join(" | ").slice(0, 200)}`);
  await context.close();
}
await browser.close();
console.log(failures ? `\n${failures} kontrol başarısız` : "\nTÜM KONTROLLER GEÇTİ");
process.exitCode = failures ? 1 : 0;
