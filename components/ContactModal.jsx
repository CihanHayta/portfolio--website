"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { brand, ctaLabel, profile } from "@/data/content";
import { WhatsappIcon } from "./icons";
import styles from "./ContactModal.module.css";

const TIMELINE_OPTIONS = ["En kısa sürede", "1 ay", "1-3 ay", "Esnek"];

const initialForm = {
  name: "",
  email: "",
  details: "",
  timeline: TIMELINE_OPTIONS[0],
  budget: "",
};

function buildWhatsappMessage(form) {
  const lines = [
    `Merhaba, ${brand.legalName} için ücretsiz analiz talep ediyorum.`,
    "",
    `İsim: ${form.name}`,
    `E-posta: ${form.email}`,
    `Zamanlama: ${form.timeline}`,
    form.budget ? `Aylık reklam bütçesi: ${form.budget} ₺` : null,
    "",
    "Markam ve hedefim:",
    form.details,
  ].filter(Boolean);

  return lines.join("\n");
}

export default function ContactModal({ open, onClose }) {
  const [mounted] = useState(() => typeof document !== "undefined");
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!mounted) return null;

  const update = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const message = buildWhatsappMessage(form);
    const url = `https://wa.me/${profile.whatsapp}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.backdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onClose}
        >
          <motion.div
            className={styles.panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-modal-title"
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Kapat"
            >
              <X size={18} />
            </button>

            <div className={styles.header}>
              <span className={styles.avatar}>{brand.name[0]}</span>
              <div>
                <h2 id="contact-modal-title" className={styles.title}>
                  {ctaLabel}
                </h2>
                <p className={styles.subtitle}>Genellikle bir iş günü içinde dönüş yapıyoruz</p>
              </div>
            </div>

            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.row}>
                <label className={styles.field}>
                  <span className={styles.label}>İsim</span>
                  <input
                    required
                    type="text"
                    value={form.name}
                    onChange={update("name")}
                    placeholder="Adınız"
                    className={styles.input}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>E-posta</span>
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={update("email")}
                    placeholder="siz@sirket.com"
                    className={styles.input}
                  />
                </label>
              </div>

              <label className={styles.field}>
                <span className={styles.label}>
                  Markanız ve hedefiniz <span className={styles.hint}>En az 50 karakter</span>
                </span>
                <textarea
                  required
                  minLength={50}
                  value={form.details}
                  onChange={update("details")}
                  placeholder="Ne sattığınızı, kime ulaşmak istediğinizi ve şu an reklam ya da içerik tarafında ne yaptığınızı kısaca anlatın."
                  className={styles.textarea}
                  rows={4}
                />
              </label>

              <div className={styles.row}>
                <label className={styles.field}>
                  <span className={styles.label}>Zamanlama</span>
                  <select
                    value={form.timeline}
                    onChange={update("timeline")}
                    className={styles.input}
                  >
                    {TIMELINE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Aylık reklam bütçesi</span>
                  <div className={styles.budgetInput}>
                    <span>₺</span>
                    <input
                      type="number"
                      min="0"
                      value={form.budget}
                      onChange={update("budget")}
                      placeholder="Opsiyonel"
                      className={styles.input}
                    />
                  </div>
                </label>
              </div>

              <button type="submit" className={styles.submitBtn}>
                <WhatsappIcon size={18} />
                WhatsApp ile Gönder
              </button>

              <p className={styles.footnote}>
                E-postayı mı tercih edersiniz?{" "}
                <a href={`mailto:${profile.email}`}>{profile.email}</a> adresine yazın
              </p>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
