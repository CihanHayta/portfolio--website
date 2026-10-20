"use client";

import { useId, useState } from "react";
import { Check } from "lucide-react";
import ContactButton from "./ContactButton";
import styles from "./home.module.css";

// Okuyucunun kendine uyan durumları işaretlediği kartlar. Gerçek onay
// kutularıdır: klavyeyle (Boşluk) işaretlenir, ekran okuyucu durumu okur.
// Seçimler sitede saklanmaz; ziyaretçi formu gönderirse WhatsApp ya da
// e-posta mesajına eklenir.
export default function ProblemCheck({ items, empty, result }) {
  const [checked, setChecked] = useState(() => items.map(() => false));
  const statusId = useId();
  const selected = items.filter((_, index) => checked[index]);
  const count = selected.length;
  const areas = [...new Set(selected.map((item) => item.area))].join(", ");

  return (
    <div className={styles.check} data-active={count > 0}>
      {/* Seçim sayısı başlığın hemen altında görünür; dar ekranda liste
          boyunca üstte kalır ki her seçimden sonra aşağı inmek gerekmesin.
          Aynı bilgi aşağıdaki durum alanında ekran okuyucuya okunur. */}
      <div className={styles.checkMain}>
        <div className={styles.checkStatus} aria-hidden="true">
          <span className={styles.checkStatusCount}>
            <strong>{count}</strong> / {items.length} seçildi
          </span>
          <span className={styles.checkStatusAreas}>{count > 0 ? areas : "Size uyanları işaretleyin"}</span>
        </div>

        <fieldset className={styles.checkGrid} aria-describedby={statusId}>
          <legend className={styles.srOnly}>Size uyan durumları işaretleyin</legend>
          {items.map((item, index) => (
            <label
              key={item.text}
              className={styles.checkCard}
              data-checked={checked[index]}
              data-reveal
              style={{ "--reveal-delay": `${index * 50}ms` }}
            >
              <input
                type="checkbox"
                className={styles.checkInput}
                checked={checked[index]}
                onChange={() => setChecked((current) => current.map((value, i) => (i === index ? !value : value)))}
              />
              <span className={styles.checkBox} aria-hidden="true">
                <Check size={14} strokeWidth={3} />
              </span>
              <span className={styles.checkText}>{item.text}</span>
            </label>
          ))}
        </fieldset>
      </div>

      <div className={styles.checkResult} data-active={count > 0}>
        <div id={statusId} role="status" aria-live="polite" className={styles.checkSummary}>
          {count === 0 ? (
            <p className={styles.checkEmpty}>{empty}</p>
          ) : (
            <>
              <p className={styles.checkCount}>
                <strong>{count}</strong> durum işaretlendi
              </p>
              <p className={styles.checkAreas}>İncelenecek alanlar: {areas}</p>
              <p className={styles.checkMessage}>{result}</p>
            </>
          )}
        </div>
        <ContactButton
          className={`btn ${count > 0 ? "btnGold" : "btnOutline"} ${styles.checkCta}`}
          selections={selected.map((item) => item.text)}
        />
      </div>
    </div>
  );
}
