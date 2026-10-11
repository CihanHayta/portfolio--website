import Link from "next/link";
import { FilePlus2, Search } from "lucide-react";
import { requireAdmin } from "@/lib/blog/admin";
import { STATE_LABELS, formatDateTime, postState } from "@/lib/blog/format";
import PostRowActions from "@/components/admin/PostRowActions";
import { createDraft } from "./actions";
import styles from "../admin.module.css";

const first = (value) => (Array.isArray(value) ? value[0] : value) ?? "";
const VIEW_TITLES = { "": "Tüm Yazılar", drafts: "Taslaklar", trash: "Çöp Kutusu" };
const LIST_LIMIT = 100;

export default async function AdminPostsPage({ searchParams }) {
  const { supabase } = await requireAdmin();
  const params = await searchParams;
  const view = first(params.view) in VIEW_TITLES ? first(params.view) : "";
  const q = first(params.q).trim().slice(0, 80);
  const categoryId = first(params.kategori);
  const status = first(params.durum);

  const { data: categories } = await supabase
    .from("blog_categories")
    .select("id, name")
    .order("position")
    .order("name");

  let request = supabase
    .from("blog_posts")
    .select(
      "id, title, slug, status, published_at, updated_at, deleted_at, revision, category:blog_categories(name)"
    )
    .order("updated_at", { ascending: false })
    .limit(LIST_LIMIT);

  request = view === "trash" ? request.not("deleted_at", "is", null) : request.is("deleted_at", null);
  if (view === "drafts") request = request.eq("status", "draft");

  const term = q.replace(/[%_,()"\\*]/g, " ").trim();
  if (term) request = request.or(`title.ilike.%${term}%,slug.ilike.%${term}%`);
  if (categories?.some((category) => category.id === categoryId)) {
    request = request.eq("category_id", categoryId);
  }

  const now = new Date().toISOString();
  if (view === "") {
    if (status === "draft") request = request.eq("status", "draft");
    if (status === "published") request = request.eq("status", "published").lte("published_at", now);
    if (status === "scheduled") request = request.eq("status", "published").gt("published_at", now);
  }

  const { data: posts, error } = await request;
  const isFiltered = Boolean(term || categoryId || status);

  return (
    <div className={styles.card}>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>{VIEW_TITLES[view]}</h1>
        <form action={createDraft}>
          <button type="submit" className={styles.btnPrimary}>
            <FilePlus2 size={17} aria-hidden="true" />
            Yeni yazı
          </button>
        </form>
      </div>

      <form method="get" className={styles.filters} role="search">
        {view ? <input type="hidden" name="view" value={view} /> : null}
        <div className={styles.searchField}>
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Başlık ya da bağlantıda ara…"
            aria-label="Başlık ya da kalıcı bağlantıda ara"
            className={styles.input}
          />
        </div>
        <select name="kategori" defaultValue={categoryId} aria-label="Kategori" className={styles.input}>
          <option value="">Tüm kategoriler</option>
          {categories?.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {view === "" ? (
          <select name="durum" defaultValue={status} aria-label="Yayın durumu" className={styles.input}>
            <option value="">Tüm durumlar</option>
            <option value="draft">Taslak</option>
            <option value="scheduled">Planlandı</option>
            <option value="published">Yayında</option>
          </select>
        ) : null}
        <button type="submit" className={styles.btnSecondary}>
          Süz
        </button>
      </form>

      {error ? (
        <p className={styles.alertError} role="alert">
          Yazılar yüklenemedi. Sayfayı yenileyip yeniden dene.
        </p>
      ) : posts.length === 0 ? (
        <div className={styles.emptyState}>
          <h2>{isFiltered ? "Eşleşen yazı yok" : view === "trash" ? "Çöp kutusu boş" : "Henüz yazı yok"}</h2>
          <p>
            {isFiltered
              ? "Arama ya da filtreleri değiştirmeyi dene."
              : view === "trash"
                ? "Sildiğin yazılar kalıcı olarak silinene kadar burada durur."
                : "İlk yazını oluşturmak için “Yeni yazı” düğmesini kullan."}
          </p>
          {isFiltered ? (
            <Link href={view ? `/admin/blog?view=${view}` : "/admin/blog"} className={styles.btnSecondary}>
              Filtreleri temizle
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <ul className={styles.postList}>
            {posts.map((post) => {
              const state = postState(post);
              return (
                <li key={post.id} className={styles.postRow}>
                  <div className={styles.postMain}>
                    {state === "trashed" ? (
                      <span className={styles.postTitle}>{post.title || "Başlıksız yazı"}</span>
                    ) : (
                      <Link href={`/admin/blog/${post.id}`} className={styles.postTitle}>
                        {post.title || "Başlıksız yazı"}
                      </Link>
                    )}
                    <span className={styles.postSlug}>/blog/{post.slug}</span>
                  </div>
                  <span className={styles.postCategory}>{post.category?.name ?? "Kategorisiz"}</span>
                  <span className={styles.badge} data-state={state}>
                    {STATE_LABELS[state]}
                    {state === "scheduled" ? ` · ${formatDateTime(post.published_at)}` : ""}
                  </span>
                  <span className={styles.postDate}>
                    Son kayıt: <time dateTime={post.updated_at}>{formatDateTime(post.updated_at)}</time>
                  </span>
                  <PostRowActions post={post} state={state} />
                </li>
              );
            })}
          </ul>
          {posts.length === LIST_LIMIT ? (
            <p className={styles.muted}>
              En son güncellenen {LIST_LIMIT} yazı gösteriliyor. Daha eskileri için aramayı kullan.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
