"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import ContactModal from "@/components/ContactModal";
import { meetingLabel } from "@/data/content";
import { SESSION_KEY, canShow, reachedThreshold, readSession, readingProgress } from "@/lib/blog/ctaTrigger";
import styles from "./BlogContactCard.module.css";

const LEAVE_MS = 200; // CSS'teki çıkış süresiyle aynı

function loadSession() {
  try {
    return readSession(sessionStorage.getItem(SESSION_KEY));
  } catch {
    return { dismissed: false, shows: 0 };
  }
}

function saveSession(session) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // depolama kapalıysa kart yalnızca bu sayfada kapanır
  }
}

// Okumayı bölmeyen, kapatılabilir iletişim kartı. Yazı sayfasında makale
// gövdesinin ~%45'i okununca, liste sayfasında belirgin bir kaydırmadan sonra
// görünür. Kapatılınca ya da CTA tıklanınca aynı oturumda bir daha görünmez;
// kapatılmasa da oturumda en fazla iki kez gösterilir. CTA, sitenin mevcut
// görüşme formunu (ContactModal) açar; gönderim WhatsApp/e-posta üzerinden olur.
export default function BlogContactCard({ mode = "article" }) {
  const [phase, setPhase] = useState("hidden"); // hidden | visible | leaving
  const [tucked, setTucked] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const shownRef = useRef(false);
  const leaveTimer = useRef(null);
  const cardRef = useRef(null);

  // Tetikleme: kaydırma dinleyicisi (pasif, kare başına en fazla bir ölçüm).
  useEffect(() => {
    if (!canShow(loadSession())) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      if (shownRef.current) return;
      const body = document.querySelector("[data-reading-body]");
      const rect = body?.getBoundingClientRect();
      const metrics = {
        progress: rect ? readingProgress(rect.top, rect.height, window.innerHeight) : 0,
        scrollY: window.scrollY,
        scrollHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
      };
      if (!reachedThreshold(mode, metrics)) return;
      const session = loadSession();
      if (!canShow(session)) return;
      shownRef.current = true;
      saveSession({ ...session, shows: session.shows + 1 });
      setPhase("visible");
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    // Dinleyici bağlanmadan önce kaydırılmışsa (ya da tarayıcı konumu geri
    // yüklediyse) bir kez ölçülür; açılışta ilerleme 0 olduğu için kart görünmez.
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [mode]);

  // Kart geri çekilir (görünmez, tıklanmaz, klavyeyle odaklanmaz):
  // - yazının sonundaki satır içi CTA ekrandayken (aynı mesaj iki kez görünmez);
  // - liste sayfasındaki yazar videosu kutusunun üstüne bindiğinde (video kontrolleri ve
  //   noktalar örtülmez). Kart videodan uzaktayken her zamanki gibi görünür.
  // Ölçüm kart görününce kurulur: liste sayfasında yazar kutusu akışla sonradan gelir.
  const shown = phase !== "hidden";
  useEffect(() => {
    if (!shown) return undefined;
    const inline = document.querySelector("[data-inline-cta]");
    const videos = document.querySelector("[data-author-videos]");
    let inlineVisible = false;
    let frame = 0;
    const overlapsVideos = () => {
      const card = cardRef.current;
      if (!videos || !card) return false;
      const a = card.getBoundingClientRect();
      const b = videos.getBoundingClientRect();
      const gap = 8;
      return a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap;
    };
    const update = () => {
      frame = 0;
      setTucked(inlineVisible || overlapsVideos());
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    let observer = null;
    if (inline && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        ([entry]) => {
          inlineVisible = entry.isIntersecting && entry.intersectionRatio >= 0.1;
          schedule();
        },
        { threshold: [0, 0.1, 0.2] }
      );
      observer.observe(inline);
    }
    if (videos) {
      window.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", schedule, { passive: true });
    }
    schedule();
    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [shown]);

  const dismiss = () => {
    saveSession({ ...loadSession(), dismissed: true });
    setPhase("leaving");
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => setPhase("hidden"), LEAVE_MS);
  };

  useEffect(() => {
    if (phase !== "visible" || modalOpen) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [phase, modalOpen]);

  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  const openForm = () => {
    setModalOpen(true);
    dismiss();
  };

  return (
    <>
      {phase !== "hidden" ? (
        <aside
          ref={cardRef}
          className={`${styles.card} onDark`}
          data-phase={phase}
          data-tucked={tucked || undefined}
          inert={tucked || undefined}
          aria-labelledby="blog-cta-card-title"
          aria-live="polite"
        >
          <button type="button" className={styles.close} aria-label="İletişim kartını kapat" onClick={dismiss}>
            <X size={18} aria-hidden="true" />
          </button>
          <p className={styles.eyebrow}>Persona Dijital Pazarlama</p>
          <h2 id="blog-cta-card-title" className={styles.title}>
            İşletmeniz için de bir büyüme planı oluşturalım.
          </h2>
          <p className={styles.text}>Reklam stratejinizi ve müşteri kazanım sürecinizi birlikte değerlendirelim.</p>
          <button type="button" className={styles.cta} onClick={openForm}>
            {meetingLabel}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </aside>
      ) : null}
      <ContactModal open={modalOpen} intent="gorusme" onClose={() => setModalOpen(false)} />
    </>
  );
}
