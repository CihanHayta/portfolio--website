import Link from "next/link";
import { FilePlus2, Wand2 } from "lucide-react";
import styles from "@/app/admin/admin.module.css";

// Yönetim ana sayfasının başlığı ve iki hızlı başlangıç düğmesi. Girişten
// sonra ilk görülen ekran burasıdır; telefonda düğmeler tam genişlikte durur.
export default function PostsHead({ title }) {
  return (
    <div className={styles.pageHead}>
      <h1 className={styles.pageTitle}>{title}</h1>
      <div className={styles.headActions}>
        {/* Telefondan en hızlı yol: link yapıştır, stüdyo gerisini hazırlar. */}
        <Link href="/admin/blog/new?studio=1" className={styles.btnPrimary}>
          <Wand2 size={17} aria-hidden="true" />
          AI ile Yaz
        </Link>
        <Link href="/admin/blog/new" className={styles.btnSecondary}>
          <FilePlus2 size={17} aria-hidden="true" />
          Yeni Blog Yazısı
        </Link>
      </div>
    </div>
  );
}
