// Yazar kutusundaki video slaytının durum mantığı (saf; React ve DOM'dan bağımsız).
//
// Kurallar:
// - Sessiz modda ("auto") her video DWELL_MS kadar oynar, sonra sıradakine geçilir;
//   sondan sonra başa dönülür.
// - Ses açılınca ("sound") otomatik geçiş durur; video kaldığı yerden sonuna kadar
//   oynar. Video bitince sıradaki video sessiz başlar ve otomatik geçiş yeniden başlar.
// - Ses kapatılınca otomatik geçiş o andan itibaren yeni bir süreyle yeniden başlar.
// - Kullanıcı önceki/sonraki/nokta ile geçerse ses ve oynat/duraklat tercihi korunur.
//
// userPaused: null = kullanıcı henüz seçim yapmadı (otomatik oynatma izni belirler),
// true/false = kullanıcının açık tercihi. dwell: otomatik geçiş sayacının yeniden
// başlatılması gereken her durumda (yeni slayt, sesi kapatma) artar.

export const DWELL_MS = 5500;

const wrap = (index, count) => ((index % count) + count) % count;

export function initialSlider(count) {
  return { index: 0, from: 0, count, mode: "auto", userPaused: null, dir: 1, reason: "init", seq: 0, dwell: 0 };
}

export function isPaused(state, autoplay) {
  return state.userPaused ?? !autoplay;
}

export function nextIndex(state) {
  return wrap(state.index + 1, state.count);
}

export function sliderReducer(state, action) {
  if (state.count < 1) return state;
  const move = (index, dir, reason, patch = {}) => {
    const target = wrap(index, state.count);
    return { ...state, ...patch, from: state.index, index: target, dir, reason, seq: state.seq + 1, dwell: state.dwell + 1 };
  };
  switch (action.type) {
    case "next":
      return move(state.index + 1, 1, "user");
    case "prev":
      return move(state.index - 1, -1, "user");
    case "goto": {
      const target = wrap(action.index, state.count);
      if (target === state.index) return state;
      return move(target, target > state.index ? 1 : -1, "user");
    }
    case "auto":
      // Zamanlayıcı yalnızca sessiz modda ve oynarken geçiş yapar.
      if (state.mode !== "auto" || state.userPaused === true) return state;
      return move(state.index + 1, 1, "auto");
    case "ended":
      // Video bitti (ya da oynatılamadı): sıradaki sessiz başlar, otomatik geçiş döner.
      // Otomatik oynatma kapalıysa (hareket azaltma) sıradaki video posterde bekler.
      return move(state.index + 1, 1, "ended", { mode: "auto", userPaused: action.autoplay === false ? true : null });
    case "unmute":
      return { ...state, mode: "sound", userPaused: false };
    case "mute":
      return { ...state, mode: "auto", dwell: state.dwell + 1 };
    case "pause":
      return { ...state, userPaused: true };
    case "play":
      return { ...state, userPaused: false };
    default:
      return state;
  }
}

// Duraklatılıp devam ettirilebilen tek seferlik sayaç. Kalan süreyi saklar;
// start() kaldığı yerden sayar, stop() kalan süreyi dondurur, reset() baştan kurar.
export function createCountdown(duration, onDone, clock = globalThis) {
  const now = () => (clock.now ? clock.now() : Date.now());
  let remaining = duration;
  let startedAt = 0;
  let timer = null;
  const api = {
    start() {
      if (timer !== null || remaining <= 0) return;
      startedAt = now();
      timer = clock.setTimeout(() => {
        timer = null;
        remaining = 0;
        onDone();
      }, remaining);
    },
    stop() {
      if (timer === null) return;
      clock.clearTimeout(timer);
      timer = null;
      remaining = Math.max(0, remaining - (now() - startedAt));
    },
    reset(next = duration) {
      api.stop();
      remaining = next;
    },
    get running() {
      return timer !== null;
    },
    get remaining() {
      return timer === null ? remaining : Math.max(0, remaining - (now() - startedAt));
    },
  };
  return api;
}
