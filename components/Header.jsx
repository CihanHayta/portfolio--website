"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu, X } from "lucide-react";
import { brand, meetingLabel, navLinks } from "@/data/content";
import ContactModal from "./ContactModal";
import { useMobileLayout } from "./adminShortcut";
import styles from "./Header.module.css";

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const menuButton = useRef(null);
  // Telefonda logo yönetime gider (tek dokunuş); masaüstünde ana sayfadır.
  const mobileLayout = useMobileLayout();
  const blogSection = pathname === "/blog" || pathname.startsWith("/blog/");
  const brandLink = {
    href: mobileLayout ? "/admin" : "/",
    prefetch: mobileLayout ? false : undefined,
    "aria-label": `${brand.mark.primary} ${brand.mark.secondary} ${mobileLayout ? "yönetim girişi" : "ana sayfa"}`,
  };
  const logoMark = <Image src="/brand/persona-mark.png" alt="" width={30} height={30} className={styles.logoMark} priority />;
  // Marka: "CİHAN" (ana ad) | "DİJİTAL PAZARLAMA" (ikincil ifade). Ayraç dekoratiftir;
  // dar telefonda yalnızca ana ad görünür. Bağlantının adı aria-label'dan gelir.
  const brandText = (
    <span className={styles.brandLockup}>
      <span className={styles.logoName}>{brand.mark.primary}</span>{" "}
      <span className={styles.logoDivider} aria-hidden="true" />{" "}
      <span className={styles.logoSuffix}>{brand.mark.secondary}</span>
    </span>
  );
  // Blog yönetimi de "Blog" bağlantısının altında sayılır.
  const isActive = (href) =>
    !href.includes("#") && (pathname.startsWith(href) || pathname.startsWith(`/admin${href}`));

  // Kaydırınca zemin koyulaşır ve ince bir gölge belirir. Yalnızca eşik
  // aşıldığında durum değişir; her kaydırma olayında yeniden çizim olmaz.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButton.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const openContact = () => {
    setOpen(false);
    setContactOpen(true);
  };

  return (
    <>
      <header className={`${styles.header} onDark`} data-scrolled={scrolled}>
        <div className={styles.inner}>
          {blogSection ? (
            // Blog sayfalarında tilki işareti blog ana sayfasına, marka yazısı her
            // zamanki yerine (masaüstünde ana sayfa, telefonda yönetim) gider.
            <div className={styles.logo}>
              <Link href="/blog" className={styles.logoMarkLink} aria-label="Blog ana sayfası">
                {logoMark}
              </Link>
              <Link {...brandLink} className={styles.logoText}>
                {brandText}
              </Link>
            </div>
          ) : (
            <Link {...brandLink} className={styles.logo}>
              {logoMark}
              {brandText}
            </Link>
          )}

          <nav className={styles.nav} aria-label="Ana menü">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={styles.navLink}
                aria-current={isActive(link.href) ? "page" : undefined}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Takvim olmadığı için düğme bir görüşme talebi formu açar. Dar
              ekranda "Talep Et" gizlenir; erişilebilir ad görünen metinle aynı kalır. */}
          <button type="button" className={`btn btnGold ${styles.cta}`} onClick={openContact}>
            {meetingLabel.replace(/ Talep Et$/, "")}
            <span className={styles.ctaRest}> Talep Et</span>
          </button>

          <button
            ref={menuButton}
            type="button"
            className={styles.menuBtn}
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
            aria-expanded={open}
            aria-controls="mobil-menu"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Menü her zaman DOM'da durur ki açılıp kapanırken animasyon çalışsın;
            kapalıyken görünmez ve klavye/ekran okuyucu için erişilemezdir. */}
        <div id="mobil-menu" className={styles.mobileMenu} data-open={open} inert={!open}>
          <div className={styles.mobileInner}>
            {/* Telefonda logo yönetime gittiği için ziyaretçinin ana sayfa yolu burada. */}
            <Link href="/" className={styles.mobileLink} style={{ "--i": 0 }} aria-current={pathname === "/" ? "page" : undefined} onClick={() => setOpen(false)}>
              Ana sayfa
            </Link>
            {navLinks.map((link, index) => (
              <Link
                key={link.href}
                href={link.href}
                className={styles.mobileLink}
                style={{ "--i": index + 1 }}
                aria-current={isActive(link.href) ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <button type="button" className={`btn btnGold ${styles.mobileCta}`} onClick={openContact}>
              {meetingLabel}
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <ContactModal open={contactOpen} intent="gorusme" onClose={() => setContactOpen(false)} />
    </>
  );
}
