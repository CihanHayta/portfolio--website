import { requireAdmin } from "@/lib/blog/admin";
import MediaLibrary from "@/components/admin/MediaLibrary";
import styles from "../../../admin.module.css";

export default async function AdminMediaPage() {
  await requireAdmin();

  return (
    <div className={styles.card}>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Medya</h1>
      </div>
      <p className={styles.muted} style={{ marginBlock: "6px 18px" }}>
        Yüklenen görseller WebP olarak saklanır ve birden çok yazıda yeniden kullanılabilir.
      </p>
      <MediaLibrary />
    </div>
  );
}
