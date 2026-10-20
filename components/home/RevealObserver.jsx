"use client";

import { useEffect } from "react";

// Kaydırma ile beliren öğeler için tek ve hafif gözlemci. İçerik sunucudan
// zaten görünür gelir; bu bileşen çalışınca yalnızca henüz ekrana girmemiş
// öğeler gizlenir ve ekrana yaklaştıklarında bir kez belirir. Hareket
// azaltma tercihi açıksa hiçbir şey gizlenmez.
export default function RevealObserver() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    const items = [...document.querySelectorAll("[data-reveal]")];
    const viewport = window.innerHeight;
    // Şu an ekranda olanlar gizlenmeden önce işaretlenir: ilk ekranda titreme olmaz.
    for (const el of items) {
      if (el.getBoundingClientRect().top < viewport * 0.92) el.classList.add("is-shown");
    }
    document.documentElement.classList.add("reveal-ready");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    for (const el of items) if (!el.classList.contains("is-shown")) observer.observe(el);

    return () => observer.disconnect();
  }, []);

  return null;
}
