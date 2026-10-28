"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import MediaLibrary from "./MediaLibrary";
import styles from "./MediaPickerDialog.module.css";
import { useModalDialog } from "./useModalDialog";

export default function MediaPickerDialog({ open, title = "Görsel seç", onSelect, onClose }) {
  const ref = useRef(null);

  useModalDialog(ref, open);

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby="media-picker-title" onClose={onClose}>
      <div className={styles.head}>
        <h2 id="media-picker-title" className={styles.title}>
          {title}
        </h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Kapat">
          <X size={18} />
        </button>
      </div>
      {/* Kütüphane yalnızca pencere açıkken yüklenir. */}
      {open ? <MediaLibrary onSelect={onSelect} /> : null}
    </dialog>
  );
}
