// Blog yazar kutusundaki video slaytı — GERÇEK tarayıcı, gerçek video dosyaları.
//   node scripts/supabase/dev-test.mjs --prod   (ayrı terminalde, :3100)
//   node tests/e2e/author-videos.e2e.mjs
// Masaüstü: kurulu Google Chrome (channel "chrome", sesi hoparlöre vermez: --mute-audio).
// Mobil genişlikler: Playwright Chromium mobil öykünmesi; WebKit öykünmesi (iPhone değil).
// Salt okunur: veritabanına yazmaz. Ortam:
//   BASE_URL (varsayılan http://localhost:3100), QA_OUT (ekran görüntüleri),
//   FULL_PLAY=0 → 99 sn'lik videonun baştan sona sesli oynatılmasını atla,
//   CHANNEL=chromium → Google Chrome yerine Playwright Chromium.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, webkit } from "playwright-core";
import { gotoSettled, prepareContext } from "./_target.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const out = process.env.QA_OUT ?? mkdtempSync(join(tmpdir(), "persona-videos-"));
const FULL_PLAY = process.env.FULL_PLAY !== "0";
const CHANNEL = process.env.CHANNEL ?? "chrome";
const results = [];
const check = (ok, label, note = "") => {
  results.push(ok);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${note ? ` — ${note}` : ""}`);
};
const EXPECTED = [
  "mobilya-e-ticaret-4-hata.mp4",
  "mobilya-satmanin-3-kurali.mp4",
  "markani-buyutme-zamani.mp4",
  "markani-bizim-kadar-umursamaz.mp4",
];
console.log(`Adres: ${base} · ekran görüntüleri: ${out}`);

// Slayt durumunun anlık görüntüsü (tarayıcıda).
const snapshot = (page) =>
  page.evaluate(() => {
    const root = document.querySelector("[data-author-videos]");
    const videos = [...root.querySelectorAll("video")];
    const slides = [...root.querySelectorAll('[aria-roledescription="slide"]')];
    return {
      index: Number(root.dataset.index),
      mode: root.dataset.mode,
      paused: root.dataset.paused === "true",
      counting: root.dataset.counting === "true",
      videos: videos.map((v) => ({ paused: v.paused, muted: v.muted, t: v.currentTime, d: v.duration, ready: v.readyState, w: v.videoWidth, h: v.videoHeight, src: v.currentSrc.split("/").pop(), preload: v.preload, err: v.error?.code ?? 0, ended: v.ended })),
      slides: slides.map((s) => ({ state: s.dataset.state, opacity: Number(getComputedStyle(s).opacity), visibility: getComputedStyle(s).visibility })),
    };
  });

const waitFor = async (page, predicate, timeout, step = 200) => {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    last = await snapshot(page);
    if (predicate(last)) return { ok: true, snap: last, ms: Date.now() - start };
    await page.waitForTimeout(step);
  }
  return { ok: false, snap: last, ms: Date.now() - start };
};

// Etkin videonun kutudaki gerçek görüntü dikdörtgeni (object-fit hesaba katılarak).
const geometry = (page) =>
  page.evaluate(() => {
    const root = document.querySelector("[data-author-videos]");
    const index = Number(root.dataset.index);
    const stage = root.querySelector("[data-dir]").getBoundingClientRect();
    const video = root.querySelectorAll("video")[index];
    const box = video.getBoundingClientRect();
    const style = getComputedStyle(video);
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    let cw = box.width;
    let ch = box.height;
    if (vw && vh) {
      const scale = style.objectFit === "cover" ? Math.max(box.width / vw, box.height / vh) : Math.min(box.width / vw, box.height / vh);
      cw = vw * scale;
      ch = vh * scale;
    }
    return { index, fit: style.objectFit, stage: { w: stage.width, h: stage.height, x: stage.x, y: stage.y }, box: { w: box.width, h: box.height }, content: { w: cw, h: ch }, natural: { w: vw, h: vh } };
  });

const mouseAway = (page) => page.mouse.move(2, 2);

// Sayfanın sonuna inip (iletişim kartı tetiklenir) video kontrollerine dönülür; her
// kontrolün ortasına gerçekten tıklanabiliyor mu (üstünde başka öğe yok mu) ölçülür.
async function coverCheck(page, label) {
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await page.waitForTimeout(700);
  // Etkin nokta, kartın (varsa) tam ortasına gelecek şekilde kaydırılır: en kötü durum.
  await page.evaluate(() => {
    const dot = document.querySelector("[data-author-videos] [aria-current=true]").getBoundingClientRect();
    const card = document.querySelector('[aria-labelledby="blog-cta-card-title"]')?.getBoundingClientRect();
    const targetY = card ? card.top + card.height / 2 : innerHeight - 160;
    window.scrollBy({ top: dot.top + dot.height / 2 - targetY, behavior: "instant" });
  });
  await page.waitForTimeout(700);
  const cover = await page.evaluate(() => {
    const card = document.querySelector('[aria-labelledby="blog-cta-card-title"]');
    const buttons = [...document.querySelectorAll("[data-author-videos] button")].filter((b) => b.getAttribute("aria-hidden") !== "true");
    const blocked = buttons
      .filter((b) => {
        const r = b.getBoundingClientRect();
        if (r.top < 0 || r.bottom > innerHeight) return false;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !hit || !b.contains(hit);
      })
      .map((b) => b.getAttribute("aria-label") ?? b.textContent.trim());
    return { card: Boolean(card), tucked: card ? card.hasAttribute("data-tucked") : null, inert: card ? card.inert : null, opacity: card ? getComputedStyle(card).opacity : null, blocked };
  });
  check(cover.blocked.length === 0 && (!cover.card || (cover.tucked && cover.inert && cover.opacity === "0")), `${label}: iletişim kartı video kontrollerini örtmüyor (kart açıksa geri çekiliyor)`, JSON.stringify(cover));
  // Kart yalnızca video kutusuyla çakışırken gizlenir; çakışmadığı konumlarda görünür kalır.
  if (cover.card) {
    const samples = [];
    for (const position of ["top", "bottom"]) {
      await page.evaluate((where) => window.scrollTo({ top: where === "top" ? 0 : document.documentElement.scrollHeight, behavior: "instant" }), position);
      await page.waitForTimeout(500);
      samples.push(await page.evaluate(() => {
        const card = document.querySelector('[aria-labelledby="blog-cta-card-title"]');
        const a = card.getBoundingClientRect();
        const b = document.querySelector("[data-author-videos]").getBoundingClientRect();
        const overlap = a.left < b.right + 8 && b.left < a.right + 8 && a.top < b.bottom + 8 && b.top < a.bottom + 8;
        return { overlap, opacity: getComputedStyle(card).opacity };
      }));
    }
    check(samples.every((x) => (x.overlap ? x.opacity === "0" : x.opacity === "1")), `${label}: kart videoyla çakışmadığında görünür, çakışınca gizli`, JSON.stringify(samples));
  }
  return cover;
}
const scrollToStage = (page) =>
  page.evaluate(() => document.querySelector("[data-author-videos] [data-dir]").scrollIntoView({ block: "center", behavior: "instant" }));

async function desktopSuite(browser) {
  console.log(`\n=== Masaüstü 1440×900 · ${CHANNEL === "chrome" ? "Google Chrome (gerçek tarayıcı)" : "Playwright Chromium"}`);
  const context = await prepareContext(await browser.newContext({ viewport: { width: 1440, height: 900 } }), base);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => message.type() === "error" && errors.push(message.text().slice(0, 160)));
  const videoRequests = [];
  page.on("request", (request) => request.url().includes("/videos/blog/") && request.url().endsWith(".mp4") && videoRequests.push({ file: request.url().split("/").pop(), range: request.headers().range ?? "" }));
  const videoResponses = new Map();
  page.on("response", (response) => response.url().endsWith(".mp4") && videoResponses.set(response.url().split("/").pop(), response.status()));

  await gotoSettled(page, `${base}/blog`);
  await mouseAway(page);
  const first = await snapshot(page);
  check(first.videos.length === 4, "dört video slaytı var", first.videos.map((v) => v.src || "(yüklenmedi)").join(", "));
  const order = await page.evaluate(() => [...document.querySelectorAll("[data-author-videos] video")].map((v) => v.getAttribute("src")?.split("/").pop() ?? ""));
  check(order.join() === EXPECTED.join() || order.filter(Boolean).length < 4, "sıra: video-2 → video1 → video3 → video4", order.join(", "));

  // Ağ: açılışta yalnızca etkin video (+ sıradakinin üst verisi) istenir.
  const filesAtLoad = [...new Set(videoRequests.map((r) => r.file))];
  check(filesAtLoad.every((file) => [EXPECTED[0], EXPECTED[1]].includes(file)), "açılışta yalnızca etkin ve sıradaki video istendi", filesAtLoad.join(", ") || "yok");

  await scrollToStage(page);
  const started = await waitFor(page, (s) => s.index === 0 && !s.videos[0].paused && s.videos[0].t > 0.3, 10_000);
  check(started.ok, "ilk video kendiliğinden oynuyor", `${started.ms} ms`);
  check(started.snap.videos[0].muted && started.snap.mode === "auto", "ilk video sessiz başladı");
  check(started.snap.videos.filter((v) => !v.paused).length === 1, "aynı anda yalnızca bir video oynuyor");

  // Geometri: dört slaytta da kırpma ve esneme yok, sahne boyutu sabit.
  const stages = [];
  for (let i = 0; i < 4; i++) {
    if (i > 0) await page.getByRole("button", { name: new RegExp(`^${i + 1}\\. video`) }).click();
    await mouseAway(page);
    const ready = await waitFor(page, (s) => s.index === i && s.videos[i].ready >= 2 && !s.videos[i].paused, 10_000);
    await page.waitForTimeout(700);
    const g = await geometry(page);
    stages.push(g.stage);
    const ratio = g.content.w / g.content.h;
    check(ready.ok && g.natural.w === 720 && g.natural.h === 1280, `${i + 1}. video yüklendi ve oynuyor, 720×1280`, `${g.natural.w}×${g.natural.h}`);
    check(g.fit === "contain" && g.content.w <= g.box.w + 0.5 && g.content.h <= g.box.h + 0.5, `${i + 1}. video kırpılmıyor (contain, görüntü kutunun içinde)`, `görüntü ${g.content.w.toFixed(1)}×${g.content.h.toFixed(1)} / kutu ${g.box.w.toFixed(1)}×${g.box.h.toFixed(1)}`);
    check(Math.abs(ratio - 9 / 16) < 0.01 && Math.abs(g.box.w - g.stage.w) < 1 && Math.abs(g.box.h - g.stage.h) < 1, `${i + 1}. video esnemiyor (oran ${ratio.toFixed(4)} ≈ 0,5625)`);
    await page.locator("[data-author-videos] [data-dir]").screenshot({ path: join(out, `video-${i + 1}-1440.png`) });
  }
  check(stages.every((s) => Math.abs(s.w - stages[0].w) < 0.5 && Math.abs(s.h - stages[0].h) < 0.5), "sahne boyutu dört videoda aynı (geçişte kutu değişmiyor)", `${stages[0].w.toFixed(0)}×${stages[0].h.toFixed(0)}`);
  check([...videoResponses.values()].every((status) => status === 200 || status === 206) && videoResponses.size === 4, "dört video dosyası sunucudan geldi (200/206)", [...videoResponses.entries()].map(([f, s]) => `${f}:${s}`).join(" "));

  // Otomatik geçiş: 4 değişim boyunca aralıklar, sıra, üst üste binme.
  await page.getByRole("button", { name: /^1\. video/ }).click();
  await mouseAway(page);
  await waitFor(page, (s) => s.index === 0 && !s.videos[0].paused, 8000);
  const changes = [];
  let previous = 0;
  let maxPlaying = 0;
  let maxVisible = 0;
  let maxAudible = 0;
  const t0 = Date.now();
  while (changes.length < 4 && Date.now() - t0 < 40_000) {
    const s = await snapshot(page);
    maxPlaying = Math.max(maxPlaying, s.videos.filter((v) => !v.paused).length);
    maxAudible = Math.max(maxAudible, s.videos.filter((v) => !v.paused && !v.muted).length);
    maxVisible = Math.max(maxVisible, s.slides.filter((x) => x.opacity > 0.02).length);
    if (s.index !== previous) {
      changes.push({ to: s.index, at: Date.now() - t0 });
      previous = s.index;
    }
    await page.waitForTimeout(100);
  }
  const gaps = changes.map((c, i) => c.at - (i ? changes[i - 1].at : 0));
  check(changes.map((c) => c.to).join() === "1,2,3,0", "otomatik geçiş sırayla ve sondan başa", changes.map((c) => c.to).join("→"));
  check(gaps.slice(1).every((g) => g >= 5000 && g <= 7000), "geçiş aralığı 5–7 sn", gaps.map((g) => (g / 1000).toFixed(2)).join(" / ") + " sn");
  check(maxPlaying <= 1 && maxAudible === 0, "geçişler sırasında en fazla bir video oynadı, hiçbiri sesli değildi", `oynayan ${maxPlaying}, sesli ${maxAudible}`);
  check(maxVisible <= 1, "slaytlar üst üste binmedi (100 ms örneklemede aynı anda en fazla bir görünür slayt)", `en fazla ${maxVisible}`);

  // Önceki / sonraki / noktalar
  let s = await snapshot(page);
  const from = s.index;
  await page.getByRole("button", { name: "Sonraki video" }).click();
  s = await snapshot(page);
  check(s.index === (from + 1) % 4, "Sonraki video düğmesi", `${from}→${s.index}`);
  await page.getByRole("button", { name: "Önceki video" }).click();
  s = await snapshot(page);
  check(s.index === from, "Önceki video düğmesi", `→${s.index}`);
  await page.getByRole("button", { name: /^3\. video/ }).click();
  s = await snapshot(page);
  const current = await page.locator("[data-author-videos] [aria-current=true]").getAttribute("aria-label");
  check(s.index === 2 && /^3\. video/.test(current), "nokta ile 3. videoya geçildi, aria-current doğru");

  // Fare üstündeyken otomatik geçiş bekler.
  await page.getByRole("button", { name: /^1\. video/ }).click();
  await waitFor(page, (x) => x.index === 0 && !x.videos[0].paused, 8000);
  await page.locator("[data-author-videos] [data-dir]").hover();
  await page.waitForTimeout(7500);
  s = await snapshot(page);
  check(s.index === 0 && !s.counting && !s.videos[0].paused, "fare üstündeyken geçiş durdu, video oynamayı sürdürdü");
  await mouseAway(page);
  const resumed = await waitFor(page, (x) => x.index === 1, 8000);
  check(resumed.ok, "fare çekilince otomatik geçiş sürdü", `${resumed.ms} ms`);

  // Ses: aç → slayt sabit, süre sıfırlanmaz.
  await page.getByRole("button", { name: /^1\. video/ }).click();
  await mouseAway(page);
  await waitFor(page, (x) => x.index === 0 && x.videos[0].t > 2, 10_000);
  const before = (await snapshot(page)).videos[0].t;
  await page.getByRole("button", { name: "Sesi aç" }).click();
  await mouseAway(page);
  s = await snapshot(page);
  check(s.mode === "sound" && !s.videos[0].muted && !s.videos[0].paused, "Sesi aç: etkin video sesli oynuyor");
  check(s.videos[0].t >= before - 0.05, "ses açılınca süre sıfırlanmadı", `${before.toFixed(2)} → ${s.videos[0].t.toFixed(2)} sn`);
  await page.waitForTimeout(10_000);
  s = await snapshot(page);
  check(s.index === 0 && s.mode === "sound" && !s.videos[0].paused && s.videos[0].t > before + 8, "ses açıkken 10 sn boyunca otomatik geçiş olmadı, video sürdü", `t=${s.videos[0].t.toFixed(1)} sn`);
  check(s.videos.filter((v) => !v.paused && !v.muted).length === 1, "aynı anda yalnızca bir sesli video");

  // Sesi kapat → otomatik geçiş o andan yeniden başlar.
  await page.getByRole("button", { name: "Sesi kapat" }).click();
  await mouseAway(page);
  const muteAt = Date.now();
  s = await snapshot(page);
  check(s.mode === "auto" && s.videos[0].muted, "Sesi kapat: video sessiz, otomatik mod");
  const afterMute = await waitFor(page, (x) => x.index === 1, 9000, 100);
  const sinceMute = Date.now() - muteAt;
  check(afterMute.ok && sinceMute >= 5000 && sinceMute <= 7000, "ses kapatılınca otomatik geçiş yeniden başladı (~5,5 sn)", `${(sinceMute / 1000).toFixed(2)} sn`);

  // Ses açıkken video sonuna kadar oynar; bitince sıradaki sessiz başlar, otomatik geçiş döner.
  const playToEnd = async (i, { seek }) => {
    await page.getByRole("button", { name: new RegExp(`^${i + 1}\\. video`) }).click();
    await mouseAway(page);
    await waitFor(page, (x) => x.index === i && !x.videos[i].paused, 10_000);
    if ((await snapshot(page)).mode !== "sound") await page.getByRole("button", { name: "Sesi aç" }).click();
    await mouseAway(page);
    if (seek) await page.evaluate((n) => { const v = document.querySelectorAll("[data-author-videos] video")[n]; v.currentTime = Math.max(0, v.duration - 3); }, i);
    const duration = (await snapshot(page)).videos[i].d;
    let changedEarly = false;
    let audibleMax = 0;
    const start = Date.now();
    let snap;
    while (Date.now() - start < (seek ? 15_000 : duration * 1000 + 20_000)) {
      snap = await snapshot(page);
      audibleMax = Math.max(audibleMax, snap.videos.filter((v) => !v.paused && !v.muted).length);
      if (snap.index !== i) break;
      if (snap.mode !== "sound") changedEarly = true;
      await page.waitForTimeout(seek ? 100 : 500);
    }
    const next = (i + 1) % 4;
    const label = seek ? `${i + 1}. video (son 3 sn'ye atlandı)` : `${i + 1}. video (${duration.toFixed(1)} sn baştan sona)`;
    check(!changedEarly && snap.index === next, `${label}: sesli oynadı, bitince sıradakine geçti`, `${((Date.now() - start) / 1000).toFixed(1)} sn`);
    await page.waitForTimeout(600);
    const after = await snapshot(page);
    check(after.mode === "auto" && after.videos[next].muted && !after.videos[next].paused, `${label}: sıradaki video sessiz başladı`);
    check(audibleMax <= 1, `${label}: aynı anda en fazla bir sesli video`);
    return { next, endedAt: Date.now() };
  };

  if (FULL_PLAY) {
    const { next, endedAt } = await playToEnd(1, { seek: false });
    const autoAgain = await waitFor(page, (x) => x.index === (next + 1) % 4, 9000, 100);
    const after = Date.now() - endedAt;
    check(autoAgain.ok && after >= 4000 && after <= 7500, "video bittikten sonra otomatik geçiş yeniden çalıştı", `${(after / 1000).toFixed(2)} sn sonra`);
  } else {
    console.log("  NOT TESTED  99 sn'lik videonun baştan sona sesli oynatılması (FULL_PLAY=0)");
  }
  for (const i of [0, 2, 3]) await playToEnd(i, { seek: true });

  // Duraklat / oynat
  await page.getByRole("button", { name: /^1\. video/ }).click();
  await mouseAway(page);
  await waitFor(page, (x) => x.index === 0 && !x.videos[0].paused, 8000);
  await page.getByRole("button", { name: "Videoyu duraklat" }).click();
  await mouseAway(page);
  await page.waitForTimeout(7000);
  s = await snapshot(page);
  check(s.index === 0 && s.paused && s.videos[0].paused, "Duraklat: video ve otomatik geçiş durdu");
  await page.getByRole("button", { name: "Videoyu oynat" }).click();
  await mouseAway(page);
  s = (await waitFor(page, (x) => !x.videos[0].paused, 4000)).snap;
  check(!s.videos[0].paused && !s.paused, "Oynat: video sürdü");

  // Görünür alandan çıkınca durur, geri gelince sürer.
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await page.waitForTimeout(800);
  const outIndex = (await snapshot(page)).index;
  await page.waitForTimeout(7000);
  s = await snapshot(page);
  const stageVisible = await page.evaluate(() => {
    const r = document.querySelector("[data-author-videos] [data-dir]").getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight ? Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / r.height : 0;
  });
  check(s.videos.every((v) => v.paused) && s.index === outIndex, "görünür alandan çıkınca video ve zamanlayıcı durdu", `görünen oran ${stageVisible.toFixed(2)}`);
  await scrollToStage(page);
  s = (await waitFor(page, (x) => !x.videos[x.index].paused, 4000)).snap;
  check(!s.videos[s.index].paused, "geri gelince oynatma sürdü");

  // Sekme gizlenince (visibilitychange taklidi — MOCK) durur.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(500);
  s = await snapshot(page);
  check(s.videos.every((v) => v.paused), "[MOCK visibilitychange] sekme gizlenince video durdu");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  s = (await waitFor(page, (x) => !x.videos[x.index].paused, 4000)).snap;
  check(!s.videos[s.index].paused, "[MOCK visibilitychange] sekme dönünce sürdü");

  // Klavye: kontroller Tab ile erişilebilir, odak görünür.
  await page.getByRole("button", { name: "Önceki video" }).focus();
  await page.keyboard.press("Tab");
  const focusedName = await page.evaluate(() => document.activeElement.getAttribute("aria-label") ?? document.activeElement.textContent);
  check(/Videoyu (duraklat|oynat)/.test(focusedName), "klavye ile kontroller arasında gezilebiliyor", focusedName);
  const kbPause = (await snapshot(page)).counting === false;
  check(kbPause, "klavye odağı içerideyken otomatik geçiş bekliyor (WAI)");
  await page.keyboard.press("Enter");
  s = await snapshot(page);
  check(s.paused, "Enter ile duraklatıldı");
  await page.keyboard.press("Enter");
  await page.locator("body").focus().catch(() => {});

  await coverCheck(page, "1440");

  // Sayfadan ayrılınca hiçbir video çalmaz (istemci tarafı gezinme).
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.locator("header nav").getByRole("link", { name: "Hizmetler" }).click();
  await page.waitForURL((url) => url.pathname === "/", { timeout: 15_000 });
  await page.waitForTimeout(800);
  const leftovers = await page.evaluate(() => [...document.querySelectorAll("video")].filter((v) => !v.paused && v.closest("[data-author-videos]")).length);
  check(leftovers === 0, "sayfadan ayrılınca çalan yazar videosu kalmadı");
  check(errors.length === 0, "konsol hatası yok", errors.join(" | ").slice(0, 200));
  await context.close();
}

async function reducedMotionSuite(browser) {
  console.log("\n=== Hareket azaltma (1440, prefers-reduced-motion: reduce)");
  const context = await prepareContext(await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" }), base);
  const page = await context.newPage();
  await gotoSettled(page, `${base}/blog`);
  await scrollToStage(page);
  await page.waitForTimeout(4000);
  let s = await snapshot(page);
  check(s.paused && s.videos.every((v) => v.paused), "hareket azaltmada video kendiliğinden oynamıyor");
  const bigPlay = await page.locator("[data-author-videos] [data-dir] > button").count();
  check(bigPlay === 1, "poster üzerinde oynat simgesi görünüyor");
  // Sitenin genel hareket azaltma kuralı süreleri 0,01 ms'ye indirir; slayt ayrıca "transition: none" kullanır.
  const transition = await page.evaluate(() => {
    const style = getComputedStyle(document.querySelector('[data-author-videos] [data-state="active"]'));
    return { property: style.transitionProperty, duration: style.transitionDuration, transform: style.transform };
  });
  const instant = transition.property === "none" || transition.duration.split(",").every((d) => parseFloat(d) <= 0.00001);
  check(instant && transition.transform === "none", "geçiş animasyonu kapalı (anlık geçiş)", JSON.stringify(transition));
  await page.getByRole("button", { name: "Videoyu oynat" }).click();
  s = (await waitFor(page, (x) => !x.videos[0].paused, 6000)).snap;
  check(!s.videos[0].paused, "kullanıcı oynatınca video oynuyor");
  await page.waitForTimeout(7000);
  s = await snapshot(page);
  check(s.index === 0, "hareket azaltmada otomatik geçiş yok");
  await context.close();
}

async function responsiveSuite(browserType, name, widths) {
  const browser = await browserType.launch();
  for (const [w, h] of widths) {
    console.log(`\n=== ${name} ${w}×${h} (öykünme)`);
    const context = await prepareContext(await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 1024 && name !== "WebKit", hasTouch: w < 1024, deviceScaleFactor: 2 }), base);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const requested = [];
    page.on("request", (request) => request.url().endsWith(".mp4") && requested.push(request.url()));
    await gotoSettled(page, `${base}/blog`);
    const farBelow = await page.evaluate(() => document.querySelector("[data-author-videos] [data-dir]").getBoundingClientRect().top > innerHeight + 250);
    if (farBelow) check(requested.length === 0, "sahne uzaktayken hiçbir video indirilmedi", `${requested.length} istek`);
    await scrollToStage(page);
    const started = await waitFor(page, (s) => !s.videos[s.index].paused && s.videos[s.index].t > 0.2, 12_000);
    check(started.ok && started.snap.videos[started.snap.index].muted, "video sessiz otomatik oynuyor", `${started.ms} ms`);
    const g = await geometry(page);
    const layout = await page.evaluate(() => {
      const root = document.querySelector("[data-author-videos]");
      const card = root.closest("section");
      const buttons = [...root.querySelectorAll("button")].filter((b) => b.getAttribute("aria-hidden") !== "true").map((b) => b.getBoundingClientRect());
      const controls = [...root.querySelectorAll("button")].filter((b) => !b.closest("[data-dir]") && !b.getAttribute("aria-label")?.match(/^\d\. video/)).map((b) => b.getBoundingClientRect());
      const overlap = controls.some((a, i) => controls.some((b, j) => j > i && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5));
      const cardRect = card.getBoundingClientRect();
      const inside = buttons.every((b) => b.left >= cardRect.left - 0.5 && b.right <= cardRect.right + 0.5);
      const author = card.querySelector("h2").getBoundingClientRect();
      const stage = root.querySelector("[data-dir]").getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth - innerWidth, minControl: Math.min(...controls.map((b) => Math.min(b.width, b.height))), overlap, inside, authorBelow: author.top >= stage.bottom, bio: getComputedStyle(card.querySelector("p")).fontSize };
    });
    check(g.fit === "contain" && g.content.w <= g.box.w + 0.5 && g.content.h <= g.box.h + 0.5 && Math.abs(g.content.w / g.content.h - 9 / 16) < 0.01, "video kırpılmadan ve esnemeden sığıyor", `sahne ${g.stage.w.toFixed(0)}×${g.stage.h.toFixed(0)}, görüntü ${g.content.w.toFixed(0)}×${g.content.h.toFixed(0)}`);
    check(layout.overflow <= 0, "yatay taşma yok", `${layout.overflow}`);
    check(layout.minControl >= 44 && !layout.overlap && layout.inside, "kontroller ≥44 px, çakışmıyor, kart içinde", `en küçük ${layout.minControl.toFixed(0)} px`);
    check(layout.authorBelow, "yazar bilgileri videonun altında", `biyografi ${layout.bio}`);
    if (w === 390 && name === "Chromium") {
      // Uzun sayfada sahne tamamen görünür alanın dışına çıkar: video ve sayaç durur.
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.waitForTimeout(800);
      const outside = await page.evaluate(() => document.querySelector("[data-author-videos] [data-dir]").getBoundingClientRect().top > innerHeight);
      const parked = (await snapshot(page)).index;
      await page.waitForTimeout(7000);
      const away = await snapshot(page);
      check(outside && away.videos.every((v) => v.paused) && away.index === parked, "sahne tamamen ekran dışındayken video ve otomatik geçiş durdu (7 sn)");
      await scrollToStage(page);
      const back = await waitFor(page, (x) => !x.videos[x.index].paused, 5000);
      check(back.ok, "sahneye dönünce oynatma sürdü");
    }
    await coverCheck(page, `${w}`);
    await scrollToStage(page);
    await waitFor(page, (x) => !x.videos[x.index].paused, 6000);
    // Dokunmatik: sonraki ve ses düğmeleri
    const before = (await snapshot(page)).index;
    await page.getByRole("button", { name: "Sonraki video" }).tap();
    let s = await snapshot(page);
    check(s.index === (before + 1) % 4, "dokunarak sonraki videoya geçildi");
    await waitFor(page, (x) => !x.videos[x.index].paused, 8000);
    await page.getByRole("button", { name: "Sesi aç" }).tap();
    s = await snapshot(page);
    check(s.mode === "sound" && !s.videos[s.index].muted, "dokunarak ses açıldı");
    await page.getByRole("button", { name: "Sesi kapat" }).tap();
    await page.locator("section[aria-label=Yazar]").screenshot({ path: join(out, `yazar-kutusu-${name}-${w}.png`) });
    check(errors.length === 0, "JS hatası yok", errors.join(" | ").slice(0, 160));
    await context.close();
  }
  await browser.close();
}

const browser = await chromium.launch(CHANNEL === "chrome" ? { channel: "chrome", args: ["--mute-audio"] } : { args: ["--mute-audio"] });
try {
  await desktopSuite(browser);
  await reducedMotionSuite(browser);
} catch (error) {
  check(false, `beklenmeyen hata: ${error.message.split("\n")[0]}`);
} finally {
  await browser.close();
}
try {
  await responsiveSuite(chromium, "Chromium", [[360, 800], [390, 844], [430, 932], [768, 1024]]);
  await responsiveSuite(webkit, "WebKit", [[390, 844]]);
} catch (error) {
  check(false, `beklenmeyen hata (mobil): ${error.message.split("\n")[0]}`);
}
console.log(`\nÖZET ${results.filter(Boolean).length}/${results.length} geçti · ekran görüntüleri: ${out}`);
process.exitCode = results.every(Boolean) ? 0 : 1;
