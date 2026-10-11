"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import styles from "./blog.module.css";

export default function BlogError({ reset }) {
  return (
    <main className="container" style={{ paddingBlock: "48px 96px" }}>
      <div className={styles.empty} role="alert">
        <TriangleAlert size={30} strokeWidth={1.5} aria-hidden="true" />
        <h1 style={{ fontSize: 19, fontWeight: 800 }}>Yazılar şu anda yüklenemedi</h1>
        <p>Geçici bir sorun oluştu. Birkaç saniye sonra yeniden dene.</p>
        <button type="button" onClick={reset} className={styles.emptyAction}>
          <RotateCw size={15} aria-hidden="true" />
          Yeniden dene
        </button>
      </div>
    </main>
  );
}
