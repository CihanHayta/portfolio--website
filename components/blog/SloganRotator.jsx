"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Pause, Play } from "lucide-react";
import styles from "./SloganRotator.module.css";

// Blog hero panelindeki slogan slaytı. Panelin boyutu, konumu ve fontları değişmez;
// yalnızca metin döner. Bütün sloganlar aynı ızgara hücresinde durur (yükseklik en
// uzununa göre sabit; geçişte alan değişmez). Önce eski slogan çıkar, sonra yenisi
// girer (üst üste binmez). Üzerine gelince/odakta ya da sekme gizliyken durur;
// klavye için odakta görünen bir durdur/oynat düğmesi vardır (WCAG 2.2.2).
// Hareket azaltma açıksa yalnızca ilk slogan sabit gösterilir.
const SHOW_MS = 2400;
const SWAP_MS = 380;

const subscribeMotion = (callback) => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function SloganRotator({ quotes }) {
  const reduced = useSyncExternalStore(subscribeMotion, reducedMotion, () => true);
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [hover, setHover] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [hidden, setHidden] = useState(false);
  const paused = hover || stopped || hidden;
  const count = quotes.length;

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (reduced || paused || count < 2 || leaving) return undefined;
    const timer = setTimeout(() => setLeaving(true), SHOW_MS);
    return () => clearTimeout(timer);
  }, [index, paused, reduced, count, leaving]);

  useEffect(() => {
    if (!leaving) return undefined;
    const timer = setTimeout(() => {
      setIndex((value) => (value + 1) % count);
      setLeaving(false);
    }, SWAP_MS);
    return () => clearTimeout(timer);
  }, [leaving, count]);

  const shown = reduced ? 0 : index;
  return (
    <span
      className={styles.rotator}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      data-slogan-rotator=""
      data-index={shown}
    >
      <span className={styles.stack}>
        {quotes.map((text, position) => (
          <span
            key={text}
            className={styles.item}
            data-state={position === shown ? (leaving ? "out" : "in") : "idle"}
            aria-hidden={position === shown ? undefined : "true"}
          >
            {text}
          </span>
        ))}
      </span>
      {count > 1 && !reduced ? (
        <button
          type="button"
          className={styles.toggle}
          aria-label={stopped ? "Sloganları oynat" : "Sloganları durdur"}
          aria-pressed={stopped}
          onClick={() => setStopped((value) => !value)}
        >
          {stopped ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}
        </button>
      ) : null}
    </span>
  );
}
