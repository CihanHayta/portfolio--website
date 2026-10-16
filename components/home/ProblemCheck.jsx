"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import ContactButton from "./ContactButton";
import styles from "./home.module.css";

// Okuyucunun kendine uyan durumları işaretlediği kartlar. Gerçek onay
// kutularıdır: klavyeyle (Boşluk) işaretlenir, ekran okuyucu durumu okur.
export default function ProblemCheck({ items, hint, readyText }) {
  const [checked, setChecked] = useState(() => items.map(() => false));
  const count = checked.filter(Boolean).length;

  return (
    <>
      <p className={styles.checkHint}>{hint}</p>
      <ul className={styles.checkGrid}>
        {items.map((item, index) => (
          <li key={item}>
            <label className={styles.checkCard} data-checked={checked[index]}>
              <input
                type="checkbox"
                className={styles.checkInput}
                checked={checked[index]}
                onChange={() => setChecked((current) => current.map((value, i) => (i === index ? !value : value)))}
              />
              <span className={styles.checkBox} aria-hidden="true">
                <Check size={14} strokeWidth={3} />
              </span>
              <span>{item}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className={styles.checkFooter}>
        <ContactButton className="btn btnNight" />
        <p className={styles.checkStatus} aria-live="polite">
          {count >= 2 ? readyText : count === 1 ? "1 durum işaretlendi." : " "}
        </p>
      </div>
    </>
  );
}
