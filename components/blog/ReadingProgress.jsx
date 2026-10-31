"use client";

import { useEffect, useRef } from "react";
import { articleProgress } from "@/lib/blog/progress";
import styles from "./ReadingProgress.module.css";

// Sabit header'ın hemen altında, makale gövdesine göre dolan ince okuma çubuğu.
// Konumu header'ın gerçek alt kenarından ölçülür; sayfa düzeninde yer kaplamaz
// (position: fixed) ve dolgu transform ile çizilir (düzen kayması yok).
// Görseller yüklendikçe/pencere değiştikçe yeniden hesaplanır.
export default function ReadingProgress({ target = "[data-article-body]" }) {
  const barRef = useRef(null);
  const fillRef = useRef(null);

  useEffect(() => {
    const body = document.querySelector(target);
    const bar = barRef.current;
    if (!body || !bar) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const header = document.querySelector("header");
      const headerBottom = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
      bar.style.top = `${headerBottom}px`;
      const rect = body.getBoundingClientRect();
      const value = articleProgress({ top: rect.top, height: rect.height, viewport: window.innerHeight, offset: headerBottom + bar.offsetHeight });
      fillRef.current.style.transform = `scaleX(${value})`;
      bar.dataset.progress = value.toFixed(3);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(body);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
    };
  }, [target]);

  return (
    <div ref={barRef} className={styles.bar} aria-hidden="true" data-reading-progress="">
      <span ref={fillRef} className={styles.fill} />
    </div>
  );
}
