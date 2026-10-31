import Image from "next/image";
import Link from "next/link";
import { CalendarDays, ChevronRight, Clock, UserRound } from "lucide-react";
import { profile } from "@/data/content";
import { contentHeadings, isBlocksContent } from "@/lib/blog/blocks/model";
import { readMeta } from "@/lib/blog/meta";
import { formatDate } from "@/lib/blog/format";
import ArticleSources from "./ArticleSources";
import ArticleToc from "./ArticleToc";
import AuthorBox from "./AuthorBox";
import endStyles from "./ArticleEnd.module.css";
import Blocks from "./Blocks";
import PostContent from "./PostContent";
import styles from "./ArticleView.module.css";

// Yazının ziyaretçiye görünen hali. Hem /blog/[slug] sayfası hem de yönetim
// panelindeki önizleme aynı bileşeni kullanır.
export default function ArticleView({ post, children }) {
  const headings = contentHeadings(post.content);
  const meta = readMeta(post.content);
  const theme = meta.theme === "dark" ? "dark" : "light";
  const showToc = headings.length >= 2;
  const publishedDay = post.published_at?.slice(0, 10);
  const wasUpdated = post.updated_at && publishedDay && post.updated_at.slice(0, 10) > publishedDay;


  return (
    <article className={`container ${styles.article}`} data-tone={theme}>
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
        <div className={styles.content} data-reading-body>
          {showToc ? (
            <div className={styles.tocMobile}>
              <ArticleToc headings={headings} variant="mobile" />
            </div>
          ) : null}

          {/* data-article-body: okuma çubuğu yalnızca esas makale içeriğine göre ölçer. */}
          <div data-article-body="">
            {isBlocksContent(post.content) ? (
              <Blocks blocks={post.content.blocks} headings={headings} citations={meta.sources?.length ?? 0} />
            ) : (
              <PostContent doc={post.content} />
            )}
          </div>

          <ArticleSources sources={meta.sources ?? []} waived={meta.sourcesWaived === true} />

          {post.category || post.tags?.length ? (
            // Kategori gerçek liste sayfasına bağlanır; etiketlerin ayrı sayfası yok, bağlantısız gösterilir.
            <div className={endStyles.topics} aria-label="Konular">
              <span className={endStyles.topicsLabel}>Konular:</span>
              {post.category ? (
                <Link href={`/blog?kategori=${post.category.slug}`} className={endStyles.topicCategory}>
                  {post.category.name}
                </Link>
              ) : null}
              {(post.tags ?? []).map((tag) => (
                <span key={tag.name} className={endStyles.topicTag}>#{tag.name}</span>
              ))}
            </div>
          ) : null}

          <AuthorBox name={post.author_name} />

          {children}
        </div>

        {showToc ? (
          <div className={styles.toc}>
            <ArticleToc headings={headings} variant="desktop" />
          </div>
        ) : null}
      </div>
    </article>
  );
}
