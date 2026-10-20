import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { UnsafeUrlError, isPublicAddress, parseSafeUrl } from "@/lib/ai/netguard";
import zlib from "node:zlib";
import { PageFetchError, createGuardedLookup, fetchPage } from "@/lib/ai/safeFetch";

test("özel ve yerel IP adresleri herkese açık sayılmaz", () => {
  const blocked = [
    "127.0.0.1", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254",
    "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255",
    "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "::ffff:127.0.0.1",
    "::ffff:10.0.0.1", "::ffff:7f00:1", "64:ff9b::a00:1", "2001:db8::1", "2002:7f00:1::1",
    "not-an-ip", "",
  ];
  for (const ip of blocked) assert.equal(isPublicAddress(ip), false, ip);

  for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
    assert.equal(isPublicAddress(ip), true, ip);
  }
});

test("güvensiz adresler bağlantı kurulmadan reddedilir", () => {
  const rejected = [
    "", "javascript:alert(1)", "file:///etc/passwd", "ftp://example.com/a", "http://localhost/admin",
    "http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest/meta-data/", "http://10.0.0.1/",
    "http://2130706433/", "http://0x7f.0.0.1/", "http://intranet/", "http://db.internal/", "http://printer.local/",
    "https://user:pass@example.com/", "https://example.com:8443/", "http://example.com:22/",
  ];
  for (const url of rejected) assert.throws(() => parseSafeUrl(url), UnsafeUrlError, url);
});

test("geçerli adresler normalleştirilir", () => {
  assert.equal(parseSafeUrl("example.com/yazi").href, "https://example.com/yazi");
  assert.equal(parseSafeUrl(" https://example.com/a?b=1#bolum ").href, "https://example.com/a?b=1");
  assert.equal(parseSafeUrl("http://example.com:80/").port, "");
});

const unavailable = () => Promise.resolve({ status: "unavailable", addresses: [] });

test("alan adı özel IP'ye çözülürse bağlantı kurulmaz (DNS üzerinden SSRF)", () => {
  const resolveTo = (addresses) => (hostname, options, callback) =>
    callback(null, addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })));
  const run = (addresses, options = {}) =>
    new Promise((resolve) =>
      createGuardedLookup(resolveTo(addresses), unavailable)("host.test", options, (...args) => resolve(args))
    );

  return Promise.all([
    run(["127.0.0.1"]).then(([error]) => assert.ok(error instanceof UnsafeUrlError)),
    // Adreslerden biri bile özel ağdaysa tamamı reddedilir.
    run(["93.184.216.34", "10.0.0.7"]).then(([error]) => assert.ok(error instanceof UnsafeUrlError)),
    run(["::ffff:192.168.1.10"]).then(([error]) => assert.ok(error instanceof UnsafeUrlError)),
    run([]).then(([error]) => assert.ok(error instanceof UnsafeUrlError)),
    run(["93.184.216.34"]).then(([error, address, family]) => {
      assert.equal(error, null);
      assert.equal(address, "93.184.216.34");
      assert.equal(family, 4);
    }),
    run(["93.184.216.34"], { all: true }).then(([error, addresses]) => {
      assert.equal(error, null);
      assert.equal(addresses.length, 1);
    }),
  ]);
});

// Yerel test sunucusu: yalnızca kendi adresine izin verilir, yönlendirme
// hedefleri gerçek denetimden geçer.
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

const html = (response, body, headers = {}) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", ...headers });
  response.end(body);
};

test("sayfa indirilir; sıkıştırma ve karakter kümesi çözülür", async () => {
  await withServer(
    (request, response) => {
      if (request.url === "/gzip") {
        return html(response, zlib.gzipSync("<p>şıkıştırılmış</p>"), { "content-encoding": "gzip" });
      }
      if (request.url === "/latin5") {
        response.writeHead(200, { "content-type": "text/html; charset=iso-8859-9" });
        return response.end(Buffer.from([0x3c, 0x70, 0x3e, 0xfd, 0xfe, 0xf0, 0x3c, 0x2f, 0x70, 0x3e])); // <p>ışğ</p>
      }
      return html(response, "<p>merhaba</p>");
    },
    async (origin, options) => {
      assert.deepEqual(await fetchPage(`${origin}/`, options), { finalUrl: `${origin}/`, html: "<p>merhaba</p>" });
      assert.equal((await fetchPage(`${origin}/gzip`, options)).html, "<p>şıkıştırılmış</p>");
      assert.equal((await fetchPage(`${origin}/latin5`, options)).html, "<p>ışğ</p>");
    }
  );
});

test("yönlendirmeler izlenir ama özel ağa giden yönlendirme reddedilir", async () => {
  await withServer(
    (request, response) => {
      const target = {
        "/a": "/b",
        "/b": "/son",
        "/metadata": "http://169.254.169.254/latest/meta-data/",
        "/yerel": "http://localhost/admin",
        "/dosya": "file:///etc/passwd",
        "/dongu": "/dongu",
      }[request.url];
      if (target) {
        response.writeHead(302, { location: target });
        return response.end();
      }
      return html(response, "<p>son</p>");
    },
    async (origin, options) => {
      assert.equal((await fetchPage(`${origin}/a`, options)).finalUrl, `${origin}/son`);
      await assert.rejects(() => fetchPage(`${origin}/metadata`, options), UnsafeUrlError);
      await assert.rejects(() => fetchPage(`${origin}/yerel`, options), UnsafeUrlError);
      await assert.rejects(() => fetchPage(`${origin}/dosya`, options), UnsafeUrlError);
      await assert.rejects(() => fetchPage(`${origin}/dongu`, options), /çok fazla yönlendirme/);
    }
  );
});

test("HTML olmayan, hatalı, çok büyük ve yanıt vermeyen sayfalar reddedilir", async () => {
  await withServer(
    (request, response) => {
      if (request.url === "/pdf") {
        response.writeHead(200, { "content-type": "application/pdf" });
        return response.end("%PDF");
      }
      if (request.url === "/404") {
        response.writeHead(404, { "content-type": "text/html" });
        return response.end("yok");
      }
      if (request.url === "/buyuk") return html(response, Buffer.alloc(3 * 1024 * 1024 + 10, "a"));
      if (request.url === "/bomba") {
        // Küçük gelen ama açılınca sınırı aşan sıkıştırılmış gövde.
        return html(response, zlib.gzipSync(Buffer.alloc(8 * 1024 * 1024, "a")), { "content-encoding": "gzip" });
      }
      // "/yavas": hiç yanıt vermez.
    },
    async (origin, options) => {
      await assert.rejects(() => fetchPage(`${origin}/pdf`, options), /web sayfası değil/);
      await assert.rejects(() => fetchPage(`${origin}/404`, options), /404/);
      await assert.rejects(() => fetchPage(`${origin}/buyuk`, options), /çok büyük/);
      await assert.rejects(() => fetchPage(`${origin}/bomba`, options), /çok büyük/);
      await assert.rejects(() => fetchPage(`${origin}/yavas`, { ...options, timeoutMs: 300 }), /zamanında yanıt vermedi/);
      await assert.rejects(() => fetchPage(`${origin}/yavas`, { ...options, timeoutMs: 300 }), PageFetchError);
    }
  );
});

// Ev modemleri çözemedikleri alan adlarına kendi adreslerini verebilir.
test("sistem DNS'i özel adres verirse herkese açık DNS'e danışılır; özel adrese asla bağlanılmaz", async () => {
  const system = (addresses) => (hostname, options, callback) =>
    callback(null, addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })));
  const opinion = (answer) => () => Promise.resolve(answer);
  const run = (sys, answer, options = {}) =>
    new Promise((resolve) => createGuardedLookup(system(sys), opinion(answer))("ornek.test", options, (...args) => resolve(args)));

  // Modem olmayan alan adını 192.168.1.1'e çevirdi; gerçekte alan adı yok.
  const [missing] = await run(["192.168.1.1"], { status: "notfound", addresses: [] });
  assert.equal(missing.code, "ENOTFOUND");
  assert.ok(!(missing instanceof UnsafeUrlError));

  // Modem geçici olarak çözemedi; herkese açık DNS gerçek adresi verdi → o adrese sabitlenir.
  const [okError, address, family] = await run(["192.168.1.1"], { status: "found", addresses: [{ address: "93.184.216.34", family: 4 }] });
  assert.equal(okError, null);
  assert.equal(address, "93.184.216.34");
  assert.equal(family, 4);

  // Alan adı herkese açık DNS'te de özel adrese gidiyor (ör. localtest.me → 127.0.0.1).
  const [privateError] = await run(["127.0.0.1"], { status: "found", addresses: [{ address: "127.0.0.1", family: 4 }] });
  assert.ok(privateError instanceof UnsafeUrlError);

  // Herkese açık DNS karışık sonuç verirse de reddedilir.
  const [mixed] = await run(["10.0.0.1"], { status: "found", addresses: [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }] });
  assert.ok(mixed instanceof UnsafeUrlError);

  // Doğrulama yapılamazsa güvenli tarafta kalınır.
  const [unverified] = await run(["192.168.1.1"], { status: "unavailable", addresses: [] });
  assert.ok(unverified instanceof UnsafeUrlError);
  assert.match(unverified.message, /DNS/);

  // İkinci görüş hiç hata fırlatsa bile bağlantı kurulmaz.
  const [thrown] = await new Promise((resolve) =>
    createGuardedLookup(system(["192.168.1.1"]), () => Promise.reject(new Error("ağ yok")))("ornek.test", {}, (...args) => resolve(args))
  );
  assert.ok(thrown instanceof UnsafeUrlError);

  // Herkese açık sistem sonucu için ikinci görüşe hiç gidilmez.
  let asked = false;
  await new Promise((resolve) =>
    createGuardedLookup(system(["93.184.216.34"]), () => { asked = true; return Promise.resolve({ status: "unavailable", addresses: [] }); })("ornek.test", {}, resolve)
  );
  assert.equal(asked, false);
});
