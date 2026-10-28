import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_SESSION_BYTES, sanitizeSession } from "./studioSession.js";

const POST = "11111111-2222-4333-8444-555555555555";

test("bilinen alanlar korunur; bilinmeyenler atılır", () => {
  const out = sanitizeSession({
    url: "https://kaynak.example.com/yazi",
    notes: "Kullanıcının yapıştırdığı metin",
    approaches: ["problemSolution", "faq", "steps", "fazla"],
    gizli: "atılmalı",
    images: [{ id: "img-1", kind: "source", src: "https://kaynak.example.com/a.jpg", target: "block:h2-abc", state: "selected", alt: "Bütçe tablosu" }],
  });
  assert.equal(out.url, "https://kaynak.example.com/yazi");
  assert.equal(out.notes, "Kullanıcının yapıştırdığı metin");
  assert.deepEqual(out.approaches, ["problemSolution", "faq", "steps"]);
  assert.equal(out.gizli, undefined);
  // Eski kayıttaki state "selected" seçim olarak korunur.
  assert.deepEqual(out.images[0], { id: "img-1", kind: "source", state: "selected", selected: true, alt: "Bütçe tablosu", target: "block:h2-abc", src: "https://kaynak.example.com/a.jpg" });
});

test("geçici tarayıcı adresi ve gömülü görsel verisi asla saklanmaz", () => {
  const out = sanitizeSession({
    images: [
      { id: "a", kind: "upload", url: "blob:http://localhost/123", state: "selected" },
      { id: "b", kind: "ai", url: "https://x.supabase.co/storage/v1/object/public/blog-media/b.webp", state: "selected", mediaId: POST },
    ],
    draft: { cover: "data:image/webp;base64,AAAA" },
  });
  assert.equal(out.images[0].url, undefined, "blob: adresi atıldı");
  assert.equal(out.images[1].mediaId, POST);
  assert.ok(!JSON.stringify(out).includes("data:image"), "gömülü veri kalmadı");
});

test("ekran görüntüsü yalnızca özel kovadaki geçerli yol biçimiyle saklanır", () => {
  const out = sanitizeSession({
    shots: [
      { path: `${POST}/${POST}.webp`, name: "ekran.png" },
      { path: "../baska-kova/x.webp", name: "kötü" },
      { path: "blob:http://x/1", name: "geçici" },
    ],
  });
  assert.equal(out.shots.length, 1);
  assert.equal(out.shots[0].path, `${POST}/${POST}.webp`);
});

test("geçersiz hedef ve durum güvenli varsayılana döner", () => {
  const out = sanitizeSession({ images: [{ id: "x", kind: "source", src: "https://a.b/c.png", target: "javascript:alert(1)", state: "bilinmeyen" }] });
  assert.equal(out.images[0].target, null);
  assert.equal(out.images[0].state, "idle");
  assert.equal(out.images[0].selected, false);
});

test("seçim ve durum ayrı: yazıya eklenmiş görsel seçili de olabilir; şablon ve plan saklanır", () => {
  const out = sanitizeSession({
    templateChoice: "problemSolution",
    plan: { key: "problemSolution", label: "Problem ve çözüm", reason: "Kaynak biçimi", by: "auto", ekstra: 1 },
    similar: { decision: "angle", selectedIds: [POST], skipArchive: true },
    images: [{ id: "p", kind: "source", src: "https://a.b/c.png", state: "placed", selected: true, target: "cover" }],
  });
  assert.equal(out.images[0].state, "placed");
  assert.equal(out.images[0].selected, true);
  assert.equal(out.templateChoice, "problemSolution");
  assert.deepEqual(out.plan, { key: "problemSolution", current: false, label: "Problem ve çözüm", reason: "Kaynak biçimi", by: "auto" });
  assert.equal(out.similar.skipArchive, true);
});

test("çok büyük oturumda taslak sonucu atılır, kaynaklar ve seçimler korunur", () => {
  const out = sanitizeSession({ notes: "not", draft: { blocks: "x".repeat(MAX_SESSION_BYTES) }, images: [{ id: "k", kind: "source", src: "https://a.b/c.png" }] });
  assert.equal(out.draft, null);
  assert.equal(out.notes, "not");
  assert.equal(out.images.length, 1);
});
