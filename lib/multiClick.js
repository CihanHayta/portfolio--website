// Tek tıklama ile çoklu (çift/üçlü) tıklamayı ayıran sayaç (saf; DOM'dan bağımsız).
// İlk tıklama hemen işlem yapmaz: windowMs içinde ikinci tıklama gelmezse onSingle
// çalışır. İkinci tıklama gelirse tek tıklama iptal edilir ve onMulti hemen çalışır;
// ardından gelen tıklamalar (üçlü tıklamanın üçüncüsü) lockMs boyunca yutulur, böylece
// sonradan bir "tek tıklama" daha tetiklenmez.

export const MULTI_CLICK_MS = 650;
const LOCK_MS = 2000;

export function createMultiClick({ onSingle, onMulti, windowMs = MULTI_CLICK_MS, lockMs = LOCK_MS, clock = globalThis }) {
  let count = 0;
  let timer = null;
  let lockTimer = null;
  let locked = false;
  const clear = () => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  };
  return {
    click() {
      if (locked) return "ignored";
      count += 1;
      clear();
      if (count >= 2) {
        count = 0;
        locked = true;
        lockTimer = clock.setTimeout(() => {
          locked = false;
          lockTimer = null;
        }, lockMs);
        onMulti();
        return "multi";
      }
      timer = clock.setTimeout(() => {
        timer = null;
        count = 0;
        onSingle();
      }, windowMs);
      return "pending";
    },
    dispose() {
      clear();
      if (lockTimer !== null) clock.clearTimeout(lockTimer);
      lockTimer = null;
      count = 0;
      locked = false;
    },
  };
}
