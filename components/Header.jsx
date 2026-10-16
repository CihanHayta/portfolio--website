"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu, X } from "lucide-react";
import { brand, ctaLabel, navLinks } from "@/data/content";
import ContactModal from "./ContactModal";
import styles from "./Header.module.css";

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  // Blog yönetimi de "Blog" bağlantısının altında sayılır.
  const isActive = (href) =>
    !href.includes("#") && (pathname.startsWith(href) || pathname.startsWith(`/admin${href}`));

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const openContact = () => {
    setOpen(false);
    setContactOpen(true);
  };

  return (
    <>
      <header className={`${styles.header} onDark`}>
        <div className={styles.inner}>
          <Link href="/" className={styles.logo} aria-label={`${brand.legalName} ana sayfa`}>
            <Image src="/brand/persona-mark.png" alt="" width={30} height={30} className={styles.logoMark} priority />
            <span>
              <span className={styles.logoName}>{brand.name}</span> {brand.suffix}
            </span>
          </Link>

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

          <button type="button" className={`btn btnGold ${styles.cta}`} onClick={openContact}>
            {ctaLabel}
          </button>

          <button
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

        {open ? (
          <div id="mobil-menu" className={styles.mobileMenu}>
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={styles.mobileLink}
                aria-current={isActive(link.href) ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <button type="button" className={`btn btnGold ${styles.mobileCta}`} onClick={openContact}>
              {ctaLabel}
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </header>

      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </>
  );
}
