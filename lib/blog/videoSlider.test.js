import assert from "node:assert/strict";
import { test } from "node:test";
import { DWELL_MS, createCountdown, initialSlider, isPaused, nextIndex, sliderReducer } from "./videoSlider.js";

const run = (state, ...actions) => actions.reduce((current, action) => sliderReducer(current, action), state);

test("otomatik geçiş sırayla ilerler ve sondan başa döner", () => {
  let state = initialSlider(4);
  const seen = [state.index];
  for (let i = 0; i < 4; i++) {
    state = sliderReducer(state, { type: "auto" });
    seen.push(state.index);
  }
  assert.deepEqual(seen, [0, 1, 2, 3, 0]);
  assert.equal(state.reason, "auto");
  assert.equal(state.dir, 1);
  assert.equal(state.from, 3);
});

test("ses açılınca otomatik geçiş durur, süre/slayt değişmez", () => {
  const state = run(initialSlider(4), { type: "auto" }, { type: "unmute" });
  assert.equal(state.mode, "sound");
  assert.equal(state.index, 1);
  const after = sliderReducer(state, { type: "auto" });
  assert.equal(after, state, "ses açıkken zamanlayıcı geçiş yapmaz");
  assert.equal(state.seq, 1, "ses açmak videoyu yeniden başlatmaz (seq aynı)");
});

test("ses açıkken video bitince sıradaki sessiz başlar ve otomatik geçiş geri gelir", () => {
  const state = run(initialSlider(4), { type: "unmute" }, { type: "ended", autoplay: true });
  assert.equal(state.index, 1);
  assert.equal(state.mode, "auto");
  assert.equal(state.userPaused, null);
  assert.equal(state.reason, "ended");
  assert.equal(sliderReducer(state, { type: "auto" }).index, 2);
});

test("son video bitince ilk videoya dönülür", () => {
  const state = run(initialSlider(4), { type: "goto", index: 3 }, { type: "unmute" }, { type: "ended", autoplay: true });
  assert.equal(state.index, 0);
});

test("sesi kapatmak otomatik geçiş sayacını yeniden başlatır (dwell artar)", () => {
  const sound = run(initialSlider(4), { type: "unmute" });
  const muted = sliderReducer(sound, { type: "mute" });
  assert.equal(muted.mode, "auto");
  assert.equal(muted.dwell, sound.dwell + 1);
  assert.equal(muted.index, sound.index);
});

test("kullanıcı gezinmesi ses ve oynat/duraklat tercihini korur, yönü belirler", () => {
  const sound = run(initialSlider(4), { type: "unmute" }, { type: "next" });
  assert.equal(sound.mode, "sound");
  assert.equal(sound.index, 1);
  assert.equal(sound.reason, "user");
  const back = sliderReducer(sound, { type: "prev" });
  assert.equal(back.index, 0);
  assert.equal(back.dir, -1);
  const wrapBack = sliderReducer(back, { type: "prev" });
  assert.equal(wrapBack.index, 3);
  const paused = run(initialSlider(4), { type: "pause" }, { type: "next" });
  assert.equal(paused.userPaused, true);
  const dot = run(initialSlider(4), { type: "goto", index: 2 });
  assert.equal(dot.index, 2);
  assert.equal(dot.dir, 1);
  assert.equal(sliderReducer(dot, { type: "goto", index: 2 }), dot, "aynı noktaya basmak bir şey değiştirmez");
});

test("kullanıcı duraklatınca zamanlayıcı geçiş yapmaz", () => {
  const state = run(initialSlider(4), { type: "pause" });
  assert.equal(sliderReducer(state, { type: "auto" }), state);
  assert.equal(isPaused(state, true), true);
  assert.equal(isPaused(sliderReducer(state, { type: "play" }), true), false);
});

test("otomatik oynatma kapalıyken (hareket azaltma) varsayılan duraklatılmış; bitince sıradaki posterde bekler", () => {
  const state = initialSlider(4);
  assert.equal(isPaused(state, false), true);
  assert.equal(isPaused(state, true), false);
  const ended = run(state, { type: "play" }, { type: "ended", autoplay: false });
  assert.equal(ended.index, 1);
  assert.equal(isPaused(ended, false), true);
});

test("her slayt değişiminde seq ve dwell artar; nextIndex sarar", () => {
  const state = run(initialSlider(3), { type: "next" }, { type: "auto" });
  assert.equal(state.seq, 2);
  assert.equal(state.dwell, 2);
  assert.equal(nextIndex(state), 0);
});

function fakeClock() {
  let time = 0;
  const timers = new Map();
  let id = 0;
  return {
    now: () => time,
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

test("sayaç duraklatılınca kalan süreyi korur, devamında yalnızca kalanı bekler", () => {
  const clock = fakeClock();
  let done = 0;
  const countdown = createCountdown(DWELL_MS, () => done++, clock);
  countdown.start();
  clock.advance(2000);
  countdown.stop();
  assert.equal(countdown.remaining, DWELL_MS - 2000);
  clock.advance(10_000);
  assert.equal(done, 0, "durdurulmuşken bitmez");
  countdown.start();
  clock.advance(DWELL_MS - 2000 - 1);
  assert.equal(done, 0);
  clock.advance(1);
  assert.equal(done, 1);
  countdown.start();
  clock.advance(DWELL_MS * 2);
  assert.equal(done, 1, "bittikten sonra reset olmadan yeniden başlamaz");
  countdown.reset();
  countdown.start();
  clock.advance(DWELL_MS);
  assert.equal(done, 2);
});

test("sayaç: çift start tek zamanlayıcı kurar, reset çalışanı durdurur", () => {
  const clock = fakeClock();
  let done = 0;
  const countdown = createCountdown(1000, () => done++, clock);
  countdown.start();
  countdown.start();
  assert.equal(countdown.running, true);
  countdown.reset();
  assert.equal(countdown.running, false);
  clock.advance(5000);
  assert.equal(done, 0);
});
