"use client";

import { useEffect, useRef } from "react";
import styles from "./ConfirmDialog.module.css";

// Yerel <dialog>: odak tuzağı, Esc ile kapanma ve arka plan perdesi tarayıcıdan gelir.
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id="confirm-title" className={styles.title}>
        {title}
      </h2>
      <div className={styles.body}>{children}</div>
      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onCancel} disabled={busy}>
          Vazgeç
        </button>
        <button
          type="button"
          className={styles.confirm}
          data-danger={danger}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? "İşleniyor…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
