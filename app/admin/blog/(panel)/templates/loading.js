import styles from "../../../admin.module.css";
import gallery from "@/components/admin/TemplateGallery.module.css";

export default function TemplatesLoading() {
  return (
    <div className={styles.card} aria-busy="true" aria-label="Şablonlar yükleniyor">
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Blog Şablonları</h1>
      </div>
      <div className={gallery.skeleton} style={{ height: 42, maxWidth: 460, marginTop: 20 }} />
      <ul className={gallery.grid} aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index} className={gallery.skeleton} style={{ height: 330 }} />
        ))}
      </ul>
    </div>
  );
}
