import assert from "node:assert/strict";
import http from "node:http";
import { beforeEach, test } from "node:test";
import { UnsafeUrlError, parseSafeUrl } from "@/lib/ai/netguard";
import { COOLDOWN_MS, cooldownFor, markFailure, resetHealth } from "@/lib/ai/providerHealth";
import { PageFetchError, assertPublicUrl, fetchImage } from "@/lib/ai/safeFetch";
import { DEFAULT_READERS, ReaderError, assessText, availability, markdownToSource, readSource } from "@/lib/ai/sourceReaders";
import { normalizeScreenshots } from "@/lib/ai/screenshots";
import { reviewFill } from "@/lib/ai/templateFill";
import { placeImages } from "@/lib/blog/blocks/placeImages";

// Sahte ama gerçekçi bir makale: 5 paragraf × 60 sözcük.
const paragraph = (seed) => Array.from({ length: 60 }, (_, index) => `${seed}kelime${index}`).join(" ") + ".";
const ARTICLE = Array.from({ length: 5 }, (_, index) => paragraph(`p${index}`)).join("\n\n");
const THIN = "Kısa bir metin.";

const okUrl = async (value) => new URL(value);
const KEYS = { FIRECRAWL_API_KEY: "test-firecrawl", PLAYWRIGHT_READER: "0" };
const result = (text, extra = {}) => ({ url: "https://ornek.com/yazi", title: "Başlık", text, truncated: false, images: [], ...extra });

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function recorder(readers) {
  const calls = [];
  const wrapped = Object.fromEntries(
    Object.entries(readers).map(([name, reader]) => [
      name,
      async (...args) => {
        calls.push(name);
        return reader(...args);
      },
    ])
  );
  return { calls, readers: wrapped };
}

beforeEach(() => resetHealth());

// --- Yeterlilik ölçütü -----------------------------------------------------------

test("yalnızca yeterli ve anlamlı metin başarılı sayılır", () => {
  assert.equal(assessText(ARTICLE).ok, true);
  assert.equal(assessText(THIN).ok, false);
  const menu = Array.from({ length: 300 }, (_, index) => `- Menü ${index}`).join("\n");
  assert.equal(assessText(menu).ok, false);
  const cookieWall = `${ARTICLE}\n\nBu site çerez kullanır.`;
  assert.equal(assessText(cookieWall).ok, false, "kısa metinde çerez duvarı");
});

// --- Sağlayıcı zinciri ----------------------------------------------------------

test("yerel okuyucu yeterliyse başka sağlayıcıya istek gitmez", async () => {
  const { calls, readers } = recorder({
    local: async () => result(ARTICLE),
    jina: async () => assert.fail("Jina çağrılmamalı"),
    firecrawl: async () => assert.fail("Firecrawl çağrılmamalı"),
    browser: async () => assert.fail("Tarayıcı çağrılmamalı"),
  });
  const output = await readSource("https://ornek.com/yazi", { readers, checkUrl: okUrl, env: KEYS });
  assert.deepEqual(calls, ["local"]);
  assert.equal(output.source.provider, "local");
  assert.equal(output.source.wordCount, 300);
});

test("yerel metin yetersizse Jina denenir; olaylar sırayla bildirilir", async () => {
  const events = [];
  const { calls, readers } = recorder({
    local: async () => result(THIN),
    jina: async () => result(ARTICLE),
    firecrawl: async () => assert.fail("Firecrawl çağrılmamalı"),
    browser: async () => assert.fail("Tarayıcı çağrılmamalı"),
  });
  const output = await readSource("https://ornek.com/yazi", {
    readers,
    checkUrl: okUrl,
    env: KEYS,
    onEvent: (event) => events.push(`${event.stage}:${event.status}`),
  });
  assert.deepEqual(calls, ["local", "jina"]);
  assert.equal(output.source.provider, "jina");
  assert.deepEqual(events, ["local:start", "local:thin", "jina:start", "jina:ok"]);
});

test("Jina 429 verirse cooldown'a girer, Firecrawl denenir; sonraki istekte Jina atlanır", async () => {
  let clock = 1_000_000;
  const now = () => clock;
  const fetchImpl = async (resource) => {
    if (String(resource).startsWith("https://r.jina.ai/")) return json(429, { message: "slow down" }, { "retry-after": "120" });
    if (String(resource) === "https://api.firecrawl.dev/v1/scrape") {
      return json(200, { success: true, data: { markdown: ARTICLE, metadata: { title: "FC", sourceURL: "https://ornek.com/yazi" } } });
    }
    throw new Error(`beklenmeyen istek: ${resource}`);
  };
  const readers = { ...DEFAULT_READERS, local: async () => result(THIN) };

  const first = await readSource("https://ornek.com/yazi", { readers, fetchImpl, checkUrl: okUrl, env: KEYS, now });
  assert.equal(first.source.provider, "firecrawl");
  assert.equal(first.source.title, "FC");
  const jina = first.attempts.find((attempt) => attempt.stage === "jina");
  assert.equal(jina.status, "failed");
  assert.equal(jina.kind, "rate");
  assert.equal(cooldownFor("jina", clock).until, clock + 120_000, "Retry-After saniyesi kullanılır");

  clock += 60_000;
  const second = await readSource("https://ornek.com/yazi", { readers, fetchImpl, checkUrl: okUrl, env: KEYS, now });
  const skipped = second.attempts.find((attempt) => attempt.stage === "jina");
  assert.equal(skipped.status, "skipped");
  assert.match(skipped.message, /1 dk sonra/);
  assert.doesNotMatch(skipped.message, /\d{4}-\d{2}/, "kota yenilenme tarihi uydurulmaz");
});

test("Firecrawl anahtarı yoksa atlanır, tarayıcı kapalıysa atlanır; hepsi başarısızsa ekran görüntüsüne düşülür", async () => {
  const { calls, readers } = recorder({
    local: async () => result(THIN),
    jina: async () => {
      throw new ReaderError("Jina geçici bir sunucu hatası verdi (503).", "server");
    },
    firecrawl: async () => assert.fail("anahtar yokken çağrılmamalı"),
    browser: async () => assert.fail("kapalıyken çağrılmamalı"),
  });
  const output = await readSource("https://ornek.com/yazi", { readers, checkUrl: okUrl, env: {} });
  assert.deepEqual(calls, ["local", "jina"]);
  assert.equal(output.source, null);
  assert.equal(output.fallback, "screenshots");
  assert.deepEqual(
    output.attempts.map((attempt) => `${attempt.stage}:${attempt.status}`),
    ["local:thin", "jina:failed", "firecrawl:skipped", "browser:skipped"]
  );
  assert.ok(cooldownFor("jina"), "5xx kısa cooldown başlatır");
});

test("tarayıcı okuyucusu Vercel'de ve bayrak yokken kullanılamaz", () => {
  assert.match(availability("browser", { VERCEL: "1", PLAYWRIGHT_READER: "1" }), /Vercel/);
  assert.match(availability("browser", {}), /PLAYWRIGHT_READER/);
  assert.equal(availability("browser", { PLAYWRIGHT_READER: "1" }), null);
  assert.match(availability("firecrawl", {}), /FIRECRAWL_API_KEY/);
  assert.equal(availability("jina", {}), null, "Jina anahtarsız da çalışır");
});

test("özel ağ ya da var olmayan adresler hiçbir sağlayıcıya gönderilmez", async () => {
  const readers = {
    local: async () => assert.fail("çağrılmamalı"),
    jina: async () => assert.fail("çağrılmamalı"),
    firecrawl: async () => assert.fail("çağrılmamalı"),
    browser: async () => assert.fail("çağrılmamalı"),
  };
  const fetchImpl = async () => assert.fail("ağ isteği yapılmamalı");
  for (const url of ["http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/", "http://intranet/", "http://10.0.0.1/"]) {
    await assert.rejects(() => readSource(url, { readers, fetchImpl, env: KEYS }), (error) => error instanceof ReaderError && error.kind === "blocked", url);
  }
  // DNS'te özel adrese çözülen alan adı
  const privateDns = (value) => assertPublicUrl(value, { resolveHost: async () => { throw new UnsafeUrlError("Yerel ya da özel ağ adresi."); } });
  await assert.rejects(() => readSource("https://ic.ornek.com/", { readers, fetchImpl, env: KEYS, checkUrl: privateDns }), (error) => error.kind === "blocked");
  // Bulunamayan alan adı
  const missing = (value) => assertPublicUrl(value, { resolveHost: async () => { throw Object.assign(new Error("nx"), { code: "ENOTFOUND" }); } });
  await assert.rejects(() => readSource("https://yok-boyle-bir-alan.example/", { readers, fetchImpl, env: KEYS, checkUrl: missing }), (error) => error.kind === "notfound");
});

test("yerel okuyucu alan adının bulunmadığını söylerse zincir durur", async () => {
  const { calls, readers } = recorder({
    local: async () => {
      throw new ReaderError("Bu alan adı bulunamadı.", "notfound");
    },
    jina: async () => assert.fail("çağrılmamalı"),
    firecrawl: async () => assert.fail("çağrılmamalı"),
    browser: async () => assert.fail("çağrılmamalı"),
  });
  await assert.rejects(() => readSource("https://ornek.com/", { readers, checkUrl: okUrl, env: KEYS }), (error) => error.kind === "notfound");
  assert.deepEqual(calls, ["local"]);
});

test("Firecrawl 402 verirse uzun cooldown başlar ve kullanıcıya kota mesajı gider", async () => {
  const fetchImpl = async (resource) => {
    if (String(resource).startsWith("https://r.jina.ai/")) return json(200, { data: { content: THIN } });
    return json(402, { error: "Payment required" });
  };
  const readers = { ...DEFAULT_READERS, local: async () => result(THIN) };
  const output = await readSource("https://ornek.com/yazi", { readers, fetchImpl, checkUrl: okUrl, env: KEYS, now: () => 0 });
  const firecrawl = output.attempts.find((attempt) => attempt.stage === "firecrawl");
  assert.equal(firecrawl.kind, "quota");
  assert.match(firecrawl.message, /kotası ya da kredisi bitti/);
  assert.equal(cooldownFor("firecrawl", 0).until, COOLDOWN_MS.quota);
  assert.equal(output.fallback, "screenshots");
});

test("Jina isteği anahtar varsa Bearer ile, yoksa anahtarsız gönderilir", async () => {
  const seen = [];
  const fetchImpl = async (resource, init) => {
    seen.push({ resource: String(resource), auth: init.headers.authorization ?? null });
    return json(200, { data: { title: "J", content: ARTICLE } });
  };
  const readers = { ...DEFAULT_READERS, local: async () => result(THIN) };
  await readSource("https://ornek.com/yazi", { readers, fetchImpl, checkUrl: okUrl, env: {} });
  await readSource("https://ornek.com/yazi", { readers, fetchImpl, checkUrl: okUrl, env: { JINA_API_KEY: "anahtar" } });
  assert.equal(seen[0].resource, "https://r.jina.ai/https://ornek.com/yazi");
  assert.equal(seen[0].auth, null);
  assert.equal(seen[1].auth, "Bearer anahtar");
});

// --- Markdown ve görseller --------------------------------------------------------

test("Jina Markdown çıktısı metne ve görsel listesine ayrılır", () => {
  const markdown = [
    "# Başlık",
    "",
    "Giriş [bağlantılı](https://ornek.com/x) metin.",
    "",
    "![Grafik açıklaması](https://cdn.ornek.com/grafik.webp \"başlık\")",
    "",
    "[![Kapak](/kapak.jpg)](https://ornek.com/buyuk)",
    "",
    "![](https://cdn.ornek.com/logo.png)",
    "![](https://cdn.ornek.com/pixel.gif)",
    "![tekrar](https://cdn.ornek.com/grafik.webp)",
  ].join("\n");
  const { text, images } = markdownToSource(markdown, "https://ornek.com/yazi");
  assert.match(text, /Giriş bağlantılı metin\./);
  assert.match(text, /\[Görsel: Grafik açıklaması\]/);
  assert.doesNotMatch(text, /https?:\/\//);
  assert.deepEqual(
    images.map((image) => [image.src, image.alt]),
    [
      // Bağlantılı görseller ilk geçişte ayrılır.
      ["https://ornek.com/kapak.jpg", "Kapak"],
      ["https://cdn.ornek.com/grafik.webp", "Grafik açıklaması"],
    ]
  );
});

// --- Cooldown ----------------------------------------------------------------------

test("Retry-After saniye ya da tarih olarak okunur; makul değilse varsayılan kullanılır", () => {
  const now = Date.parse("2026-10-18T10:00:00Z");
  assert.equal(markFailure("jina", "rate", { retryAfter: "30", now }).until, now + 30_000);
  assert.equal(markFailure("jina", "rate", { retryAfter: "Sun, 18 Oct 2026 10:05:00 GMT", now }).until, now + 5 * 60_000);
  assert.equal(markFailure("jina", "rate", { retryAfter: "999999999", now }).until, now + COOLDOWN_MS.rate);
  assert.equal(markFailure("jina", "rate", { retryAfter: "abc", now }).until, now + COOLDOWN_MS.rate);
  assert.equal(markFailure("jina", "config", { now }), null, "yapılandırma hatası cooldown değildir");
  assert.equal(cooldownFor("jina", now + COOLDOWN_MS.rate + 1), null, "süre dolunca temizlenir");
});

// --- Ekran görüntüsü çıktısı -------------------------------------------------------

test("ekran görüntüsü çıktısı sıralı metne çevrilir, tekrarlar atılır, okunamayanlar korunur", () => {
  const raw = {
    title: "  Rehber  ",
    sections: [
      { heading: "Giriş", level: 2, paragraphs: ["Birinci paragraf.", "İkinci paragraf."], items: [], ordered: false },
      // İki ekran görüntüsünün kesiştiği yerde tekrar eden içerik
      { heading: "Giriş", level: 2, paragraphs: ["İkinci  paragraf.", "Üçüncü paragraf."], items: ["a", "b"], ordered: true },
    ],
    tables: [{ caption: "Fiyatlar", rows: [{ cells: ["Paket", "Fiyat"] }, { cells: ["Temel", "100"] }] }],
    faqs: [{ question: "Ne kadar sürer?", answer: "İki hafta." }, { question: "", answer: "boş" }],
    images: [{ screenshot: 9, description: "Bir grafik", context: "Giriş" }, { screenshot: 1, description: "" }],
    unreadable: ["3. görüntünün alt kısmı bulanık", ""],
  };
  const output = normalizeScreenshots(raw, 3);
  assert.equal(output.title, "Rehber");
  assert.equal(output.text.match(/## Giriş/g).length, 1);
  assert.equal(output.text.match(/İkinci/g).length, 1);
  assert.match(output.text, /Üçüncü paragraf\./);
  assert.match(output.text, /1\. a\n2\. b/);
  assert.match(output.text, /\| Temel \| 100 \|/);
  assert.match(output.text, /\*\*Ne kadar sürer\?\*\*\nİki hafta\./);
  assert.deepEqual(output.images, [{ screenshot: 3, description: "Bir grafik", context: "Giriş" }]);
  assert.deepEqual(output.unreadable, ["3. görüntünün alt kısmı bulanık"]);
  assert.ok(output.wordCount > 10);
});

// --- Görsel yerleştirme ------------------------------------------------------------

const media = (id) => ({ media: { id, url: `https://cdn.test/${id}.webp`, width: 1200, height: 800 }, alt: `Alt ${id}` });

test("görseller boş alanlara sırayla yerleşir; kapak bloklara konmaz; dolu alan korunur", () => {
  const blocks = [
    { id: "h", type: "hero", props: { image: null } },
    { id: "t", type: "text", props: {} },
    { id: "i", type: "image", props: { image: { url: "https://cdn.test/mevcut.webp", alt: "Mevcut" } } },
    { id: "it", type: "imageText", props: { image: null } },
    { id: "g", type: "gallery", props: { items: [{ id: "g1", image: null, title: "", caption: "" }] } },
  ];
  const output = placeImages(blocks, [media("kapak"), media("a"), media("b"), media("c")], { coverId: "kapak" });
  assert.deepEqual(output.cover, { media: media("kapak").media, alt: "Alt kapak" });
  assert.equal(output.blocks[0].props.image.url, "https://cdn.test/a.webp");
  assert.equal(output.blocks[0].props.image.alt, "Alt a");
  assert.equal(output.blocks[2].props.image.url, "https://cdn.test/mevcut.webp", "dolu alan değişmez");
  assert.equal(output.blocks[3].props.image.url, "https://cdn.test/b.webp");
  assert.deepEqual(output.blocks[4].props.items.map((item) => item.image.url), ["https://cdn.test/c.webp"]);
  assert.equal(output.placed, 3);
  assert.equal(output.leftover, 0);
  assert.equal(blocks[0].props.image, null, "girdi değiştirilmez");
});

const heading = (id, text) => ({ id, type: "heading", props: { level: "2", text } });
const textBlock = (id) => ({ id, type: "text", props: { doc: { type: "doc", content: [] } } });

test("artan görseller önerilen bölümün, yoksa görselsiz H2 bölümünün altına eklenir", () => {
  const blocks = [
    heading("h1", "Giriş"), textBlock("p1"),
    heading("h2", "Kurulum"), textBlock("p2"),
    heading("h3", "Ölçüm"), textBlock("p3"),
    heading("h4", "Sonuç"), textBlock("p4"),
  ];
  const output = placeImages(blocks, [media("a"), media("b"), media("c"), media("d")], {
    placements: [{ imageId: "b", afterBlockId: "p3" }, { imageId: "a", afterBlockId: "olmayan" }],
  });
  const order = output.blocks.map((block) => (block.type === "image" ? `img:${block.props.image.url.split("/").pop()}` : block.id));
  assert.deepEqual(order, ["h1", "p1", "img:a.webp", "h2", "p2", "img:c.webp", "h3", "p3", "img:b.webp", "h4", "p4"]);
  assert.equal(output.inserted, 3);
  assert.equal(output.leftover, 1, "Sonuç bölümüne görsel konmaz; yer kalmayan görsel bildirilir");
});

test("görsel yoksa bloklar aynen kalır", () => {
  const blocks = [{ id: "i", type: "image", props: { image: null } }];
  assert.deepEqual(placeImages(blocks, []).blocks, blocks);
});

// --- Uzunluk ve kalite uyarıları ----------------------------------------------------

test("taslak kabul aralığının (hedefin %90'ı) altındaysa uyarı verilir; uydurma sayı işaretlenir", () => {
  const short = reviewFill({ text: "Bir iki üç dört beş.", targetWords: 1000 });
  assert.equal(short.words, 5);
  assert.match(short.warnings[0], /hedef ≈1000 sözcük \(kabul aralığı 900–1100\)/);

  const longEnough = reviewFill({ text: ARTICLE, targetWords: 300 });
  assert.equal(longEnough.warnings.length, 0);

  const numbers = reviewFill({ text: `${ARTICLE} Dönüşüm %87 arttı.`, targetWords: 300, sourceText: "Kaynakta sayı yok." });
  assert.ok(numbers.warnings.some((warning) => /Kaynakta geçmeyen sayılar/.test(warning)));
});

// --- Görsel indirme -----------------------------------------------------------------

async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const checkUrl = (value) => (String(value).startsWith(origin) ? new URL(value) : parseSafeUrl(value));
  try {
    await run(origin, { checkUrl });
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

test("kaynak görseli yalnızca görsel türündeyse, sınır içindeyse ve özel ağa yönlenmiyorsa indirilir", async () => {
  const png = Buffer.from("89504e470d0a1a0a", "hex");
  await withServer(
    (request, response) => {
      if (request.url === "/gorsel.png") {
        response.writeHead(200, { "content-type": "image/png" });
        return response.end(png);
      }
      if (request.url === "/sayfa") {
        response.writeHead(200, { "content-type": "text/html" });
        return response.end("<p>html</p>");
      }
      if (request.url === "/buyuk") {
        response.writeHead(200, { "content-type": "image/jpeg", "content-length": String(9 * 1024 * 1024) });
        return response.end();
      }
      if (request.url === "/metadata") {
        response.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
        return response.end();
      }
      response.writeHead(404);
      response.end();
    },
    async (origin, options) => {
      const image = await fetchImage(`${origin}/gorsel.png`, options);
      assert.equal(image.contentType, "image/png");
      assert.deepEqual(Buffer.from(image.body), png);
      await assert.rejects(() => fetchImage(`${origin}/sayfa`, options), /görsel değil/);
      await assert.rejects(() => fetchImage(`${origin}/buyuk`, options), /8 MB/);
      await assert.rejects(() => fetchImage(`${origin}/metadata`, options), UnsafeUrlError);
      await assert.rejects(() => fetchImage("http://10.0.0.1/a.png"), UnsafeUrlError);
    }
  );
});

test("assertPublicUrl biçimi ve DNS'i denetler", async () => {
  await assert.rejects(() => assertPublicUrl("http://localhost/"), UnsafeUrlError);
  await assert.rejects(() => assertPublicUrl("https://ornek.com:8443/"), UnsafeUrlError);
  const url = await assertPublicUrl("https://ornek.com/yazi", { resolveHost: async () => ({ address: "93.184.216.34" }) });
  assert.equal(url.href, "https://ornek.com/yazi");
  await assert.rejects(
    () => assertPublicUrl("https://yok.example/", { resolveHost: async () => { throw Object.assign(new Error("x"), { code: "ENOTFOUND" }); } }),
    (error) => error instanceof PageFetchError && /bulunamadı/.test(error.message)
  );
});

test("hedef sayfa 404 ise sağlayıcının döndürdüğü metin makale sayılmaz", async () => {
  const fetchImpl = async (resource) => {
    if (String(resource).startsWith("https://r.jina.ai/")) return json(200, { data: { title: "Hubspot 404", content: ARTICLE, httpStatus: 404 } });
    return json(200, { success: true, data: { markdown: ARTICLE, metadata: { title: "404", statusCode: 404 } } });
  };
  const readers = { ...DEFAULT_READERS, local: async () => result(THIN) };
  const output = await readSource("https://ornek.com/yok", { readers, fetchImpl, checkUrl: okUrl, env: KEYS });
  assert.equal(output.source, null);
  const jina = output.attempts.find((attempt) => attempt.stage === "jina");
  const firecrawl = output.attempts.find((attempt) => attempt.stage === "firecrawl");
  assert.equal(jina.kind, "notfound");
  assert.equal(firecrawl.kind, "notfound");
});

test("kaynak sunucu 404/410 dönerse hata durum kodunu ve 'bulunamadı' mesajını taşır (zincir bu durumda durur)", async () => {
  await withServer(
    (request, response) => {
      response.writeHead(request.url === "/gitti" ? 410 : request.url === "/yok" ? 404 : 503, { "content-type": "text/html" });
      response.end("<h1>Hata</h1>");
    },
    async (origin, options) => {
      const { fetchPage } = await import("@/lib/ai/safeFetch");
      for (const [path, status] of [["/yok", 404], ["/gitti", 410]]) {
        await assert.rejects(() => fetchPage(`${origin}${path}`, options), (error) => error.status === status && /sayfa bulunamadı/.test(error.message));
      }
      await assert.rejects(() => fetchPage(`${origin}/bakim`, options), (error) => error.status === 503 && !/bulunamadı/.test(error.message));
    }
  );
});

// --- Belirli okuma yöntemi ve ortam desteği -------------------------------------------

test("belirli yöntem seçilince yalnızca o okuyucu çalışır; zincir ilerlemez", async () => {
  const { calls, readers } = recorder({
    local: async () => assert.fail("çağrılmamalı"),
    jina: async () => result(THIN),
    firecrawl: async () => assert.fail("Firecrawl'a geçilmemeli (kredi)"),
    browser: async () => assert.fail("çağrılmamalı"),
  });
  const output = await readSource("https://ornek.com/yazi", { readers, checkUrl: okUrl, env: KEYS, only: "jina" });
  assert.deepEqual(calls, ["jina"]);
  assert.equal(output.source, null);
  assert.equal(output.fallback, "screenshots");
});

test("seçilen yöntem bu ortamda yoksa anlaşılır yapılandırma hatası; hiçbir okuyucu çağrılmaz", async () => {
  const readers = { local: async () => assert.fail(), jina: async () => assert.fail(), firecrawl: async () => assert.fail(), browser: async () => assert.fail() };
  await assert.rejects(() => readSource("https://ornek.com/yazi", { readers, checkUrl: okUrl, env: {}, only: "firecrawl" }), (error) => error.kind === "config" && /Firecrawl anahtarı yapılandırılmamış/.test(error.message));
  await assert.rejects(() => readSource("https://ornek.com/yazi", { readers, checkUrl: okUrl, env: { VERCEL: "1", PLAYWRIGHT_READER: "1" }, only: "browser" }), (error) => error.kind === "config" && /Vercel/.test(error.message));
  await assert.rejects(() => readSource("https://ornek.com/yazi", { readers, checkUrl: okUrl, env: {}, only: "uydurma" }), (error) => error.kind === "config");
});

test("belirli yöntemde de özel ağ adresi hiçbir okuyucuya gitmez", async () => {
  const readers = { local: async () => assert.fail(), jina: async () => assert.fail(), firecrawl: async () => assert.fail(), browser: async () => assert.fail() };
  await assert.rejects(() => readSource("http://169.254.169.254/latest/meta-data/", { readers, env: KEYS, only: "jina" }), (error) => error.kind === "blocked");
});

test("ortam desteği: Vercel'de tarayıcı yok, anahtarsız Firecrawl yok, yerel ve Jina her zaman var", async () => {
  const { providerOptions } = await import("@/lib/ai/sourceReaders");
  const vercel = Object.fromEntries(providerOptions({ VERCEL: "1" }).map((item) => [item.key, item]));
  assert.equal(vercel.local.available, true);
  assert.equal(vercel.jina.available, true);
  assert.equal(vercel.firecrawl.available, false);
  assert.equal(vercel.firecrawl.paid, true);
  assert.equal(vercel.browser.available, false);
  assert.match(vercel.browser.reason, /Vercel/);
  const local = Object.fromEntries(providerOptions({ FIRECRAWL_API_KEY: "x", PLAYWRIGHT_READER: "1" }).map((item) => [item.key, item]));
  assert.equal(local.firecrawl.available, true);
  assert.equal(local.browser.available, true);
  assert.ok(!JSON.stringify(local).includes("\"x\""), "anahtar değeri yanıta girmez");
});
