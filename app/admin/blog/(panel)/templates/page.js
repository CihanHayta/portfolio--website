import { requireAdmin } from "@/lib/blog/admin";
import TemplateGallery from "@/components/admin/TemplateGallery";
import styles from "../../../admin.module.css";

export const metadata = { title: "Blog Şablonları — Blog Yönetimi" };

export default async function AdminTemplatesPage() {
  await requireAdmin();

  return (
    <div className={styles.card}>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Blog Şablonları</h1>
      </div>
      <p className={styles.muted} style={{ marginBlock: "6px 0", maxWidth: 680 }}>
        Bir şablon seçtiğinizde düzenlenebilir bloklarla yeni bir taslak açılır. Hiçbir şey otomatik kaydedilmez ya
        da yayımlanmaz; örnek metinler değiştirilmeden yazı yayımlanamaz.
      </p>
      <TemplateGallery />
    </div>
  );
}
