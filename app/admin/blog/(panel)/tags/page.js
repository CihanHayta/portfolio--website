import { requireAdmin } from "@/lib/blog/admin";
import TaxonomyManager from "@/components/admin/TaxonomyManager";
import styles from "../../../admin.module.css";

export default async function AdminTagsPage() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("blog_tags")
    .select("id, name, slug, blog_post_tags(count)")
    .order("name");

  const items = (data ?? []).map(({ blog_post_tags, ...item }) => ({
    ...item,
    postCount: blog_post_tags?.[0]?.count ?? 0,
  }));

  return (
    <div className={styles.card}>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Etiketler</h1>
      </div>
      {error ? (
        <p className={styles.alertError} role="alert" style={{ marginTop: 16 }}>
          Etiketler yüklenemedi. Sayfayı yenileyip yeniden dene.
        </p>
      ) : (
        <TaxonomyManager kind="tag" items={items} />
      )}
    </div>
  );
}
