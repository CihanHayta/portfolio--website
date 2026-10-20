"use client";

import styles from "../../../admin.module.css";

export default function TemplatesError({ reset }) {
  return (
    <div className={styles.card}>
      <div className={styles.emptyState} role="alert">
        <h2>Şablonlar yüklenemedi</h2>
        <p>Sayfa açılırken bir hata oluştu. Yeniden deneyebilir ya da yazı listesine dönebilirsiniz.</p>
        <button type="button" className={styles.btnPrimary} onClick={reset}>
          Yeniden dene
        </button>
      </div>
    </div>
  );
}
