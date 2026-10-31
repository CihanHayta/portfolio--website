import assert from "node:assert/strict";
import { test } from "node:test";
import { articleProgress } from "./progress.js";

const base = { height: 3000, viewport: 800, offset: 71 };

test("gövde başı sabit başlığın altındayken 0, sonu ekranın altına gelince 1", () => {
  assert.equal(articleProgress({ ...base, top: 400 }), 0);
  assert.equal(articleProgress({ ...base, top: 71 }), 0);
  // total = 3000 - (800 - 71) = 2271 → yarısı
  assert.ok(Math.abs(articleProgress({ ...base, top: 71 - 2271 / 2 }) - 0.5) < 1e-9);
  assert.equal(articleProgress({ ...base, top: 71 - 2271 }), 1);
  assert.equal(articleProgress({ ...base, top: -9999 }), 1, "footer'a inilse de 1'de kalır");
});

test("geri kaydırınca azalır; kısa gövde ve geçersiz ölçü güvenli", () => {
  const down = articleProgress({ ...base, top: -1000 });
  const up = articleProgress({ ...base, top: -500 });
  assert.ok(up < down);
  assert.equal(articleProgress({ height: 300, viewport: 800, offset: 71, top: 200 }), 0);
  assert.equal(articleProgress({ height: 300, viewport: 800, offset: 71, top: 50 }), 1);
  assert.equal(articleProgress({ height: 0, viewport: 800, top: 0 }), 0);
});
