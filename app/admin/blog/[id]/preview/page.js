import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/blog/admin";
import { STATE_LABELS, postState } from "@/lib/blog/format";
import ArticleView from "@/components/blog/ArticleView";
import styles from "./preview.module.css";

export const metadata = { title: "Önizleme — Blog Yönetimi" };

const UUID = /^[0-9a-f-]{36}$/i;

// Taslaklar yalnızca oturum açmış yönetici için, RLS üzerinden okunur;
// herkese açık hiçbir adres ya da paylaşılabilir önizleme bağlantısı yoktur.
export default async function PostPreviewPage({ params }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { supabase } = await requireAdmin();
  const { data: post } = await supabase
    .from("blog_posts")
    .select(
      "id, title, slug, excerpt, content, published_at, updated_at, reading_minutes, cover_alt, " +
        "author_name, status, deleted_at, cover:blog_media(url, width, height), " +
        "category:blog_categories(name, slug), tags:blog_tags(name, slug)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!post) notFound();

  return (
    <div className={styles.preview}>
      <div className={styles.bar} role="status">
        <Link href={`/admin/blog/${post.id}`} className={styles.back}>
          <ArrowLeft size={16} aria-hidden="true" />
          Editöre dön
        </Link>
        <span>
          Önizleme · <strong>{STATE_LABELS[postState(post)]}</strong> · son kaydedilen hali
        </span>
      </div>
      <ArticleView post={post} />
    </div>
  );
}
