"use client";

import { useEffect, useRef } from "react";
import { Search } from "lucide-react";
import styles from "./BlogSearch.module.css";

// Düz bir GET formu: JavaScript olmadan da çalışır. Başlıktaki arama simgesi
// /blog#blog-ara adresine gelir; o durumda alan odaklanır.
export default function BlogSearch({ defaultValue = "", category = "" }) {
  const inputRef = useRef(null);

  useEffect(() => {
    const focusIfTargeted = () => {
      if (window.location.hash === "#blog-ara") inputRef.current?.focus();
    };
    focusIfTargeted();
    window.addEventListener("hashchange", focusIfTargeted);
    return () => window.removeEventListener("hashchange", focusIfTargeted);
  }, []);

  return (
    <form action="/blog" method="get" role="search" className={styles.form}>
      <label htmlFor="blog-ara" className={styles.srOnly}>
        Blog yazılarında ara
      </label>
      <Search size={17} className={styles.icon} aria-hidden="true" />
      <input
        ref={inputRef}
        id="blog-ara"
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="Blog yazılarında ara…"
        maxLength={80}
        autoComplete="off"
        enterKeyHint="search"
        className={styles.input}
      />
      {category ? <input type="hidden" name="kategori" value={category} /> : null}
    </form>
  );
}
