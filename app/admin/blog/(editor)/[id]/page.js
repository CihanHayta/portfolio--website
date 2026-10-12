import Link from "next/link";
import { notFound } from "next/navigation";
import { ADMIN_POST_FIELDS, requireAdmin } from "@/lib/blog/admin";
import { SITE_URL } from "@/lib/supabase/env";
import BlogBuilder from "@/components/admin/builder/BlogBuilder";
import styles from "../../../admin.module.css";

export const metadata = { title: "Yazıyı Düzenle — Blog Yönetimi" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function AdminPostPage({ params }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { supabase } = await requireAdmin();
  const [{ data: post }, { data: categories }] = await Promise.all([
    supabase.from("blog_posts").select(ADMIN_POST_FIELDS).eq("id", id).maybeSingle(),
    supabase.from("blog_categories").select("id, name, slug").order("position").order("name"),
  ]);
  if (!post) notFound();

  if (post.deleted_at) {
    return (
      <main style={{ padding: "48px 16px" }}>
        <div className={styles.card} style={{ maxWidth: 560, marginInline: "auto" }}>
          <div className={styles.emptyState}>
            <h1 style={{ fontSize: 17, fontWeight: 800 }}>Bu yazı çöp kutusunda</h1>
            <p>Düzenlemek için önce çöp kutusundan geri yükle.</p>
            <Link href="/admin/blog?view=trash" className={styles.btnSecondary}>
              Çöp kutusuna git
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <BlogBuilder key={post.id} post={post} categories={categories ?? []} siteHost={new URL(SITE_URL).host} />
  );
}
