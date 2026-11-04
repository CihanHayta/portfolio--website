"use client";

import { useEffect, useLayoutEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { DWELL_MS, createCountdown, initialSlider, isPaused, nextIndex, sliderReducer } from "@/lib/blog/videoSlider";
import styles from "./AuthorVideos.module.css";

// Blog yazar kutusundaki dikey video slaytı.
// - Videolar gerçek oranlarında (9:16) "contain" ile gösterilir: esnemez, kırpılmaz.
// - Sessiz başlar; görünürken her video ~5,5 sn oynar, sonra yatay kaydırmayla sıradakine
//   geçilir. Aynı anda yalnızca etkin video oynar.
// - "Sesi aç" otomatik geçişi durdurur; video kaldığı yerden sonuna kadar oynar, bitince
//   sıradaki sessiz başlar ve otomatik geçiş yeniden başlar. "Sesi kapat" da geçişi başlatır.
// - Görünür alandan çıkınca ya da sekme gizlenince video ve sayaç durur; geri gelince sürer.
//   Fare üstündeyken ya da klavye odağı içerideyken yalnızca otomatik geçiş bekler.
// - Hareket azaltma ya da veri tasarrufu açıksa hiçbir şey kendiliğinden oynamaz.
// - Sahne görünür alana yaklaşmadan hiçbir video dosyası indirilmez.

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (callback) => {
  const query = window.matchMedia(MOTION_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};
const noSubscribe = () => () => {};
const autoplaySnapshot = () => !window.matchMedia(MOTION_QUERY).matches && !navigator.connection?.saveData;

export default function AuthorVideos({ videos, label = "Videolar" }) {
  const count = videos.length;
  const [state, dispatch] = useReducer(sliderReducer, count, initialSlider);
  // Sunucu çiziminde otomatik oynatma kapalı varsayılır; tarayıcı ayarı bilinince güncellenir.
  const autoplay = useSyncExternalStore(subscribeMotion, autoplaySnapshot, () => false);
  const motionReduced = useSyncExternalStore(subscribeMotion, () => window.matchMedia(MOTION_QUERY).matches, () => false);
  // Ortadaki oynat düğmesi yalnızca tarayıcıda gösterilir (ilk çizimde yanıp sönmez).
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [near, setNear] = useState(false);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [hover, setHover] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [playingSeq, setPlayingSeq] = useState(-1);
  const [failed, setFailed] = useState(() => new Set());

  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const videoRefs = useRef([]);
  const live = useRef({ index: 0, seq: 0, autoplay: false });
  const appliedSeq = useRef(-1);
  const dwellSeen = useRef(-1);
  const countdown = useRef(null);

  const { index, mode, seq } = state;
  const paused = isPaused(state, autoplay);
  const sound = mode === "sound";
  const shouldPlay = !paused && inView && pageVisible && near && !failed.has(index);
  const counting = shouldPlay && playingSeq === seq && !sound && autoplay && !hover && !keyboardFocus;
  const upcoming = nextIndex(state);

  // Görünürlük: yaklaşınca yükleme izni (bir kez), %35 görünürken oynatma.
  // Video indirmesi sayfanın kendi kaynakları (yazı tipi, görseller) bittikten sonra
  // ("load") başlar; böylece ilk boyamayla yarışmaz.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    let loaded = document.readyState === "complete";
    let pendingNear = false;
    const onLoad = () => {
      loaded = true;
      if (pendingNear) setNear(true);
    };
    if (!loaded) window.addEventListener("load", onLoad, { once: true });
    const nearObserver = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        nearObserver.disconnect();
        if (loaded) setNear(true);
        else pendingNear = true;
      },
      { rootMargin: "200px 0px" }
    );
    const viewObserver = new IntersectionObserver(([entry]) => setInView(entry.intersectionRatio >= 0.35), {
      threshold: [0, 0.2, 0.35, 0.5, 0.75, 1],
    });
    nearObserver.observe(stage);
    viewObserver.observe(stage);
    return () => {
      window.removeEventListener("load", onLoad);
      nearObserver.disconnect();
      viewObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Otomatik geçiş sayacı: yalnızca etkin video gerçekten oynarken ve sessiz moddayken sayar.
  useEffect(() => {
    countdown.current = createCountdown(DWELL_MS, () => dispatch({ type: "auto" }));
    return () => countdown.current?.stop();
  }, []);

  useEffect(() => {
    const timer = countdown.current;
    if (!timer) return;
    if (dwellSeen.current !== state.dwell) {
      timer.reset();
      dwellSeen.current = state.dwell;
    }
    if (counting) timer.start();
    else timer.stop();
  }, [state.dwell, counting]);

  // Oynatma eşitlemesi. Düzen efekti olduğu için tıklamanın içinde (kullanıcı
  // etkileşimi sürerken) çalışır; sesli oynatma tarayıcı politikasına takılmaz.
  useLayoutEffect(() => {
    live.current = { index, seq, autoplay };
    const list = videoRefs.current;
    list.forEach((video, i) => {
      if (!video || i === index) return;
      video.muted = true;
      if (!video.paused) video.pause();
    });
    const video = list[index];
    if (!video) return;
    if (appliedSeq.current !== seq) {
      appliedSeq.current = seq;
      delete video.dataset.ready;
      if (video.currentTime > 0) video.currentTime = 0;
    }
    video.muted = !sound;
    if (!shouldPlay) {
      if (!video.paused) video.pause();
      return;
    }
    if (!video.paused) return;
    const attempt = video.play();
    attempt?.catch((error) => {
      if (error?.name !== "NotAllowedError" || live.current.index !== index) return;
      if (!video.muted) {
        // Tarayıcı sesli oynatmaya izin vermedi: sessiz olarak sürdür.
        video.muted = true;
        dispatch({ type: "mute" });
        video.play().catch(() => dispatch({ type: "pause" }));
        return;
      }
      // Sessiz otomatik oynatma da engellendi (ör. düşük güç modu): oynat düğmesi görünür.
      dispatch({ type: "pause" });
    });
  }, [index, seq, sound, shouldPlay, autoplay]);

  // Sayfa gizlenirken/ayrılırken hiçbir video arka planda çalmaz.
  useLayoutEffect(() => {
    const list = videoRefs.current;
    return () => list.forEach((video) => video?.pause());
  }, []);

  const go = (type, target) => dispatch(type === "goto" ? { type, index: target } : { type });

  const togglePlay = () => {
    const video = videoRefs.current[index];
    if (paused) {
      dispatch({ type: "play" });
      if (video && near && video.paused && !failed.has(index)) video.play().catch(() => {});
    } else {
      dispatch({ type: "pause" });
      video?.pause();
    }
  };

  const toggleSound = () => {
    const video = videoRefs.current[index];
    if (sound) {
      if (video) video.muted = true;
      dispatch({ type: "mute" });
      return;
    }
    if (video) {
      video.muted = false;
      video.volume = 1;
      if (video.paused && near && !failed.has(index)) video.play().catch(() => {});
    }
    dispatch({ type: "unmute" });
  };

  const onFocusIn = (event) => {
    if (event.target.matches?.(":focus-visible")) setKeyboardFocus(true);
  };
  const onFocusOut = (event) => {
    if (!rootRef.current?.contains(event.relatedTarget)) setKeyboardFocus(false);
  };
  const onPointer = (value) => (event) => {
    if (event.pointerType === "mouse") setHover(value);
  };

  const preloadFor = (i) => {
    if (!near) return "none";
    if (i === index) return "auto";
    if (i === upcoming) return "metadata";
    return "none";
  };

  const slideState = (i) => {
    if (i === index) return "active";
    if (i === state.from) return "leaving";
    return "idle";
  };

  const current = videos[index];
  const announcement = state.reason === "user" ? `${index + 1}. video / ${count}: ${current.title}` : "";

  return (
    <div
      ref={rootRef}
      className={styles.carousel}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      data-author-videos=""
      data-index={index}
      data-mode={mode}
      data-paused={paused ? "true" : "false"}
      data-counting={counting ? "true" : "false"}
      onPointerEnter={onPointer(true)}
      onPointerLeave={onPointer(false)}
      onFocus={onFocusIn}
      onBlur={onFocusOut}
    >
      <div ref={stageRef} className={styles.stage} data-dir={state.dir > 0 ? "next" : "prev"}>
        {videos.map((video, i) => {
          const fit = { objectFit: video.fit ?? "contain", objectPosition: video.position ?? "50% 50%" };
          return (
            <div
              key={video.src}
              className={styles.slide}
              data-state={slideState(i)}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} / ${count}: ${video.title}`}
              inert={i !== index}
            >
              <Image
                src={video.poster}
                alt=""
                fill
                sizes="(max-width: 620px) 92vw, (max-width: 1120px) 46vw, 310px"
                className={styles.poster}
                style={fit}
              />
              <video
                ref={(element) => {
                  videoRefs.current[i] = element;
                }}
                className={styles.video}
                style={fit}
                src={near ? video.src : undefined}
                preload={preloadFor(i)}
                muted
                playsInline
                disablePictureInPicture
                aria-hidden="true"
                tabIndex={-1}
                onPlaying={(event) => {
                  event.currentTarget.dataset.ready = "true";
                  if (i === live.current.index) setPlayingSeq(live.current.seq);
                }}
                onPause={() => i === live.current.index && setPlayingSeq(-1)}
                onWaiting={() => i === live.current.index && setPlayingSeq(-1)}
                onEnded={() => {
                  if (i !== live.current.index) return;
                  setPlayingSeq(-1);
                  dispatch({ type: "ended", autoplay: live.current.autoplay });
                }}
                onError={() => {
                  setFailed((previous) => new Set(previous).add(i));
                  if (i === live.current.index && live.current.autoplay) dispatch({ type: "ended", autoplay: true });
                }}
              >
                Tarayıcın bu videoyu oynatamıyor.
              </video>
            </div>
          );
        })}
        {paused && hydrated ? (
          <button type="button" className={styles.bigPlay} onClick={togglePlay} tabIndex={-1} aria-hidden="true">
            <Play size={26} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className={styles.controls}>
        <div className={styles.transport}>
          <button type="button" className={styles.iconButton} onClick={() => go("prev")} aria-label="Önceki video">
            <ChevronLeft size={19} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={togglePlay}
            aria-label={paused ? "Videoyu oynat" : "Videoyu duraklat"}
          >
            {paused ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}
          </button>
          <button type="button" className={styles.iconButton} onClick={() => go("next")} aria-label="Sonraki video">
            <ChevronRight size={19} aria-hidden="true" />
          </button>
        </div>
        <button type="button" className={styles.sound} onClick={toggleSound} data-on={sound ? "true" : "false"}>
          {sound ? <Volume2 size={17} aria-hidden="true" /> : <VolumeX size={17} aria-hidden="true" />}
          {sound ? "Sesi kapat" : "Sesi aç"}
        </button>
      </div>

      <div className={styles.dots}>
        {videos.map((video, i) => (
          <button
            key={video.src}
            type="button"
            className={styles.dot}
            onClick={() => go("goto", i)}
            aria-label={`${i + 1}. video: ${video.title}`}
            aria-current={i === index ? "true" : undefined}
          >
            <span className={styles.dotMark}>
              {i === index && !motionReduced ? (
                <span
                  key={state.dwell}
                  className={styles.dotFill}
                  data-sound={sound ? "true" : "false"}
                  style={{ animationDuration: `${DWELL_MS}ms`, animationPlayState: counting ? "running" : "paused" }}
                />
              ) : null}
            </span>
          </button>
        ))}
      </div>

      <p className={styles.srOnly} aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </div>
  );
}
