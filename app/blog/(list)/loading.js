import styles from "../blog.module.css";

export default function BlogLoading() {
  return (
    <main className={`container ${styles.page}`} aria-busy="true" aria-label="Yazılar yükleniyor">
      <div className={styles.main}>
        <div className={styles.skeleton} style={{ height: 300 }} />
        <div className={styles.grid}>
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className={styles.skeleton} style={{ height: 270 }} />
          ))}
        </div>
      </div>
      <aside className={styles.sidebar}>
        <div className={styles.skeleton} style={{ height: 250 }} />
        <div className={styles.skeleton} style={{ height: 180 }} />
      </aside>
    </main>
  );
}
