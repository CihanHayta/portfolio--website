"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Send } from "lucide-react";
import ContactModal from "@/components/ContactModal";
import styles from "./ArticleEnd.module.css";

// Makale sonu kapanışı: ücretsiz ön görüşme çağrısı (tekil birinci şahıs) ve yazının
// konusuyla eşleşen gerçek hizmetler. Sitenin mevcut iletişim penceresini açar;
// yeni form/uç nokta yoktur. data-inline-cta: görünürken yüzen iletişim kartı gizlenir.
export default function ArticleClosing({ services = [] }) {
  const [open, setOpen] = useState(false);
  return (
    <aside className={styles.closing} aria-labelledby="kapanis-baslik" data-inline-cta>
      <p className={styles.eyebrow}>Benimle çalış</p>
      <h2 id="kapanis-baslik" className={styles.closingTitle}>Dijital Pazarlama İçin Ücretsiz Ön Görüşme</h2>
      <p className={styles.closingText}>
        Bu yazıdaki konuyu kendi işletmen için uygulamak istersen kısa bir ön görüşmeyle başlayalım. Mevcut durumunu birlikte
        değerlendirip sana uygun sonraki adımları netleştireyim.
      </p>
      <div className={styles.closingActions}>
        <button type="button" className={styles.primary} onClick={() => setOpen(true)}>
          <Send size={16} aria-hidden="true" /> Benimle iletişime geç
        </button>
        <Link href="/#hizmetler" className={styles.secondary}>
          Hizmetleri incele <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
      {services.length ? (
        <div className={styles.services}>
          <p className={styles.servicesTitle}>Bu yazıyla ilgili hizmetler</p>
          <ul>
            {services.map((service) => (
              <li key={service.title}>
                <Link href={service.href}>
                  <strong>{service.title}</strong>
                  <span>{service.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ContactModal open={open} onClose={() => setOpen(false)} intent="gorusme" />
    </aside>
  );
}
