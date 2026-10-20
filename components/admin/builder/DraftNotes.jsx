"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, CircleAlert, ImagePlus, Sparkles, X } from "lucide-react";
import styles from "./DraftNotes.module.css";

// AI Blog Stüdyosu taslağı editöre aktardıktan sonra kalan notlar: gerçek
// sözcük sayısı, seçilen şablon, uyarılar ve kapsam. Mobilde yazma alanını
// kapatmamak için varsayılan olarak tek satırlık özet hâlindedir.
export default function DraftNotes({ notes, onAddImages, onClose }) {
  const [open, setOpen] = useState(false);
  const warnings = notes.warnings ?? [];
  const short = notes.words < notes.targetWords * 0.9;

  return (
    <aside className={styles.panel} data-open={open || undefined} aria-labelledby="draft-notes-title">
      <div className={styles.bar}>
        <button type="button" className={styles.toggle} aria-expanded={open} aria-controls="draft-notes-body" onClick={() => setOpen((value) => !value)}>
          <Sparkles size={16} aria-hidden="true" />
          <span id="draft-notes-title" className={styles.title}>
            Taslak hazır · {notes.words} sözcük{warnings.length ? ` · ${warnings.length} uyarı` : ""}
          </span>
          {open ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronUp size={18} aria-hidden="true" />}
        </button>
        <button type="button" className={styles.close} aria-label="Taslak notlarını kapat" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      {open ? (
        <div id="draft-notes-body" className={styles.body}>
          <p>
            <strong>{notes.words}</strong> sözcük (gerçek ölçüm) · hedef ≈{notes.targetWords} ({notes.auto ? "kaynağa göre" : "seçilen"})
            {notes.expansions ? ` · ${notes.expansions} genişletme turu` : ""}
            {short ? <span className={styles.warn}> · hedefin altında</span> : null}
          </p>
          {notes.template ? (
            <p>
              Şablon: <strong>{notes.template}</strong>
              {notes.templateReason ? <span className={styles.muted}> — {notes.templateReason}</span> : null}
            </p>
          ) : null}
          {notes.coverage?.total ? (
            <p>
              Kaynak kapsamı: {notes.coverage.covered}/{notes.coverage.total} konu
              {notes.coverage.missing?.length ? <span className={styles.muted}> — eksik: {notes.coverage.missing.join("; ")}</span> : null}
            </p>
          ) : null}
          {warnings.length ? (
            <ul className={styles.warnings}>
              {warnings.map((warning) => (
                <li key={warning}>
                  <CircleAlert size={14} aria-hidden="true" /> {warning}
                </li>
              ))}
            </ul>
          ) : null}
          <p className={styles.muted}>Başlık, SEO alanları ve kalıcı bağlantı “Ayarlar → Sayfa Ayarları”nda düzenlenir. Hiçbir şey yayımlanmadı.</p>
        </div>
      ) : null}
      {onAddImages ? (
        <button type="button" className={styles.images} onClick={onAddImages}>
          <ImagePlus size={16} aria-hidden="true" />
          {notes.imageSource?.images?.length ? `Görsel ekle (kaynakta ${notes.imageSource.images.length} görsel var)` : "Görsel ekle"}
        </button>
      ) : null}
    </aside>
  );
}
