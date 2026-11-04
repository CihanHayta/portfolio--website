import assert from "node:assert/strict";
import { test } from "node:test";
import { MULTI_CLICK_MS, createMultiClick } from "./multiClick.js";

function fakeClock() {
  let time = 0;
  let id = 0;
  const timers = new Map();
  return {
    setTimeout(fn, ms) {
      timers.set(++id, { fn, at: time + ms });
      return id;
    },
    clearTimeout(handle) {
      timers.delete(handle);
    },
    advance(ms) {
      time += ms;
      for (const [handle, timer] of [...timers]) {
        if (timer.at <= time) {
          timers.delete(handle);
          timer.fn();
        }
      }
    },
  };
}

const setup = () => {
  const clock = fakeClock();
  const calls = [];
  const clicks = createMultiClick({ onSingle: () => calls.push("single"), onMulti: () => calls.push("multi"), clock });
  return { clock, calls, clicks };
};

test("tek tıklama hemen değil, bekleme süresi dolunca çalışır", () => {
  const { clock, calls, clicks } = setup();
  assert.equal(clicks.click(), "pending");
  clock.advance(MULTI_CLICK_MS - 1);
  assert.deepEqual(calls, []);
  clock.advance(1);
  assert.deepEqual(calls, ["single"]);
});

test("çift tıklama tek tıklamayı iptal eder ve hemen çoklu işlemi çalıştırır", () => {
  const { clock, calls, clicks } = setup();
  clicks.click();
  clock.advance(300);
  assert.equal(clicks.click(), "multi");
  assert.deepEqual(calls, ["multi"]);
  clock.advance(5000);
  assert.deepEqual(calls, ["multi"], "sonradan tek tıklama tetiklenmez");
});

test("üçlü tıklama da çoklu işlem; üçüncü tıklama yutulur", () => {
  const { clock, calls, clicks } = setup();
  clicks.click();
  clock.advance(150);
  clicks.click();
  clock.advance(150);
  assert.equal(clicks.click(), "ignored");
  clock.advance(5000);
  assert.deepEqual(calls, ["multi"]);
});

test("aralık uzunsa iki ayrı tek tıklama sayılır; kilit süre sonunda kalkar", () => {
  const { clock, calls, clicks } = setup();
  clicks.click();
  clock.advance(MULTI_CLICK_MS + 50);
  clicks.click();
  clock.advance(MULTI_CLICK_MS);
  assert.deepEqual(calls, ["single", "single"]);
  clicks.click();
  clicks.click();
  clock.advance(2500);
  clicks.click();
  clock.advance(MULTI_CLICK_MS);
  assert.deepEqual(calls, ["single", "single", "multi", "single"]);
});

test("dispose bekleyen tek tıklamayı iptal eder", () => {
  const { clock, calls, clicks } = setup();
  clicks.click();
  clicks.dispose();
  clock.advance(5000);
  assert.deepEqual(calls, []);
});
