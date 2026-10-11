import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, ImageIcon } from "lucide-react";
import { formatDate } from "@/lib/blog/format";
import styles from "./PostCard.module.css";

export default function PostCard({ post, priority = false, headingLevel = 2 }) {
  const Heading = `h${headingLevel}`;

  return (
    <article className={styles.card}>
      <div className={styles.media}>
        {post.cover ? (
          <Image
            src={post.cover.url}
            alt={post.cover_alt}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 300px"
            priority={priority}
            className={styles.image}
          />
        ) : (
          <span className={styles.placeholder} aria-hidden="true">
            <ImageIcon size={28} strokeWidth={1.5} />
          </span>
        )}
        {post.category ? <span className={styles.badge}>{post.category.name}</span> : null}
      </div>

      <div className={styles.body}>
        <Heading className={styles.title}>
          <Link href={`/blog/${post.slug}`} className={styles.link}>
            {post.title}
          </Link>
        </Heading>
        {post.excerpt ? <p className={styles.excerpt}>{post.excerpt}</p> : null}

        <div className={styles.meta}>
          <CalendarDays size={14} aria-hidden="true" />
          <time dateTime={post.published_at}>{formatDate(post.published_at)}</time>
          <span aria-hidden="true">•</span>
          <span>{post.reading_minutes} dk okuma</span>
          <span className={styles.arrow} aria-hidden="true">
            <ArrowRight size={15} />
          </span>
        </div>
      </div>
    </article>
  );
}
