"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, Send, X } from "lucide-react";
import { navLinks, profile } from "@/data/content";
import ContactModal from "./ContactModal";
import styles from "./Header.module.css";

export default function Header({ variant = "default" }) {
  const pathname = usePathname();
  const isBlog = variant === "blog";
  // Blog yönetimi de "Blog" bağlantısının altında sayılır.
  const isActive = (href) =>
    !href.includes("#") && (pathname.startsWith(href) || pathname.startsWith(`/admin${href}`));
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
      <header
        className={`${styles.header} ${scrolled ? styles.scrolled : ""} ${isBlog ? styles.blog : ""}`}
      >
        <div className={`container ${styles.inner}`}>
          <Link href="/" className={styles.logo}>
            {profile.fullName}
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

          {isBlog && (
            <Link href="/blog#blog-ara" className={styles.searchLink} aria-label="Blogda ara">
              <Search size={18} aria-hidden="true" />
            </Link>
          )}

          <button
            type="button"
            onClick={openContact}
            className={`btn btnDark ${styles.contactBtn}`}
          >
            {isBlog ? (
              <>
                <Send size={16} aria-hidden="true" />
                İletişim
              </>
            ) : (
              "İletişime Geç"
            )}
          </button>

          <button
            type="button"
            className={styles.menuBtn}
            onClick={() => setOpen((v) => !v)}
            aria-label="Menüyü aç/kapat"
            aria-expanded={open}
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
                  <Link
                    key={link.href}
                    href={link.href}
                    className={styles.mobileNavLink}
                    aria-current={isActive(link.href) ? "page" : undefined}
                    onClick={() => setOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={openContact}
                  className={`btn btnDark ${styles.mobileContactBtn}`}
                >
                  İletişime Geç
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
