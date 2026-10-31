"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ListTree } from "lucide-react";
import styles from "./ArticleToc.module.css";

// İçindekiler: gerçek H2/H3 başlıklarından (benzersiz kimliklerle) türetilir.
// - H2'ler 01, 02 … diye numaralanır; H3'ler girintili alt satırdır.
// - Okunan bölüm turuncu işaretle gösterilir: "sabit üst alanın hemen altındaki
//   çizgiyi geçmiş son başlık" kuralı (yalnızca değiştiğinde güncellenir; titremez).
// - 8'den uzun liste daraltılabilir; telefonda <details> varsayılan kapalıdır.
// - Tıklama hareket azaltma ayarına uyar ve adresi (#kimlik) günceller.
const COLLAPSE_AFTER = 8;

export function numberedHeadings(headings) {
  let major = 0;
  return headings.map((heading) => {
    const top = heading.level <= 1;
    if (top) major += 1;
    return { ...heading, number: top ? String(major).padStart(2, "0") : "", sub: !top };
  });
}

function useActiveHeading(ids) {
  const [active, setActive] = useState(null);
  useEffect(() => {
    if (!ids.length) return undefined;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const header = document.querySelector("header");
      const line = (header ? Math.max(0, header.getBoundingClientRect().bottom) : 0) + 3 + 32;
      let current = null;
      for (const id of ids) {
        const element = document.getElementById(id);
        if (!element) continue;
        if (element.getBoundingClientRect().top <= line) current = id;
        else break;
      }
      setActive((previous) => (previous === current ? previous : current));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [ids]);
  return active;
}

function go(event, id, onDone) {
  const target = document.getElementById(id);
  if (!target) return;
  event.preventDefault();
  // Telefonda liste ÖNCE kapanır; kaydırma düzen yerleştikten sonra hesaplanır
  // (aksi hâlde kapanan liste kadar sayfa kayar ve başlık ekranın üstünde kalır).
  onDone?.();
  requestAnimationFrame(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  });
}

function TocList({ items, active, expanded, onNavigate, idPrefix }) {
  const visible = expanded ? items : items.slice(0, COLLAPSE_AFTER);
  return (
    <ol className={styles.list} id={`${idPrefix}-list`}>
      {visible.map((item) => (
        <li key={item.id} className={styles.item} data-sub={item.sub || undefined} data-active={active === item.id || undefined}>
          <a href={`#${item.id}`} aria-current={active === item.id ? "location" : undefined} onClick={(event) => go(event, item.id, onNavigate)}>
            <span className={styles.number} aria-hidden="true">{item.number}</span>
            <span className={styles.label}>{item.label}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

export default function ArticleToc({ headings, variant = "desktop" }) {
  const items = useMemo(() => numberedHeadings(headings), [headings]);
  const ids = useMemo(() => items.map((item) => item.id), [items]);
  const active = useActiveHeading(ids);
  const [expanded, setExpanded] = useState(items.length <= COLLAPSE_AFTER);
  const [open, setOpen] = useState(false);
  const idPrefix = `toc-${variant}`;
  const more = items.length > COLLAPSE_AFTER;

  const toggleMore = more ? (
    <button type="button" className={styles.more} aria-expanded={expanded} aria-controls={`${idPrefix}-list`} onClick={() => setExpanded((value) => !value)}>
      {expanded ? "Daha az göster" : `Tümünü göster (${items.length})`}
      <ChevronDown size={14} aria-hidden="true" data-open={expanded || undefined} />
    </button>
  ) : null;

  if (variant === "mobile") {
    return (
      <details className={styles.mobile} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary>
          <ListTree size={16} aria-hidden="true" />
          <span>İçindekiler</span>
          <span className={styles.count}>{items.length}</span>
          <ChevronDown size={16} aria-hidden="true" className={styles.chevron} />
        </summary>
        <TocList items={items} active={active} expanded onNavigate={() => setOpen(false)} idPrefix={idPrefix} />
      </details>
    );
  }

  return (
    <nav className={styles.desktop} aria-label="İçindekiler">
      <p className={styles.title}>
        <ListTree size={15} aria-hidden="true" /> İçindekiler
      </p>
      <TocList items={items} active={active} expanded={expanded} idPrefix={idPrefix} />
      {toggleMore}
    </nav>
  );
}
