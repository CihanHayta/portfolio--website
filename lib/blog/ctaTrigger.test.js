import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_SHOWS, canShow, reachedThreshold, readSession, readingProgress } from "./ctaTrigger.js";

test("okuma ilerlemesi: gövdenin ekran altından geçen oranı", () => {
  assert.equal(readingProgress(900, 2000, 900), 0, "sayfa açılışında gövde ekranın altında");
  assert.equal(readingProgress(-100, 2000, 900), 0.5);
  assert.equal(readingProgress(-5000, 2000, 900), 1);
  assert.equal(readingProgress(0, 0, 900), 0);
});

test("yazı sayfasında yalnızca %45 okununca, liste sayfasında yeterli kaydırmayla tetiklenir", () => {
  assert.equal(reachedThreshold("article", { progress: 0.2 }), false);
  assert.equal(reachedThreshold("article", { progress: 0.45 }), true);
  assert.equal(reachedThreshold("list", { scrollY: 0, scrollHeight: 900, viewportHeight: 900 }), false, "kısa sayfada açılışta görünmez");
  assert.equal(reachedThreshold("list", { scrollY: 100, scrollHeight: 3000, viewportHeight: 900 }), false);
  assert.equal(reachedThreshold("list", { scrollY: 1000, scrollHeight: 3000, viewportHeight: 900 }), true);
  assert.equal(reachedThreshold("list", { scrollY: 0, scrollHeight: 1175, viewportHeight: 900 }), false, "kısa liste: açılışta yok");
  assert.equal(reachedThreshold("list", { scrollY: 275, scrollHeight: 1175, viewportHeight: 900 }), true, "kısa liste: sona inince var");
});

test("oturum: kapatıldıysa ya da sınır dolduysa yeniden gösterilmez; bozuk değer güvenle okunur", () => {
  assert.deepEqual(readSession(null), { dismissed: false, shows: 0 });
  assert.deepEqual(readSession("{bozuk"), { dismissed: false, shows: 0 });
  assert.equal(canShow(readSession(JSON.stringify({ dismissed: true, shows: 0 }))), false);
  assert.equal(canShow({ dismissed: false, shows: MAX_SHOWS }), false);
  assert.equal(canShow({ dismissed: false, shows: 1 }), true);
});
