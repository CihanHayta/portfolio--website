"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Pause, Play } from "lucide-react";
import styles from "./ProjectVideo.module.css";

// Aynı anda yalnızca bir önizleme oynar. Görünür kartlar buraya kaydolur;
// üzerine gelinen kart önceliklidir, yoksa en çok görünen kart oynatılır.
const players = new Set();
let scheduled = 0;

// Aynı karede gelen görünürlük bildirimleri tek karara indirgenir; böylece
// kaydırma sırasında yanlış kart bir anlığına oynayıp boşuna indirilmez.
function arbitrate() {
  cancelAnimationFrame(scheduled);
  scheduled = requestAnimationFrame(decide);
}

function decide() {
  let winner = null;
  for (const p of players) {
    if (!p.eligible()) continue;
    if (!winner || p.priority() > winner.priority()) winner = p;
  }
  for (const p of players) {
    if (p === winner) p.play();
    else p.pause();
  }
}

function autoplayAllowed() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  // Veri tasarrufu açıkken video kendiliğinden indirilmez.
  if (navigator.connection?.saveData) return false;
  return true;
}

export default function ProjectVideo({ src, poster, alt, label }) {
  const wrapRef = useRef(null);
  const videoRef = useRef(null);
  // "auto": görünürlüğe göre, "on"/"off": kullanıcının açık tercihi
  const intent = useRef("auto");
  const state = useRef({ ratio: 0, hovered: false });
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const video = videoRef.current;
    if (!wrap || !video) return;

    if (!autoplayAllowed()) intent.current = "off";

    const player = {
      eligible: () => intent.current !== "off" && state.current.ratio >= 0.5,
      // Oynayan kart, eşit görünürlükte yerini korur (kartlar arası gidip gelme olmaz).
      priority: () =>
        state.current.ratio +
        (video.paused ? 0 : 0.5) +
        (state.current.hovered ? 2 : 0) +
        (intent.current === "on" ? 4 : 0),
      play: () => {
        if (video.paused) video.play().catch(() => {});
      },
      pause: () => {
        if (!video.paused) video.pause();
      },
    };
    players.add(player);

    const observer = new IntersectionObserver(
      ([entry]) => {
        state.current.ratio = entry.intersectionRatio;
        // Ekrandan çıkan kartta kullanıcı tercihi sıfırlanır, video durur.
        if (entry.intersectionRatio < 0.5 && intent.current === "on") intent.current = "auto";
        arbitrate();
      },
      { threshold: [0, 0.5, 0.75, 1] }
    );
    observer.observe(wrap);

    const card = wrap.closest("article") ?? wrap;
    const setHover = (hovered) => () => {
      state.current.hovered = hovered;
      arbitrate();
    };
    const onEnter = setHover(true);
    const onLeave = setHover(false);
    card.addEventListener("pointerenter", onEnter);
    card.addEventListener("pointerleave", onLeave);

    return () => {
      observer.disconnect();
      card.removeEventListener("pointerenter", onEnter);
      card.removeEventListener("pointerleave", onLeave);
      players.delete(player);
      video.pause();
    };
  }, []);

  const toggle = () => {
    intent.current = playing ? "off" : "on";
    arbitrate();
  };

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <Image
        src={poster}
        alt={alt}
        fill
        sizes="(max-width: 720px) 92vw, 560px"
        className={styles.poster}
      />
      {failed ? null : (
        <>
          <video
            ref={videoRef}
            className={`${styles.video} ${playing ? styles.videoVisible : ""}`}
            src={src}
            muted
            loop
            playsInline
            preload="none"
            disablePictureInPicture
            tabIndex={-1}
            aria-hidden="true"
            onPlaying={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onError={() => setFailed(true)}
          />
          <button
            type="button"
            className={styles.toggle}
            onClick={toggle}
            aria-pressed={playing}
            aria-label={playing ? `${label} videosunu duraklat` : `${label} videosunu oynat`}
          >
            {playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
          </button>
        </>
      )}
    </div>
  );
}
