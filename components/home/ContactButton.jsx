"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { ctaLabel } from "@/data/content";
import ContactModal from "../ContactModal";

// Sayfadaki tüm analiz ve görüşme düğmeleri aynı iletişim formunu açar;
// `intent` formun başlığını, `selections` mesaja eklenecek işaretli
// durumları (kontrol listesinden) belirler.
export default function ContactButton({ className = "btn btnGold", label = ctaLabel, intent = "analiz", selections }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
        <ArrowRight size={17} aria-hidden="true" />
      </button>
      <ContactModal open={open} intent={intent} selections={selections} onClose={() => setOpen(false)} />
    </>
  );
}
