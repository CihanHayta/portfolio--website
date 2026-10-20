"use client";

import { useEffect, useState } from "react";
import ArticleCta from "@/components/blog/ArticleCta";
import ArticleView from "@/components/blog/ArticleView";
import styles from "./AiPreviewClient.module.css";

export const PREVIEW_READY = "ai-preview-ready";
export const PREVIEW_DATA = "ai-preview-data";

export default function AiPreviewClient({ authorName }) {
  const [post, setPost] = useState(null);

  useEffect(() => {
    const onMessage = (event) => {
      // Yalnızca aynı kaynaktaki üst pencereden (editör) gelen veri kabul edilir.
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (event.data?.type === PREVIEW_DATA && event.data.post) setPost(event.data.post);
    };
    window.addEventListener("message", onMessage);
    if (window.parent !== window) {
      window.parent.postMessage({ type: PREVIEW_READY }, window.location.origin);
    }
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!post) {
    return (
      <p className={styles.empty} data-ai-preview="">
        Önizleme, editördeki “AI ile Blog Oluştur” penceresinden açılır.
      </p>
    );
  }

  return (
    <main
      className={styles.preview}
      data-ai-preview=""
      // Önizlemedeki bağlantılar çerçeveyi başka sayfaya götürmesin.
      onClickCapture={(event) => {
        const link = event.target.closest?.("a");
        if (link && !link.getAttribute("href")?.startsWith("#")) event.preventDefault();
      }}
    >
      <ArticleView post={{ ...post, author_name: post.author_name || authorName }}>
        <ArticleCta />
      </ArticleView>
    </main>
  );
}
