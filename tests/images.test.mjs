import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { GRAPHIC_MOTIFS, GRAPHIC_PALETTES, GRAPHIC_SIZES, hashSeed, renderGraphicSvg } from "@/lib/ai/graphics";
import { ImageError, createImage } from "@/lib/ai/images";
import { encodeImage } from "@/lib/blog/media";

const image = { role: "cover", concept: "Konsept", alt: "Alt", motif: "chart", palette: "forest", prompt: "a flat illustration" };

test("marka grafikleri yazı içermez ve tohuma göre belirlenir", () => {
  for (const motif of GRAPHIC_MOTIFS) {
    for (const palette of GRAPHIC_PALETTES) {
      const svg = renderGraphicSvg({ motif, palette, role: "inline", seed: 7 });
      assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"), motif);
      assert.ok(!/<text|<image|<script|href=|NaN|undefined/.test(svg), `${motif}/${palette}`);
    }
  }
  const a = renderGraphicSvg({ motif: "network", palette: "ink", seed: hashSeed("a") });
  assert.equal(a, renderGraphicSvg({ motif: "network", palette: "ink", seed: hashSeed("a") }));
  assert.notEqual(a, renderGraphicSvg({ motif: "network", palette: "ink", seed: hashSeed("b") }));
  assert.ok(renderGraphicSvg({ motif: "bilinmeyen", palette: "bilinmeyen" }).startsWith("<svg"));
});

test("marka grafiği WebP olarak üretilir (kapak ve yazı içi boyutları)", async () => {
  for (const role of ["cover", "inline"]) {
    const { output, kind } = await createImage({ ...image, role }, { provider: "brand", seed: 3 });
    assert.equal(kind, "brand");
    const metadata = await sharp(output.data).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, GRAPHIC_SIZES[role].width);
    assert.equal(metadata.height, GRAPHIC_SIZES[role].height);
    assert.ok(output.info.size > 2000 && output.info.size < 400_000);
  }
});

test("AI görseli: başarılı yanıt WebP'ye çevrilir ve 'ai' olarak işaretlenir", async () => {
  const jpeg = await sharp({ create: { width: 64, height: 36, channels: 3, background: "#336" } }).jpeg().toBuffer();
  let requested;
  const fetchImpl = async (url) => {
    requested = new URL(url);
    return new Response(jpeg, { status: 200, headers: { "content-type": "image/jpeg" } });
  };
  const { output, kind } = await createImage(image, { provider: "pollinations", seed: 5, fetchImpl });
  assert.equal(kind, "ai");
  assert.equal((await sharp(output.data).metadata()).format, "webp");
  assert.equal(requested.hostname, "image.pollinations.ai");
  assert.ok(decodeURIComponent(requested.pathname).endsWith(image.prompt));
  assert.ok(!requested.href.includes("key"), "anahtar ya da kimlik gönderilmez");
});

test("AI görseli: servis hataları ve geçersiz yanıtlar açık hata verir, sessizce yedeklenmez", async () => {
  const run = (fetchImpl, extra = {}) => createImage({ ...image, ...extra }, { provider: "pollinations", fetchImpl });
  await assert.rejects(() => run(async () => new Response("", { status: 429 })), /istek sınırı/);
  await assert.rejects(() => run(async () => new Response("", { status: 500 })), ImageError);
  await assert.rejects(() => run(async () => new Response("<html>hata</html>", { status: 200 })), /geçersiz bir görsel/);
  await assert.rejects(() => run(async () => { throw new DOMException("t", "TimeoutError"); }), /zamanında yanıt vermedi/);
  await assert.rejects(() => run(async () => new Response("x"), { prompt: "" }), /betimlemesi yok/);
});

test("yükleme kodlayıcısı SVG ve bozuk dosyaları kullanıcı yüklemesi olarak kabul etmez", async () => {
  const svg = Buffer.from(renderGraphicSvg({ motif: "chart", palette: "forest" }));
  assert.equal((await encodeImage(svg)).error, "format");
  assert.ok((await encodeImage(svg, { formats: ["svg"] })).output);
  assert.equal((await encodeImage(Buffer.from("görsel değil"))).error, "invalid");
  const png = await sharp({ create: { width: 4000, height: 10, channels: 3, background: "#fff" } }).png().toBuffer();
  assert.equal((await encodeImage(png)).output.info.width, 2400);
});
