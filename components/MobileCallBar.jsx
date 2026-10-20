import { Phone } from "lucide-react";
import { profile } from "@/data/content";
import { WhatsappIcon } from "./icons";
import styles from "./MobileCallBar.module.css";

// Yalnızca dar ekranlarda görünen sabit arama çubuğu. Telefon numarası
// content.js'teki gerçek numaradan gelir. Sayfanın sonuna eklenen boşluk,
// çubuğun alt bilgiyi örtmesini engeller.
export default function MobileCallBar() {
  const tel = profile.phone.replace(/[^+\d]/g, "");
  return (
    <>
      <div className={styles.spacer} aria-hidden="true" />
      <nav className={`${styles.bar} onDark`} aria-label="Hızlı iletişim">
        <a href={`tel:${tel}`} className={styles.call}>
          <Phone size={18} aria-hidden="true" />
          Hemen Ara
        </a>
        <a
          href={`https://wa.me/${profile.whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.whatsapp}
          aria-label="WhatsApp'tan yaz (yeni sekmede açılır)"
        >
          <WhatsappIcon size={18} aria-hidden="true" />
          WhatsApp
        </a>
      </nav>
    </>
  );
}
