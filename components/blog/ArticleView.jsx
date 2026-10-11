import Image from "next/image";
import Link from "next/link";
import { CalendarDays, ChevronRight, Clock, ListTree, UserRound } from "lucide-react";
import { profile } from "@/data/content";
import { collectHeadings } from "@/lib/blog/content";
import { formatDate } from "@/lib/blog/format";
import PostContent from "./PostContent";
import styles from "./ArticleView.module.css";

// Yazının ziyaretçiye görünen hali. Hem /blog/[slug] sayfası hem de yönetim
// panelindeki önizleme aynı bileşeni kullanır.
export default function ArticleView({ post, children }) {
  const headings = collectHeadings(post.content);
  const showToc = headings.length >= 2;
  const publishedDay = post.published_at?.slice(0, 10);
  const wasUpdated = post.updated_at && publishedDay && post.updated_at.slice(0, 10) > publishedDay;

  const toc = (
    <ol className={styles.tocList}>
      {headings.map((heading) => (
        <li key={heading.id} data-level={heading.level}>
          <a href={`#${heading.id}`}>{heading.label}</a>
        </li>
      ))}
    </ol>
  );

  return (
    <article className={`container ${styles.article}`}>
      <nav className={styles.breadcrumb} aria-label="Sayfa yolu">
        <ol>
          <li>
            <Link href="/">Ana Sayfa</Link>
            <ChevronRight size={14} aria-hidden="true" />
          </li>
          <li>
            <Link href="/blog">Blog</Link>
            <ChevronRight size={14} aria-hidden="true" />
          </li>
          <li aria-current="page">{post.title}</li>
        </ol>
      </nav>

      <header className={styles.header}>
        {post.category ? (
          <Link href={`/blog?kategori=${post.category.slug}`} className={styles.category}>
            {post.category.name}
          </Link>
        ) : null}
        <h1 className={styles.title}>{post.title}</h1>
        {post.excerpt ? <p className={styles.excerpt}>{post.excerpt}</p> : null}

        <ul className={styles.meta}>
          <li>
            <UserRound size={15} aria-hidden="true" />
            {post.author_name || profile.fullName}
          </li>
          {post.published_at ? (
            <li>
              <CalendarDays size={15} aria-hidden="true" />
              <time dateTime={post.published_at}>{formatDate(post.published_at)}</time>
            </li>
          ) : null}
          <li>
            <Clock size={15} aria-hidden="true" />
            {post.reading_minutes} dk okuma
          </li>
          {wasUpdated ? (
            <li>
              Güncellendi: <time dateTime={post.updated_at}>{formatDate(post.updated_at)}</time>
            </li>
          ) : null}
        </ul>
      </header>

      {post.cover ? (
        <div className={styles.cover}>
          <Image
            src={post.cover.url}
            alt={post.cover_alt}
            width={post.cover.width}
            height={post.cover.height}
            priority
            sizes="(max-width: 1100px) 100vw, 1068px"
          />
        </div>
      ) : null}

      <div className={styles.layout} data-toc={showToc}>
        <div className={styles.content}>
          {showToc ? (
            <details className={styles.tocMobile}>
              <summary>
                <ListTree size={16} aria-hidden="true" />
                İçindekiler
              </summary>
              {toc}
            </details>
          ) : null}

          <PostContent doc={post.content} />

          {post.tags?.length ? (
            <ul className={styles.tags} aria-label="Etiketler">
              {post.tags.map((tag) => (
                <li key={tag.name}>#{tag.name}</li>
              ))}
            </ul>
          ) : null}

          {children}
        </div>

        {showToc ? (
          <nav className={styles.toc} aria-label="İçindekiler">
            <p className={styles.tocTitle}>İçindekiler</p>
            {toc}
          </nav>
        ) : null}
      </div>
    </article>
  );
}
