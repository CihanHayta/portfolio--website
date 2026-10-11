import Link from "next/link";
import { FileQuestion } from "lucide-react";
import styles from "../blog.module.css";

export default function PostNotFound() {
  return (
    <main className="container" style={{ paddingBlock: "48px 96px" }}>
      <div className={styles.empty}>
        <FileQuestion size={30} strokeWidth={1.5} aria-hidden="true" />
        <h1 style={{ fontSize: 19, fontWeight: 800 }}>Bu yazı bulunamadı</h1>
        <p>Yazı kaldırılmış ya da adresi değişmiş olabilir.</p>
        <Link href="/blog" className={styles.emptyAction}>
          Tüm yazılara dön
        </Link>
      </div>
    </main>
  );
}
