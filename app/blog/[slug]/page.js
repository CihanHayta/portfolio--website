import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { profile } from "@/data/content";
import { faqSchemaItems } from "@/lib/blog/blocks/model";
import { SITE_URL } from "@/lib/supabase/env";
import { getPostBySlug, getRedirectSlug, listRelatedPosts } from "@/lib/blog/queries";
import ArticleCta from "@/components/blog/ArticleCta";
import ArticleView from "@/components/blog/ArticleView";
import PostCard from "@/components/blog/PostCard";
import styles from "./page.module.css";

// Yazılar ilk istekte üretilip önbelleğe alınır; yönetim panelindeki her
// yayın işlemi ilgili adresi ayrıca tazeler.
export const revalidate = 300;

export async function generateStaticParams() {
  return [];
}

const loadPost = cache(getPostBySlug);

// JSON-LD içindeki "<" kaçırılır; içerik <script> etiketini kapatamaz.
const jsonLd = (data) => ({ __html: JSON.stringify(data).replace(/</g, "\\u003c") });

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) return { title: `Yazı bulunamadı — ${profile.fullName}`, robots: { index: false } };

  const title = post.seo_title || post.title;
  const description = post.seo_description || post.excerpt;
  const images = post.cover
    ? [{ url: post.cover.url, width: post.cover.width, height: post.cover.height, alt: post.cover_alt }]
    : undefined;

  return {
    title: `${title} — ${profile.fullName}`,
    description,
    alternates: { canonical: post.canonical_url || `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title,
      description,
      url: `/blog/${post.slug}`,
      locale: "tr_TR",
      publishedTime: post.published_at,
      modifiedTime: post.updated_at,
      authors: [post.author_name || profile.fullName],
      section: post.category?.name,
      tags: post.tags?.map((tag) => tag.name),
      images,
    },
    twitter: { card: images ? "summary_large_image" : "summary", title, description },
  };
}

export default async function BlogPostPage({ params }) {
  const { slug } = await params;
  const post = await loadPost(slug);

  if (!post) {
    const currentSlug = await getRedirectSlug(slug);
    if (currentSlug) permanentRedirect(`/blog/${currentSlug}`);
    notFound();
  }

  const related = await listRelatedPosts(post, 3);
  const url = `${SITE_URL}/blog/${post.slug}`;
  const author = post.author_name || profile.fullName;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.seo_description || post.excerpt || undefined,
    image: post.cover ? [post.cover.url] : undefined,
    datePublished: post.published_at,
    dateModified: post.updated_at,
    author: { "@type": "Person", name: author, url: SITE_URL },
    publisher: { "@type": "Person", name: profile.fullName, url: SITE_URL },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    articleSection: post.category?.name,
    keywords: post.tags?.length ? post.tags.map((tag) => tag.name).join(", ") : undefined,
    inLanguage: "tr-TR",
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Ana Sayfa", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };

  // Yalnızca yazarın işaretlediği ve sayfada görünen sorular.
  const faqItems = faqSchemaItems(post.content);
  const faqSchema = faqItems.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqItems.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      }
    : null;

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(articleSchema)} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(breadcrumbSchema)} />
      {faqSchema ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(faqSchema)} />
      ) : null}

      <ArticleView post={post}>
        <ArticleCta />
      </ArticleView>

      {related.length > 0 ? (
        <section className={`container ${styles.related}`} aria-labelledby="ilgili-baslik">
          <h2 id="ilgili-baslik" className={styles.relatedTitle}>
            İlgili yazılar
          </h2>
          <div className={styles.relatedGrid}>
            {related.map((item) => (
              <PostCard key={item.id} post={item} headingLevel={3} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
