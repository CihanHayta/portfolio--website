import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import { isIP } from "node:net";
import { UnsafeUrlError, isPublicAddress, parseSafeUrl } from "./netguard.js";

// Kullanıcının verdiği adresteki HTML sayfasını güvenli biçimde indirir:
// - Alan adı bağlantı anında çözülür ve çözülen her IP denetlenir (DNS rebinding dahil).
// - Yönlendirmeler elle izlenir; her adım baştan doğrulanır.
// - Toplam süre, yanıt boyutu ve içerik türü sınırlıdır.

export class PageFetchError extends Error {}

const MAX_REDIRECTS = 5;
const MAX_BYTES = 3 * 1024 * 1024;
const TOTAL_TIMEOUT_MS = 15_000;
const HTML_TYPES = ["text/html", "application/xhtml+xml"];

const REQUEST_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
  "accept-language": "tr-TR,tr;q=0.9,en;q=0.8",
  "accept-encoding": "gzip, deflate, br",
};

const NOT_FOUND = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);
const PUBLIC_DNS = ["1.1.1.1", "8.8.8.8"];

// Sistem DNS'i özel bir adres döndürdüğünde ikinci görüş: herkese açık
// çözümleyicilere doğrudan sorulur. Bazı ev modemleri çözemedikleri her alan
// adına kendi adreslerini (ör. 192.168.1.1) verir; gerçekte olmayan bir alan
// adı böylece "özel ağ" gibi görünür. Sonuç { status: "found" | "notfound" |
// "unavailable", addresses } olarak döner.
export function resolvePublicly(hostname, { servers = PUBLIC_DNS, timeout = 2500 } = {}) {
  const resolver = new dns.Resolver({ timeout, tries: 1 });
  resolver.setServers(servers);
  const ask = (method, family) =>
    new Promise((resolve) =>
      resolver[method](hostname, (error, list) =>
        resolve(error ? { code: error.code } : { addresses: list.map((address) => ({ address, family })) })
      )
    );
  return Promise.all([ask("resolve4", 4), ask("resolve6", 6)]).then((answers) => {
    const addresses = answers.flatMap((answer) => answer.addresses ?? []);
    if (addresses.length) return { status: "found", addresses };
    if (answers.every((answer) => NOT_FOUND.has(answer.code)) && answers.some((answer) => answer.code !== "ENODATA")) {
      return { status: "notfound", addresses: [] };
    }
    return { status: "unavailable", addresses: [] };
  });
}

const notFoundError = () => Object.assign(new Error("alan adı bulunamadı"), { code: "ENOTFOUND" });
const allPublic = (addresses) => addresses.length > 0 && addresses.every(({ address }) => isPublicAddress(address));

// http(s).request'in DNS çözümlemesinin yerine geçer: bağlantı yalnızca
// denetlenmiş, herkese açık bir adrese kurulur. Denetlenen adres doğrudan
// bağlantıda kullanıldığı için DNS kontrolüyle istek arasında adres değişemez
// (DNS rebinding); TLS sertifikası yine URL'deki alan adına göre doğrulanır.
// Sistem DNS'i özel bir adres verirse bağlantı kurulmadan ikinci görüş alınır:
// - alan adı gerçekte yoksa "bulunamadı" hatası,
// - herkese açık çözümleyiciler de özel adres veriyorsa güvenlik hatası,
// - yalnızca herkese açık adresler dönerse bağlantı o adreslere sabitlenir,
// - doğrulama yapılamazsa (ağ engeli, zaman aşımı) güvenlik hatası.
// Bir alan adını çözümler ve yalnızca herkese açık adresler dönerse onları verir.
// Sistem DNS'i özel bir adres verirse bağlantı kurulmadan ikinci görüş alınır:
// - alan adı gerçekte yoksa ENOTFOUND hatası,
// - herkese açık çözümleyiciler de özel adres veriyorsa güvenlik hatası,
// - yalnızca herkese açık adresler dönerse o adresler,
// - doğrulama yapılamazsa (ağ engeli, zaman aşımı) güvenlik hatası.
export function resolvePublicHost(hostname, { resolve = dns.lookup, secondOpinion = resolvePublicly } = {}) {
  return new Promise((done, fail) => {
    resolve(hostname, { all: true }, (error, addresses) => {
      if (error) return fail(error);
      if (allPublic(addresses)) return done(addresses);

      secondOpinion(hostname).then(
        (answer) => {
          if (answer.status === "notfound") return fail(notFoundError());
          if (answer.status === "found" && allPublic(answer.addresses)) return done(answer.addresses);
          if (answer.status === "found") {
            return fail(new UnsafeUrlError("Bu alan adı yerel ya da özel bir ağ adresine çözülüyor; güvenlik nedeniyle okunamaz."));
          }
          return fail(
            new UnsafeUrlError(
              "Alan adı bu ağın DNS sunucusunda yerel bir adrese çözüldü ve herkese açık DNS ile doğrulanamadı. Bağlantıyı ve ağınızın DNS ayarlarını kontrol edin."
            )
          );
        },
        () => fail(new UnsafeUrlError("Alan adının adresi doğrulanamadı. Biraz sonra yeniden deneyin."))
      );
    });
  });
}

// http(s).request'in DNS çözümlemesinin yerine geçer: bağlantı yalnızca
// denetlenmiş, herkese açık bir adrese kurulur. Denetlenen adres doğrudan
// bağlantıda kullanıldığı için DNS kontrolüyle istek arasında adres değişemez
// (DNS rebinding); TLS sertifikası yine URL'deki alan adına göre doğrulanır.
export function createGuardedLookup(resolve = dns.lookup, secondOpinion = resolvePublicly) {
  return (hostname, options, callback) => {
    resolvePublicHost(hostname, { resolve, secondOpinion }).then((addresses) => {
      const usable = options.family ? addresses.filter(({ family }) => family === options.family) : addresses;
      const list = usable.length ? usable : addresses;
      if (options.all) return callback(null, list);
      return callback(null, list[0].address, list[0].family);
    }, callback);
  };
}

const guardedLookup = createGuardedLookup();

function requestOnce(url, deadline, lookup, { types = HTML_TYPES, maxBytes = MAX_BYTES, typeError, sizeError } = {}) {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new PageFetchError("Sayfa zamanında yanıt vermedi."));

    const client = url.protocol === "https:" ? https : http;
    const request = client.request(
      url,
      { method: "GET", headers: REQUEST_HEADERS, lookup, agent: false },
      (response) => {
        const status = response.statusCode ?? 0;

        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          clearTimeout(timer);
          return resolve({ redirect: response.headers.location });
        }
        if (status < 200 || status >= 300) {
          response.resume();
          clearTimeout(timer);
          // Kaynak sunucu sayfanın olmadığını kesin olarak bildirdiyse ayrı bir mesaj verilir.
          const failure = new PageFetchError(
            status === 404 || status === 410
              ? `Bu adreste bir sayfa bulunamadı (sunucu ${status} yanıtı verdi). Bağlantıyı kontrol edin.`
              : `Sayfa okunamadı (sunucu ${status} yanıtı verdi).`
          );
          failure.status = status;
          return reject(failure);
        }

        const type = String(response.headers["content-type"] ?? "").toLowerCase();
        if (!types.some((allowed) => type.startsWith(allowed))) {
          request.destroy();
          clearTimeout(timer);
          return reject(new PageFetchError(typeError ?? "Bu bağlantı bir web sayfası değil (HTML bekleniyordu)."));
        }

        // Bildirilen boyut sınırı aşıyorsa gövde hiç okunmaz.
        if (Number(response.headers["content-length"]) > maxBytes) {
          request.destroy();
          clearTimeout(timer);
          return reject(new PageFetchError(sizeError ?? "Sayfa çok büyük (3 MB sınırı)."));
        }

        const encoding = String(response.headers["content-encoding"] ?? "").toLowerCase();
        let stream = response;
        if (encoding === "gzip" || encoding === "x-gzip") stream = response.pipe(zlib.createGunzip());
        else if (encoding === "deflate") stream = response.pipe(zlib.createInflate());
        else if (encoding === "br") stream = response.pipe(zlib.createBrotliDecompress());

        const chunks = [];
        let size = 0;
        stream.on("data", (chunk) => {
          size += chunk.length;
          if (size > maxBytes) {
            request.destroy();
            clearTimeout(timer);
            reject(new PageFetchError(sizeError ?? "Sayfa çok büyük (3 MB sınırı)."));
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () => {
          clearTimeout(timer);
          resolve({ body: Buffer.concat(chunks), contentType: type });
        });
        stream.on("error", () => {
          clearTimeout(timer);
          reject(new PageFetchError("Sayfa içeriği çözülemedi."));
        });
      }
    );

    const timer = setTimeout(() => {
      request.destroy();
      reject(new PageFetchError("Sayfa zamanında yanıt vermedi."));
    }, remaining);

    request.on("error", (error) => {
      clearTimeout(timer);
      if (error instanceof UnsafeUrlError) return reject(error);
      if (error.code === "ENOTFOUND" || error.code === "EAI_AGAIN") {
        return reject(new PageFetchError("Bu alan adı bulunamadı."));
      }
      reject(new PageFetchError("Sayfaya bağlanılamadı."));
    });
    request.end();
  });
}

function decodeHtml(body, contentType) {
  const fromHeader = contentType.match(/charset=["']?([\w-]+)/i)?.[1];
  const fromMeta = body
    .subarray(0, 4096)
    .toString("latin1")
    .match(/<meta[^>]+charset=["']?\s*([\w-]+)/i)?.[1];
  for (const label of [fromHeader, fromMeta, "utf-8"]) {
    if (!label) continue;
    try {
      return new TextDecoder(label).decode(body);
    } catch {
      // Bilinmeyen karakter kümesi; sıradakini dene.
    }
  }
  return body.toString("utf8");
}

// Yönlendirmeleri elle izler; her adımın adresi baştan doğrulanır.
async function follow(input, { checkUrl, lookup, timeoutMs, request }) {
  let url = checkUrl(input);
  const deadline = Date.now() + timeoutMs;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const result = await requestOnce(url, deadline, lookup, request);
    if (result.redirect === undefined) return { url, result };
    let next;
    try {
      next = new URL(result.redirect, url);
    } catch {
      throw new PageFetchError("Sayfa geçersiz bir adrese yönlendiriyor.");
    }
    // Yönlendirilen adres de ilk adresle aynı denetimlerden geçer.
    url = checkUrl(next.href);
  }
  throw new PageFetchError("Sayfa çok fazla yönlendirme yapıyor.");
}

// `checkUrl`, `lookup` ve `timeoutMs` yalnızca testlerde değiştirilir.
export async function fetchPage(input, { checkUrl = parseSafeUrl, lookup = guardedLookup, timeoutMs = TOTAL_TIMEOUT_MS } = {}) {
  const { url, result } = await follow(input, { checkUrl, lookup, timeoutMs });
  return { finalUrl: url.href, html: decodeHtml(result.body, result.contentType) };
}

const IMAGE_TIMEOUT_MS = 20_000;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// Kaynak sayfadaki bir görseli aynı güvenlik kurallarıyla indirir. İçerik türü
// yalnızca ilk süzgeçtir; dosyanın gerçekten görsel olduğu sonra sharp ile doğrulanır.
export async function fetchImage(input, { checkUrl = parseSafeUrl, lookup = guardedLookup, timeoutMs = IMAGE_TIMEOUT_MS } = {}) {
  const { url, result } = await follow(input, {
    checkUrl,
    lookup,
    timeoutMs,
    request: {
      types: ["image/"],
      maxBytes: MAX_IMAGE_BYTES,
      typeError: "Bu bağlantı bir görsel değil.",
      sizeError: "Görsel çok büyük (8 MB sınırı).",
    },
  });
  return { finalUrl: url.href, body: result.body, contentType: result.contentType };
}

// Harici bir okuyucuya (Jina, Firecrawl) gönderilmeden önce adresin herkese açık
// olduğu doğrulanır: biçim denetimi + alan adının DNS'te herkese açık bir adrese
// çözüldüğünün kontrolü. Özel ağ adresleri hiçbir sağlayıcıya iletilmez.
export async function assertPublicUrl(input, { checkUrl = parseSafeUrl, resolveHost = resolvePublicHost } = {}) {
  const url = checkUrl(input);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return url;
  try {
    await resolveHost(host);
  } catch (error) {
    if (error instanceof UnsafeUrlError) throw error;
    if (NOT_FOUND.has(error.code) || error.code === "EAI_AGAIN") throw new PageFetchError("Bu alan adı bulunamadı.");
    throw new PageFetchError("Alan adı çözümlenemedi.");
  }
  return url;
}

const RAW_MAX_BYTES = 5 * 1024 * 1024;
const RAW_TIMEOUT_MS = 15_000;

// Tarayıcı okuyucusunun (Playwright) ağ isteklerini karşılar: adres doğrulanır,
// bağlantı denetlenmiş herkese açık IP'ye sabitlenir, yönlendirme izlenmez
// (3xx olduğu gibi döner; tarayıcının yeni isteği de buradan geçer).
// Sıkıştırma istenmez ki gövde olduğu gibi aktarılabilsin.
export function guardedFetchRaw(input, { method = "GET", headers = {}, body = null, checkUrl = parseSafeUrl, lookup = guardedLookup } = {}) {
  const url = checkUrl(input);
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const outgoing = { ...headers, "accept-encoding": "identity" };
    for (const key of Object.keys(outgoing)) if (/^(host|connection|content-length)$/i.test(key)) delete outgoing[key];
    const request = client.request(url, { method, headers: outgoing, lookup, agent: false }, (response) => {
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > RAW_MAX_BYTES) {
          request.destroy();
          clearTimeout(timer);
          reject(new PageFetchError("Yanıt çok büyük."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        clearTimeout(timer);
        resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) });
      });
      response.on("error", () => {
        clearTimeout(timer);
        reject(new PageFetchError("Yanıt okunamadı."));
      });
    });
    const timer = setTimeout(() => {
      request.destroy();
      reject(new PageFetchError("Sayfa zamanında yanıt vermedi."));
    }, RAW_TIMEOUT_MS);
    request.on("error", (error) => {
      clearTimeout(timer);
      reject(error instanceof UnsafeUrlError ? error : new PageFetchError("Sayfaya bağlanılamadı."));
    });
    if (body) request.write(body);
    request.end();
  });
}
