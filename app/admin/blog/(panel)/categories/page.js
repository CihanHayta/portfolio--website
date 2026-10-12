import { requireAdmin } from "@/lib/blog/admin";
import TaxonomyManager from "@/components/admin/TaxonomyManager";
import styles from "../../../admin.module.css";

export default async function AdminCategoriesPage() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("blog_categories")
    .select("id, name, slug, blog_posts(count)")
    .order("position")
    .order("name");

  const items = (data ?? []).map(({ blog_posts, ...item }) => ({
    ...item,
    postCount: blog_posts?.[0]?.count ?? 0,
  }));

  return (
    <div className={styles.card}>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Kategoriler</h1>
      </div>
      {error ? (
        <p className={styles.alertError} role="alert" style={{ marginTop: 16 }}>
          Kategoriler yüklenemedi. Sayfayı yenileyip yeniden dene.
        </p>
      ) : (
        <TaxonomyManager kind="category" items={items} />
      )}
    </div>
  );
}
