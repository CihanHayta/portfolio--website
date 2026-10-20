"use client";

import { useEffect, useState } from "react";
import { Check, Lightbulb, X } from "lucide-react";
import { applySuggestion } from "@/lib/blog/blocks/applySuggestions";
import { UPDATE_STORAGE_PREFIX } from "../studio/updateStorage";
import styles from "./UpdateSuggestions.module.css";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

// AI Blog Stüdyosu'nda önizlenip onaylanan güncelleme önerileri. Yalnızca
// `?oneriler=1` ile açılan editörde ve bu yazı için kayıtlı öneri varsa görünür.
// Hiçbir öneri kendiliğinden eklenmez: her biri "Uygula" ile, geri alınabilir
// tek bir adım olarak eklenir. Yayındaki yazı "Güncelle" denmeden değişmez.
export default function UpdateSuggestions({ postId, status, getBlocks, onApply }) {
  const [entry, setEntry] = useState(null);
  const [applied, setApplied] = useState(() => new Set());
  const key = `${UPDATE_STORAGE_PREFIX}${postId}`;

  useEffect(() => {
    if (!postId || !new URLSearchParams(window.location.search).has("oneriler")) return;
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null");
      if (saved && Date.now() - saved.createdAt < MAX_AGE_MS && Array.isArray(saved.suggestions) && saved.suggestions.length) {
        // Tarayıcı depolamasından okunan değer bir kez, bağlandığında duruma alınır.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEntry(saved);
      } else localStorage.removeItem(key);
    } catch {
      // depolama kullanılamıyor: panel görünmez
    }
  }, [postId, key]);

  if (!entry) return null;

  const dismiss = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      // yok sayılır
    }
    setEntry(null);
  };

  const apply = (suggestion) => {
    const result = applySuggestion(getBlocks(), suggestion);
    onApply(result.blocks, suggestion.heading || suggestion.afterHeading || "yazının sonu");
    setApplied((set) => new Set(set).add(suggestion.id));
  };

  return (
    <aside className={styles.panel} aria-labelledby="update-suggestions-title">
      <header className={styles.head}>
        <h2 id="update-suggestions-title" className={styles.title}>
          <Lightbulb size={16} aria-hidden="true" /> Güncelleme önerileri
        </h2>
        <button type="button" className={styles.close} aria-label="Önerileri kapat" onClick={dismiss}>
          <X size={16} />
        </button>
      </header>
      <p className={styles.hint}>
        Kaynak: “{entry.sourceTitle || "AI Blog Stüdyosu"}”. Uyguladığınız öneri ilgili bölümün sonuna eklenir; “Geri al” ile kaldırabilirsiniz.
        {status === "draft" ? " Taslak otomatik kaydedilir." : " Yayındaki yazı siz “Güncelle” demeden değişmez."}
      </p>
      <ol className={styles.list}>
        {entry.suggestions.map((item) => (
          <li key={item.id}>
            <p className={styles.where}>{item.afterHeading ? `“${item.afterHeading}” bölümüne` : "Yazının sonuna"}</p>
            {item.heading ? <p className={styles.heading}>H{item.level} {item.heading}</p> : null}
            <p className={styles.text}>{item.paragraphs.join(" ").slice(0, 280)}{item.paragraphs.join(" ").length > 280 ? "…" : ""}</p>
            {applied.has(item.id) ? (
              <span className={styles.done}><Check size={14} aria-hidden="true" /> Eklendi</span>
            ) : (
              <button type="button" className={styles.apply} onClick={() => apply(item)}>Uygula</button>
            )}
          </li>
        ))}
      </ol>
    </aside>
  );
}
