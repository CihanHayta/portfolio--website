"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { navLinks, profile } from "@/data/content";
import ContactModal from "./ContactModal";
import styles from "./Header.module.css";

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const openContact = () => {
    setOpen(false);
    setContactOpen(true);
  };

  return (
    <>
      <header className={`${styles.header} ${scrolled ? styles.scrolled : ""}`}>
        <div className={`container ${styles.inner}`}>
          <a href="#top" className={styles.logo}>
            {profile.fullName}
          </a>

          <nav className={styles.nav}>
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className={styles.navLink}>
                {link.label}
              </a>
            ))}
          </nav>

          <button
            type="button"
            onClick={openContact}
            className={`btn btnDark ${styles.contactBtn}`}
          >
            İletişime Geç
          </button>

          <button
            type="button"
            className={styles.menuBtn}
            onClick={() => setOpen((v) => !v)}
            aria-label="Menüyü aç/kapat"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div
              className={styles.mobileMenu}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className={styles.mobileMenuInner}>
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className={styles.mobileNavLink}
                    onClick={() => setOpen(false)}
                  >
                    {link.label}
                  </a>
                ))}
                <button
                  type="button"
                  onClick={openContact}
                  className={`btn btnDark ${styles.mobileContactBtn}`}
                >
                  Get in touch
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </>
  );
}
