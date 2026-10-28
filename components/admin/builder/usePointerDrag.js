"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Fare, dokunmatik ve kalem için tek sürükle-bırak (Pointer Events).
// - Yalnızca tutamaçtan başlar (tutamaçta `touch-action: none`); blok gövdesinde
//   metin seçme ve sayfa kaydırma bozulmaz.
// - 6 px hareket eşiği: dokunup bırakmak tıklama sayılır, sürükleme başlamaz.
// - Bırakma noktaları her harekette ölçülür: bloklar arası ve metin bloklarında
//   paragraflar arası. Tek bir sabit konumlu çizgi gösterilir (yerleşim kaymaz).
// - Kenara yaklaşınca kaydırılabilir alan kendiliğinden kayar.
// - Esc, pointercancel ya da tuvalin dışına bırakma iptal eder; bir sürükleme en
//   fazla bir bırakma üretir.

const THRESHOLD = 6;
const EDGE = 64;
const OUTSIDE = 80;

function scrollParent(element) {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
  }
  return document.scrollingElement;
}

// Kapsayıcıdaki aday bırakma noktaları: { y, left, width, target }
function candidates(container, source) {
  const frames = [...container.querySelectorAll("[data-block-id]")].filter((el) => el.parentElement?.closest("[data-block-id]") == null);
  if (!frames.length) {
    const rect = container.getBoundingClientRect();
    return [{ y: rect.top + 24, left: rect.left, width: rect.width, target: { index: 0 } }];
  }
  const rects = frames.map((el) => el.getBoundingClientRect());
  const from = source.kind === "move" ? frames.findIndex((el) => el.dataset.blockId === source.id) : -1;
  const left = Math.min(...rects.map((rect) => rect.left));
  const width = Math.max(...rects.map((rect) => rect.right)) - left;
  const list = [];
  for (let index = 0; index <= frames.length; index += 1) {
    if (from !== -1 && (index === from || index === from + 1)) continue; // etkisiz konum
    const y = index === 0 ? rects[0].top - 6 : index === frames.length ? rects.at(-1).bottom + 6 : (rects[index - 1].bottom + rects[index].top) / 2;
    list.push({ y, left, width, target: { index } });
  }
  // Paragraflar arası: metin bloğunun kök düğümleri doc.content ile birebir eşleşiyorsa.
  frames.forEach((frame, index) => {
    if (frame.dataset.blockType !== "text" || index === from) return;
    const count = Number(frame.dataset.nodeCount ?? 0);
    const root = frame.querySelector(".ProseMirror") ?? frame.querySelector("[data-doc-root]");
    if (!root || count < 2 || root.children.length !== count) return;
    const nodes = [...root.children].map((child) => child.getBoundingClientRect());
    for (let node = 1; node < count; node += 1) {
      list.push({ y: (nodes[node - 1].bottom + nodes[node].top) / 2, left: rects[index].left + 12, width: rects[index].width - 24, target: { blockId: frame.dataset.blockId, nodeIndex: node }, split: true });
    }
  });
  return list;
}

export function usePointerDrag({ getContainer, onDrop }) {
  const [active, setActive] = useState(null); // { payload, label } sürüklenirken
  const ghostRef = useRef(null);
  const lineRef = useRef(null);
  const session = useRef(null);
  const onDropRef = useRef(onDrop);
  useEffect(() => {
    onDropRef.current = onDrop;
  }, [onDrop]);

  const finish = useCallback((commit) => {
    const current = session.current;
    if (!current) return;
    session.current = null;
    cancelAnimationFrame(current.raf);
    const { element, pointerId } = current;
    element.removeEventListener("pointermove", current.move);
    element.removeEventListener("pointerup", current.up);
    element.removeEventListener("pointercancel", current.cancel);
    element.removeEventListener("lostpointercapture", current.lost);
    window.removeEventListener("keydown", current.key, true);
    try {
      if (element.hasPointerCapture?.(pointerId)) element.releasePointerCapture(pointerId);
    } catch {
      // yakalama zaten bırakılmış
    }
    if (lineRef.current) lineRef.current.hidden = true;
    if (current.started) {
      // Sürüklemenin ardından gelen tıklama (ör. kütüphanede "ekle") yok sayılır.
      const swallow = (event) => {
        event.stopPropagation();
        event.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      setActive(null);
      document.documentElement.removeAttribute("data-block-dragging");
      if (commit && current.target) onDropRef.current?.(current.payload, current.target.target);
    }
  }, []);

  const locate = useCallback((current) => {
    const container = current.container;
    const rect = container.getBoundingClientRect();
    const { x, y } = current.point;
    const outside = x < rect.left - OUTSIDE || x > rect.right + OUTSIDE;
    let best = null;
    if (!outside) {
      for (const item of candidates(container, current.payload)) {
        if (!best || Math.abs(item.y - y) < Math.abs(best.y - y)) best = item;
      }
    }
    current.target = best;
    const line = lineRef.current;
    if (line) {
      line.hidden = !best;
      if (best) {
        line.style.transform = `translate(${Math.round(best.left)}px, ${Math.round(best.y - 2)}px)`;
        line.style.width = `${Math.round(best.width)}px`;
        line.dataset.split = best.split ? "true" : "false";
      }
    }
    const ghost = ghostRef.current;
    if (ghost) ghost.style.transform = `translate(${Math.round(x + 14)}px, ${Math.round(y + 14)}px)`;
  }, []);

  // Tutamaçtaki pointerdown'dan çağrılır.
  const begin = useCallback(
    (event, payload, label) => {
      if (session.current || (event.pointerType === "mouse" && event.button !== 0)) return;
      const container = getContainer();
      if (!container) return;
      const element = event.currentTarget;
      event.preventDefault();
      event.stopPropagation();
      const current = {
        element,
        pointerId: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
        point: { x: event.clientX, y: event.clientY },
        payload,
        label,
        container,
        scroller: scrollParent(container),
        started: false,
        target: null,
        raf: 0,
      };
      // Kenara yaklaşınca kaydırılabilir alan kayar; ölçüm her karede yenilenir.
      const autoScroll = () => {
        if (session.current !== current) return;
        const scroller = current.scroller;
        const box = scroller === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
        const { y } = current.point;
        const speed = y < box.top + EDGE ? -Math.ceil((box.top + EDGE - y) / 4) : y > box.bottom - EDGE ? Math.ceil((y - (box.bottom - EDGE)) / 4) : 0;
        if (speed) {
          scroller.scrollTop += speed;
          locate(current);
        }
        current.raf = requestAnimationFrame(autoScroll);
      };
      current.move = (moveEvent) => {
        current.point = { x: moveEvent.clientX, y: moveEvent.clientY };
        if (!current.started) {
          if (Math.hypot(moveEvent.clientX - current.start.x, moveEvent.clientY - current.start.y) < THRESHOLD) return;
          current.started = true;
          document.documentElement.setAttribute("data-block-dragging", payload.kind);
          setActive({ payload, label });
          current.raf = requestAnimationFrame(autoScroll);
        }
        moveEvent.preventDefault();
        locate(current);
      };
      current.up = () => finish(true);
      current.cancel = () => finish(false);
      current.lost = () => finish(Boolean(current.started && current.target));
      current.key = (keyEvent) => {
        if (keyEvent.key !== "Escape") return;
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        finish(false);
      };
      session.current = current;
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // bazı tarayıcılarda yakalama desteklenmez; olaylar yine de gelir
      }
      element.addEventListener("pointermove", current.move);
      element.addEventListener("pointerup", current.up);
      element.addEventListener("pointercancel", current.cancel);
      element.addEventListener("lostpointercapture", current.lost);
      window.addEventListener("keydown", current.key, true);
    },
    [finish, getContainer, locate]
  );

  // Bileşen kapanırken yarım kalan sürükleme temizlenir.
  useEffect(() => () => finish(false), [finish]);

  return { active, begin, ghostRef, lineRef };
}
