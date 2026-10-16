"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { ctaLabel } from "@/data/content";
import ContactModal from "../ContactModal";

// Sayfadaki tüm "Ücretsiz Analiz Al" düğmeleri aynı iletişim formunu açar.
export default function ContactButton({ className = "btn btnGold", label = ctaLabel }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
        <ArrowRight size={17} aria-hidden="true" />
      </button>
      <ContactModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
