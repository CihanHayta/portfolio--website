"use client";

import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, X } from "lucide-react";
import { onToast } from "./toast";
import styles from "./Toaster.module.css";

export default function Toaster() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let nextId = 0;
    return onToast(({ message, type }) => {
      const id = ++nextId;
      setItems((current) => [...current.slice(-2), { id, message, type }]);
      // Hata mesajları daha uzun kalır; kullanıcı okuyup harekete geçebilsin.
      setTimeout(
        () => setItems((current) => current.filter((item) => item.id !== id)),
        type === "error" ? 8000 : 4000
      );
    });
  }, []);

  return (
    <div className={styles.region} aria-live="polite" aria-atomic="false">
      {items.map((item) => (
        <div key={item.id} className={styles.toast} data-type={item.type}>
          {item.type === "error" ? (
            <CircleAlert size={18} aria-hidden="true" />
          ) : (
            <CircleCheck size={18} aria-hidden="true" />
          )}
          <span>{item.message}</span>
          <button
            type="button"
            className={styles.close}
            aria-label="Bildirimi kapat"
            onClick={() => setItems((current) => current.filter((other) => other.id !== item.id))}
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
