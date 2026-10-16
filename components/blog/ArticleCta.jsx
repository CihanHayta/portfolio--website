"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Send } from "lucide-react";
import ContactModal from "@/components/ContactModal";
import { ctaLabel } from "@/data/content";
import styles from "./ArticleCta.module.css";

// Sitenin mevcut iletişim formunu (WhatsApp'a yönlenen ContactModal) açar;
// yeni bir form ya da uç nokta eklemez.
export default function ArticleCta() {
  const [open, setOpen] = useState(false);

  return (
    <aside className={styles.cta} aria-labelledby="yazi-cta-baslik">
      <h2 id="yazi-cta-baslik" className={styles.title}>
        Markanızı doğru kitleye birlikte anlatalım
      </h2>
      <p className={styles.text}>
        Reklam, içerik ya da görsel tarafında destek arıyorsanız ücretsiz analizle başlayalım;
        mevcut durumunuzu inceleyip bir yol haritası çıkaralım.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => setOpen(true)}>
          <Send size={16} aria-hidden="true" />
          {ctaLabel}
        </button>
        <Link href="/#yontem" className={styles.secondary}>
          Nasıl çalışıyoruz?
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
      <ContactModal open={open} onClose={() => setOpen(false)} />
    </aside>
  );
}
