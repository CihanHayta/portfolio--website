// JavaScript ile içerik yükleyen sayfalar için tarayıcı okuyucusu (Playwright).
// Yalnızca yerelde ya da kendi sunucunuzda, PLAYWRIGHT_READER=1 iken çalışır;
// Vercel'de kullanılmaz. Üçüncü taraf API kotası değil, bu makinenin tarayıcı
// kaynaklarını kullanır.
//
// Ağ güvenliği: Chromium hiçbir alan adını kendisi çözemez (host-resolver-rules);
// sayfanın her isteği yakalanır ve SSRF korumalı Node istemcisiyle, denetlenmiş
// herkese açık IP'ye sabitlenerek yapılır. Görsel, medya, font ve stil
// istekleri hiç yapılmaz; WebSocket bağlantıları kapatılır.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ExtractError, extractArticle, sourceToText } from "./extract.js";
import { guardedFetchRaw } from "./safeFetch.js";
import { ReaderError, normalizeImages } from "./sourceReaders.js";

const BLOCKED_TYPES = new Set(["image", "media", "font", "stylesheet", "manifest", "texttrack", "eventsource"]);
const MAX_NAVIGATIONS = 6;

// PLAYWRIGHT_CHROMIUM_PATH verilmezse Playwright'ın indirdiği headless kabuk aranır.
export function findChromium(env = process.env) {
  if (env.PLAYWRIGHT_CHROMIUM_PATH) return fs.existsSync(env.PLAYWRIGHT_CHROMIUM_PATH) ? env.PLAYWRIGHT_CHROMIUM_PATH : null;
  const cache = env.PLAYWRIGHT_BROWSERS_PATH || path.join(/*turbopackIgnore: true*/ os.homedir(), process.platform === "darwin" ? "Library/Caches/ms-playwright" : ".cache/ms-playwright");
  let dirs = [];
  try {
    dirs = fs.readdirSync(cache).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse();
  } catch {
    return null;
  }
  for (const dir of dirs) {
    for (const sub of ["chrome-headless-shell-mac-arm64", "chrome-headless-shell-mac-x64", "chrome-headless-shell-linux64", "chrome-linux"]) {
      for (const bin of ["chrome-headless-shell", "headless_shell"]) {
        const candidate = path.join(/*turbopackIgnore: true*/ cache, dir, sub, bin);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}

const flattenHeaders = (headers) =>
  Object.fromEntries(
    Object.entries(headers)
      .filter(([key]) => !/^(content-encoding|transfer-encoding|connection|content-security-policy)$/i.test(key))
      .map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : String(value)])
  );

export async function readWithBrowser(url, { timeoutMs = 20_000, env = process.env } = {}) {
  let playwright;
  try {
    playwright = await import("playwright-core");
  } catch {
    throw new ReaderError("Tarayıcı okuyucusu için playwright-core kurulu değil.", "config");
  }
  const executablePath = findChromium(env);
  if (!executablePath) throw new ReaderError("Bu makinede Chromium bulunamadı (PLAYWRIGHT_CHROMIUM_PATH).", "config");

  const deadline = Date.now() + timeoutMs;
  const left = (cap) => Math.max(500, Math.min(cap, deadline - Date.now()));

  let browser;
  try {
    browser = await playwright.chromium.launch({
      executablePath,
      headless: true,
      timeout: left(8_000),
      // Tarayıcı doğrudan ağa çıkamaz; her istek aşağıdaki route üzerinden yapılır.
      args: ["--host-resolver-rules=MAP * ~NOTFOUND", "--disable-dev-shm-usage", "--no-first-run"],
    });
  } catch {
    throw new ReaderError("Tarayıcı başlatılamadı.", "config");
  }

  try {
    const context = await browser.newContext({
      locale: "tr-TR",
      serviceWorkers: "block",
      acceptDownloads: false,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    });
    await context.routeWebSocket(/.*/, (socket) => socket.close());

    let navigations = 0;
    await context.route("**/*", async (route) => {
      const request = route.request();
      if (BLOCKED_TYPES.has(request.resourceType())) return route.abort("blockedbyclient");
      if (request.isNavigationRequest() && (navigations += 1) > MAX_NAVIGATIONS) return route.abort("blockedbyclient");
      try {
        const response = await guardedFetchRaw(request.url(), {
          method: request.method(),
          headers: request.headers(),
          body: request.postDataBuffer(),
        });
        await route.fulfill({ status: response.status, headers: flattenHeaders(response.headers), body: response.body });
      } catch {
        await route.abort("blockedbyclient").catch(() => {});
      }
    });

    const page = await context.newPage();
    const response = await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: left(15_000) }).catch(() => null);
    if (!response) throw new ReaderError("Tarayıcı sayfayı açamadı.", "unreachable");
    if (response.status() >= 400) throw new ReaderError(`Tarayıcı sayfayı okuyamadı (sunucu ${response.status()} yanıtı verdi).`, "unreachable");

    // Betikle yüklenen metnin gelmesi beklenir; gelmezse eldeki içerikle devam edilir.
    await page
      .waitForFunction(() => (document.body?.innerText ?? "").split(/\s+/).length > 250, null, { timeout: left(7_000) })
      .catch(() => {});

    const html = await page.content();
    const finalUrl = page.url();
    const domImages = await page
      .$$eval("img", (elements) =>
        elements.map((element) => ({
          src: element.currentSrc || element.getAttribute("src") || element.getAttribute("data-src") || "",
          alt: element.getAttribute("alt") || "",
          role: "content",
        }))
      )
      .catch(() => []);

    let article;
    try {
      article = extractArticle(html, finalUrl);
    } catch (error) {
      if (error instanceof ExtractError) throw new ReaderError(error.message, "thin");
      throw error;
    }
    const { text, truncated, missingFrom } = sourceToText(article, 36_000);
    return {
      url: article.canonicalUrl || finalUrl,
      title: article.title || article.metaTitle || "",
      text,
      truncated,
      missingFrom,
      images: normalizeImages([...article.images, ...domImages], finalUrl),
    };
  } finally {
    // Tarayıcı her durumda kapatılır.
    await browser.close().catch(() => {});
  }
}
