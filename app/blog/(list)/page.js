import { Suspense, cache } from "react";
import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Heart,
  LayoutGrid,
  Megaphone,
  MonitorSmartphone,
  PackageOpen,
  Rocket,
  SearchX,
  Send,
  Tag,
} from "lucide-react";
import { blog, profile } from "@/data/content";
import { formatDate } from "@/lib/blog/format";
import { openGraph, twitter } from "@/lib/seo";
import { isPageInRange, readPageParam } from "@/lib/blog/pagination";
import {
  POSTS_PER_PAGE,
  countPosts,
  listCategories,
  listFeaturedPosts,
  listPosts,
} from "@/lib/blog/queries";
import BlogContactCard from "@/components/blog/BlogContactCard";
import BlogSearch from "@/components/blog/BlogSearch";
import PostCard from "@/components/blog/PostCard";
import ListReveal from "@/components/blog/ListReveal";
import SloganRotator from "@/components/blog/SloganRotator";
import styles from "../blog.module.css";

const CATEGORY_ICONS = {
  teknoloji: MonitorSmartphone,
  "dijital-pazarlama": Megaphone,
  "urun-gelistirme": PackageOpen,
  girisimcilik: Rocket,
  yasam: Heart,
};

const first = (value) => (Array.isArray(value) ? value[0] : value) ?? "";

function blogHref({ q, kategori, page }) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (kategori) params.set("kategori", kategori);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/blog?${query}` : "/blog";
}

const loadCategories = cache(listCategories);

async function readFilters(searchParams) {
  const params = await searchParams;
  const q = first(params.q).trim().slice(0, 80);
  const kategori = first(params.kategori).trim().slice(0, 80);
  const { page, status } = readPageParam(first(params.page));
  return { q, kategori, page: page ?? 1, pageStatus: status };
}

export async function generateMetadata({ searchParams }) {
  const { q, kategori, page } = await readFilters(searchParams);
  // Kategori sayfaları kendi canonical'ına sahip olduğu için başlık ve
  // açıklaması da kendine özgüdür.
  const category = kategori ? (await loadCategories()).find((item) => item.slug === kategori) : null;
  const base = category ? `Blog: ${category.name}` : "Blog";
  const description = category
    ? `${category.name} kategorisindeki yazılar: ${category.description || blog.description}`
    : blog.description;
  return {
    title: page > 1 ? `${base} — Sayfa ${page}` : base,
    description,
    alternates: {
      // Tanınmayan kategori parametresi canonical'a taşınmaz.
      canonical: blogHref({ kategori: category?.slug, page }),
      types: { "application/rss+xml": "/blog/rss.xml" },
    },
    // Arama sonuç sayfaları ve yazısı olmayan kategoriler dizine eklenmez
    // (site haritası da yalnızca yazısı olan kategorileri listeler).
    robots: q || category?.postCount === 0 ? { index: false, follow: true } : undefined,
    openGraph: openGraph({ title: base, description, url: blogHref({ kategori: category?.slug, page }) }),
    twitter: twitter({ title: base, description }),
  };
}

export default async function BlogPage({ searchParams }) {
  const { q, kategori, page, pageStatus } = await readFilters(searchParams);

  // Sayfa parametresi akış başlamadan çözülür: geçersiz değer (abc, 0, -3,
  // 2abc, üst sınır aşımı) 404 olur; "1" ve "02" gibi yazımlar aynı içeriğin
  // kanonik adresine kalıcı olarak yönlendirilir. Hiçbir içerik iki adreste 200 dönmez.
  if (pageStatus === "invalid") notFound();
  if (pageStatus === "redirect") permanentRedirect(blogHref({ q, kategori, page }));

  // Geçersiz sayfa numarası, akış başlamadan reddedilir; yalnızca bu sayede
  // yanıt gerçek bir HTTP 404 olur (akış başladıktan sonra durum kodu 200'de
  // kalır). 1. sayfa her zaman geçerli olduğu için bekletilmez.
  if (page > 1) {
    const category = kategori ? (await loadCategories()).find((item) => item.slug === kategori) : null;
    const total = await countPosts({ query: q, categoryId: category?.id ?? null });
    if (!isPageInRange(page, total)) notFound();
  }

  // Başlık ve arama alanı veri beklemeden hemen çizilir (sayfanın en büyük
  // öğesi bu başlıktır); yazılar ve kenar çubuğu veritabanından akarak gelir.
  return (
    // data-blog-list: liste sayfası ziyaretçinin cihaz temasını (açık/koyu) izler.
    <main className={`container ${styles.page}`} data-blog-list="">
      <section className={styles.hero} aria-labelledby="blog-baslik">
          <div className={styles.heroText}>
            <p className={styles.eyebrow}>Blog</p>
            <h1 id="blog-baslik" className={styles.heading}>
              {blog.title}
            </h1>
            <p className={styles.lead}>{blog.description}</p>
            <BlogSearch defaultValue={q} category={kategori} />
          </div>

          {/* Görsel yokken panel yalnızca alıntıyı taşır; dar ekranda gizlenir. */}
          <div className={`${styles.heroMedia} ${blog.heroImage ? "" : styles.heroMediaEmpty}`}>
            {blog.heroImage ? (
              <Image
                src={blog.heroImage}
                alt={blog.heroImageAlt}
                fill
                priority
                sizes="(max-width: 900px) 100vw, 330px"
                className={styles.heroImage}
              />
            ) : null}
            <figure className={styles.quote}>
              <span className={styles.quoteIcon} aria-hidden="true">
                <Send size={16} />
              </span>
              <blockquote>
                <SloganRotator quotes={blog.quotes?.length ? blog.quotes : [blog.quote]} />
              </blockquote>
              <figcaption>— {profile.fullName}</figcaption>
            </figure>
          </div>
      </section>

      <Suspense fallback={<BlogResultsSkeleton />}>
        <BlogResults q={q} kategori={kategori} page={page} />
      </Suspense>
      <BlogContactCard mode="list" />
    </main>
  );
}

function BlogResultsSkeleton() {
  return (
    <>
      <div className={styles.results} aria-busy="true" aria-label="Yazılar yükleniyor">
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
    </>
  );
}

async function BlogResults({ q, kategori, page }) {
  const categories = await loadCategories();
  const activeCategory = categories.find((category) => category.slug === kategori) ?? null;

  const [{ posts, total }, featured, { total: totalAll }] = await Promise.all([
    listPosts({ query: q, categoryId: activeCategory?.id ?? null, page }),
    listFeaturedPosts(3),
    q || activeCategory ? listPosts({ page: 1 }) : Promise.resolve({ total: null }),
  ]);

  // Aralık denetimiyle bu sorgu arasında yazı silinmiş olabilir: yine de
  // boş sayfa gösterilmez (bu durumda yanıt noindex'li "bulunamadı" olur).
  if (page > 1 && posts.length === 0) notFound();

  const allCount = totalAll ?? total;
  const pageCount = Math.max(1, Math.ceil(total / POSTS_PER_PAGE));
  const isFiltered = Boolean(q || activeCategory);
  const activeSlug = activeCategory?.slug ?? "";

  return (
    <>
      <div className={styles.results}>
        <nav className={styles.chips} aria-label="Kategoriye göre süz">
          <Link
            href={blogHref({ q })}
            className={styles.chip}
            aria-current={activeCategory ? undefined : "true"}
          >
            Tümü
          </Link>
          {categories.map((category) => (
            <Link
              key={category.id}
              href={blogHref({ q, kategori: category.slug })}
              className={styles.chip}
              aria-current={category.slug === activeSlug ? "true" : undefined}
            >
              {category.name}
            </Link>
          ))}
        </nav>

        <section aria-label="Yazılar">
          {isFiltered ? (
            <p className={styles.resultLine} role="status">
              {q ? (
                <>
                  <strong>“{q}”</strong> için{" "}
                </>
              ) : null}
              {activeCategory ? <>{activeCategory.name} kategorisinde </> : null}
              {total} yazı bulundu.{" "}
              <Link href="/blog" className={styles.clearLink}>
                Filtreleri temizle
              </Link>
            </p>
          ) : null}

          {posts.length > 0 ? (
            <div className={styles.grid}>
              <ListReveal />
              {posts.map((post, index) => (
                <PostCard key={post.id} post={post} priority={index < 3} reveal />
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <SearchX size={30} strokeWidth={1.5} aria-hidden="true" />
              <h2>{isFiltered ? "Eşleşen yazı bulunamadı" : "Henüz yayımlanmış yazı yok"}</h2>
              <p>
                {isFiltered
                  ? "Farklı bir kelime dene ya da kategori filtresini kaldır."
                  : "İlk yazılar çok yakında burada olacak."}
              </p>
              {isFiltered ? (
                <Link href="/blog" className={styles.emptyAction}>
                  Tüm yazıları göster
                </Link>
              ) : null}
            </div>
          )}

          {pageCount > 1 ? (
            <nav className={styles.pagination} aria-label="Sayfalama">
              {page > 1 ? (
                <Link
                  href={blogHref({ q, kategori: activeSlug, page: page - 1 })}
                  className={styles.pageLink}
                  rel="prev"
                >
                  <ArrowLeft size={15} aria-hidden="true" />
                  Önceki
                </Link>
              ) : null}
              <span className={styles.pageStatus}>
                Sayfa {page} / {pageCount}
              </span>
              {page < pageCount ? (
                <Link
                  href={blogHref({ q, kategori: activeSlug, page: page + 1 })}
                  className={styles.pageLink}
                  rel="next"
                >
                  Sonraki
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>
      </div>

      <aside className={styles.sidebar} aria-label="Blog kenar çubuğu">
        <section className={styles.panel} aria-labelledby="kategoriler-baslik">
          <h2 id="kategoriler-baslik" className={styles.panelTitle}>
            Kategoriler
          </h2>
          <ul className={styles.categoryList}>
            <li>
              <Link
                href="/blog"
                className={styles.categoryLink}
                aria-current={activeCategory ? undefined : "true"}
              >
                <LayoutGrid size={16} aria-hidden="true" />
                <span>Tümü</span>
                <span className={styles.count}>{allCount}</span>
              </Link>
            </li>
            {categories.map((category) => {
              const Icon = CATEGORY_ICONS[category.slug] ?? Tag;
              return (
                <li key={category.id}>
                  <Link
                    href={blogHref({ kategori: category.slug })}
                    className={styles.categoryLink}
                    aria-current={category.slug === activeSlug ? "true" : undefined}
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span>{category.name}</span>
                    <span className={styles.count}>{category.postCount}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {featured.length > 0 ? (
          <section className={styles.panel} aria-labelledby="one-cikan-baslik">
            <h2 id="one-cikan-baslik" className={styles.panelTitle}>
              Öne Çıkan Yazılar
            </h2>
            <ul className={styles.featuredList}>
              {featured.map((post) => (
                <li key={post.id} className={styles.featuredItem}>
                  <span className={styles.featuredThumb}>
                    {post.cover ? (
                      <Image src={post.cover.url} alt="" fill sizes="80px" />
                    ) : null}
                  </span>
                  <span className={styles.featuredText}>
                    <Link href={`/blog/${post.slug}`} className={styles.featuredLink}>
                      {post.title}
                    </Link>
                    <span className={styles.featuredMeta}>
                      {formatDate(post.published_at)} · {post.reading_minutes} dk okuma
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className={`${styles.panel} ${styles.author}`} aria-label="Yazar">
          <span className={styles.avatar}>
            {blog.avatar ? (
              <Image src={blog.avatar} alt="" fill sizes="60px" />
            ) : (
              <span aria-hidden="true">{profile.firstName[0]}</span>
            )}
          </span>
          <div>
            <h2 className={styles.authorName}>{profile.fullName}</h2>
            <p className={styles.authorTagline}>{blog.authorTagline}</p>
          </div>
          <p className={styles.authorBio}>{blog.authorBio}</p>
          <Link href="/" className={styles.authorLink}>
            Hakkımda daha fazla
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </section>
      </aside>
    </>
  );
}
