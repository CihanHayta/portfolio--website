import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLogin, recordFailure, recordSuccess, resetLoginThrottle } from "./loginThrottle.js";

test("aynı IP + e-posta için 5 hatalı denemeden sonra giriş durdurulur; 15 dk sonra açılır", () => {
  resetLoginThrottle();
  let now = 1_000_000;
  for (let i = 0; i < 5; i += 1) {
    assert.equal(checkLogin("1.2.3.4", "a@b.com", now).allowed, true);
    recordFailure("1.2.3.4", "A@B.com ", now);
    now += 1000;
  }
  const blocked = checkLogin("1.2.3.4", "a@b.com", now);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0 && blocked.retryAfterSeconds <= 15 * 60);
  assert.equal(checkLogin("5.6.7.8", "a@b.com", now).allowed, true, "başka IP etkilenmez");
  assert.equal(checkLogin("1.2.3.4", "a@b.com", now + 15 * 60_000).allowed, true);
});

test("aynı IP'den farklı e-postalarla 20 hata sonrası IP durdurulur; başarılı giriş hesabı sıfırlar", () => {
  resetLoginThrottle();
  for (let i = 0; i < 20; i += 1) recordFailure("9.9.9.9", `u${i}@x.com`, 5_000);
  assert.equal(checkLogin("9.9.9.9", "yeni@x.com", 6_000).allowed, false);
  resetLoginThrottle();
  for (let i = 0; i < 4; i += 1) recordFailure("1.1.1.1", "a@b.com", 1);
  recordSuccess("1.1.1.1", "a@b.com");
  recordFailure("1.1.1.1", "a@b.com", 2);
  assert.equal(checkLogin("1.1.1.1", "a@b.com", 3).allowed, true);
});
