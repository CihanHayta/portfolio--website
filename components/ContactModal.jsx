"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Mail, X } from "lucide-react";
import { brand, contactIntents, profile } from "@/data/content";
import { WhatsappIcon } from "./icons";
import styles from "./ContactModal.module.css";

const TIMELINE_OPTIONS = ["En kısa sürede", "1 ay", "1-3 ay", "Esnek"];
const DETAILS_MIN = 10;

const initialForm = {
  name: "",
  email: "",
  details: "",
  timeline: TIMELINE_OPTIONS[0],
  budget: "",
};

// Kapanış animasyonunun süresi (CSS'teki modalOut ile aynı).
const CLOSE_MS = 180;

// WhatsApp ve e-posta aynı metni gönderir: form alanları ve varsa ana
// sayfadaki kontrol listesinde işaretlenen durumlar.
function buildMessage(form, intent, selections) {
  const lines = [
    `Merhaba, ${brand.legalName} üzerinden ${intent.request}.`,
    "",
    `İsim: ${form.name}`,
    `E-posta: ${form.email}`,
    `Zamanlama: ${form.timeline}`,
    form.budget ? `Aylık reklam bütçesi: ${form.budget} ₺` : null,
    "",
    "Markam ve hedefim:",
    form.details,
  ];
  if (selections.length) {
    lines.push("", "İşaretlediğim durumlar:", ...selections.map((item) => `- ${item}`));
  }
  return lines.filter((line) => line !== null).join("\n");
}

// Animasyon kütüphanesi kullanılmaz: giriş ve çıkış CSS ile yapılır, böylece
// form sayfanın ilk JavaScript yüküne ek maliyet getirmez.
export default function ContactModal({ open, onClose, intent: intentKey = "analiz", selections = [] }) {
  const intent = contactIntents[intentKey] ?? contactIntents.analiz;
  const [mounted] = useState(() => typeof document !== "undefined");
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef(null);
  const firstField = useRef(null);
  const [form, setForm] = useState(initialForm);
  // Mesaj WhatsApp'ta ya da e-posta uygulamasında hazırlandıktan sonra
  // gösterilen onay. Gerçekten gönderilip gönderilmediği bilinemez; bu yüzden
  // "gönderildi" denmez.
  const [sent, setSent] = useState(null);

  const close = () => {
    if (closeTimer.current) return;
    setClosing(true);
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setClosing(false);
      setSent(null);
      onClose();
    }, CLOSE_MS);
  };
  const onEscape = useEffectEvent(close);

  useEffect(() => {
    if (!open) return;
    // Odak forma taşınır; kapanınca formu açan düğmeye geri döner.
    const opener = document.activeElement;
    firstField.current?.focus();
    const onKeyDown = (e) => {
      if (e.key === "Escape") onEscape();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  if (!mounted || !open) return null;

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  // İki gönderme düğmesi de formu doğrular; hangisine basıldığı kanalı belirler.
  const handleSubmit = (e) => {
    e.preventDefault();
    const message = buildMessage(form, intent, selections);
    if (e.nativeEvent.submitter?.value === "email") {
      const subject = `${intent.title} — ${form.name}`;
      const url = `mailto:${profile.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
      window.location.href = url;
      setSent({ channel: "email", url });
    } else {
      const url = `https://wa.me/${profile.whatsapp}?text=${encodeURIComponent(message)}`;
      window.open(url, "_blank", "noopener,noreferrer");
      setSent({ channel: "whatsapp", url });
    }
  };

  return createPortal(
    <div className={styles.backdrop} data-state={closing ? "closing" : "open"} onClick={close}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.closeBtn} onClick={close} aria-label="Kapat">
          <X size={18} />
        </button>

        <div className={styles.header}>
          <span className={styles.avatar}>{brand.name[0]}</span>
          <div>
            <h2 id="contact-modal-title" className={styles.title}>
              {intent.title}
            </h2>
            <p className={styles.subtitle}>Genellikle bir iş günü içinde dönüş yapıyoruz</p>
          </div>
        </div>

        {sent ? (
          <div className={styles.sent} role="status">
            {sent.channel === "email" ? (
              <>
                <p className={styles.sentTitle}>E-postanız hazır</p>
                <p className={styles.sentText}>
                  Göndermek için e-posta uygulamanızda “Gönder”e basın. Uygulama açılmadıysa aşağıdaki düğmeyi kullanın
                  ya da {profile.email} adresine yazın.
                </p>
                <a href={sent.url} className={styles.submitBtn}>
                  <Mail size={18} aria-hidden="true" />
                  E-posta uygulamasını aç
                </a>
              </>
            ) : (
              <>
                <p className={styles.sentTitle}>Mesajınız WhatsApp’ta hazır</p>
                <p className={styles.sentText}>
                  Göndermek için WhatsApp’ta “Gönder”e dokunun. WhatsApp açılmadıysa aşağıdaki düğmeyi kullanın.
                </p>
                <a href={sent.url} target="_blank" rel="noopener noreferrer" className={styles.submitBtn}>
                  <WhatsappIcon size={18} />
                  WhatsApp’ı aç
                </a>
              </>
            )}
            <button type="button" className={styles.secondaryBtn} onClick={close}>
              Kapat
            </button>
          </div>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            {selections.length ? (
              <div className={styles.selections}>
                <p className={styles.label}>İşaretlediğiniz durumlar ({selections.length}) — mesaja eklenecek</p>
                <ul>
                  {selections.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>İsim</span>
                <input
                  ref={firstField}
                  required
                  autoComplete="name"
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
                  autoComplete="email"
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
                Markanız ve hedefiniz <span className={styles.hint}>En az {DETAILS_MIN} karakter</span>
              </span>
              <textarea
                required
                minLength={DETAILS_MIN}
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
                <select value={form.timeline} onChange={update("timeline")} className={styles.input}>
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

            <button type="submit" value="whatsapp" className={styles.submitBtn}>
              <WhatsappIcon size={18} />
              WhatsApp ile Gönder
            </button>
            <button type="submit" value="email" className={`${styles.secondaryBtn} ${styles.emailBtn}`}>
              <Mail size={17} aria-hidden="true" />
              E-posta ile Gönder
            </button>

            <p className={styles.footnote}>
              Bilgileriniz sitemizde saklanmaz.{" "}
              <a href="/gizlilik" onClick={close}>
                Gizlilik Politikası
              </a>
            </p>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
