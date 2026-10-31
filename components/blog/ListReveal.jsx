"use client";

import { useEffect } from "react";

// Blog LİSTESİ için tek seferlik kaydırma animasyonu (yalnızca bu sayfada; admin ve
// makale metninde yok). Kartlar sunucudan görünür gelir; bu bileşen çalışınca yalnızca
// henüz ekrana girmemiş kartlar gizlenir ve ekrana girince bir kez belirir.
// - Yön, kartın sütununa göre: sol sütun soldan, sağ sütun sağdan, diğerleri aşağıdan.
// - Aynı satırdaki kartlar küçük gecikmeyle (60 ms) sırayla gelir; hepsi birden oynamaz.
// - Yalnızca transform/opacity: düzen kayması yok. Hareket azaltma açıksa hiçbir şey gizlenmez.
export default function ListReveal({ selector = "[data-list-reveal]" }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    if (!("IntersectionObserver" in window)) return undefined;
    const items = [...document.querySelectorAll(selector)];
    if (!items.length) return undefined;

    const viewport = window.innerHeight;
    const rows = new Map();
    for (const el of items) {
      const rect = el.getBoundingClientRect();
      const grid = el.parentElement.getBoundingClientRect();
      const columns = Math.max(1, Math.round(grid.width / rect.width));
      const column = Math.min(columns - 1, Math.max(0, Math.round((rect.left - grid.left) / rect.width)));
      el.dataset.revealDir = columns === 1 ? "up" : column === 0 ? "left" : column === columns - 1 ? "right" : "up";
      const row = Math.round(rect.top);
      const order = rows.get(row) ?? 0;
      rows.set(row, order + 1);
      el.style.setProperty("--reveal-delay", `${order * 60}ms`);
      // İlk ekrandakiler hiç gizlenmez (LCP ve ilk görünüm korunur).
      if (rect.top < viewport * 0.92) el.dataset.revealed = "shown";
    }
    document.documentElement.classList.add("list-reveal-ready");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.dataset.revealed = "in";
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.1 }
    );
    for (const el of items) if (!el.dataset.revealed) observer.observe(el);
    return () => observer.disconnect();
  }, [selector]);

  return null;
}
