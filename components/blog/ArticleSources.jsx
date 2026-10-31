import { ExternalLink } from "lucide-react";
import { hostLabel } from "@/lib/blog/meta";
import { sourceAnchor } from "@/lib/blog/citations";
import styles from "./ArticleEnd.module.css";

// "Yazıda kullanılan kaynaklar": yalnızca yazıya kaydedilmiş gerçek kaynaklar
// (content.meta.sources), numaralı. Metindeki [n] atıfları buradaki sıraya bağlanır.
// Kaynak yoksa ve yazar "kendi deneyimime dayanıyor" dediyse kısa editör notu
// gösterilir; ikisi de yoksa bölüm hiç çizilmez (kaynak uydurulmaz).
export default function ArticleSources({ sources = [], waived = false }) {
  if (!sources.length && !waived) return null;
  return (
    <section className={styles.sources} aria-labelledby="kaynaklar-baslik">
      <p className={styles.eyebrow}>Editörün notu</p>
      <h2 id="kaynaklar-baslik" className={styles.heading}>
        {sources.length ? "Yazıda kullanılan kaynaklar" : "Bu yazının dayanağı"}
      </h2>
      {sources.length ? (
        <>
          <p className={styles.note}>Bu yazı aşağıdaki kaynaklardan yararlanılarak özgün biçimde hazırlandı. Metindeki numaralar bu listeye bağlanır.</p>
          <ol className={styles.sourceList}>
            {sources.map((source, index) => (
              <li key={source.id || source.url} id={sourceAnchor(index + 1)} className={styles.sourceItem}>
                <span className={styles.sourceNumber} aria-hidden="true">{index + 1}</span>
                <span className={styles.sourceBody}>
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className={styles.sourceTitle}>
                    {source.title || hostLabel(source.url)}
                    <ExternalLink size={13} aria-hidden="true" />
                  </a>
                  <span className={styles.sourceSite}>
                    {source.siteName || hostLabel(source.url)}
                    {source.sectionUrl ? (
                      <>
                        {" · "}
                        <a href={source.sectionUrl} target="_blank" rel="noopener noreferrer">
                          {source.sectionLabel || "Sitenin blog bölümü"}
                        </a>
                      </>
                    ) : null}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className={styles.note}>Bu yazı yazarın kendi deneyim ve gözlemlerine dayanır; dış bir kaynaktan aktarılmış bilgi içermez.</p>
      )}
    </section>
  );
}
