import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { home, profile } from "@/data/content";
import { relatedServices } from "@/lib/blog/relatedServices";
import { contentText, faqSchemaItems } from "@/lib/blog/blocks/model";
import { readMeta } from "@/lib/blog/meta";
import { DEFAULT_OG_IMAGE, ORGANIZATION_ID, openGraph, organizationJsonLd, twitter } from "@/lib/seo";
import { PRODUCTION_SITE_URL, SITE_URL } from "@/lib/supabase/env";
import { postCanonical } from "@/lib/blog/canonical";
import { getPostBySlug, getRedirectSlug, listRelatedPosts } from "@/lib/blog/queries";
import ArticleClosing from "@/components/blog/ArticleClosing";
import BlogContactCard from "@/components/blog/BlogContactCard";
import ArticleView from "@/components/blog/ArticleView";
import ReadingProgress from "@/components/blog/ReadingProgress";
import PostCard from "@/components/blog/PostCard";
import styles from "./page.module.css";

// Yazılar ilk istekte üretilip önbelleğe alınır; yönetim panelindeki her
// yayın işlemi ilgili adresi ayrıca tazeler.
export const revalidate = 300;

export async function generateStaticParams() {
  return [];
}

const loadPost = cache(getPostBySlug);

const canonicalOf = (post) =>
  postCanonical({ slug: post.slug, canonicalUrl: post.canonical_url }, { siteUrl: SITE_URL, ownHosts: [new URL(PRODUCTION_SITE_URL).host] });

// Açıklama: önce yazarın SEO açıklaması, sonra özet; ikisi de boşsa yazının
// ilk cümlelerinden en fazla 155 karakter (kelime ortasında kesilmez).
function postDescription(post) {
  const manual = (post.seo_description || post.excerpt || "").trim();
  if (manual) return manual;
  const text = contentText(post.content).replace(/\s+/g, " ").trim();
  if (text.length <= 155) return text || undefined;
  return `${text.slice(0, 155).replace(/\s+\S*$/, "")}…`;
}

// JSON-LD içindeki "<" kaçırılır; içerik <script> etiketini kapatamaz.
const jsonLd = (data) => ({ __html: JSON.stringify(data).replace(/</g, "\\u003c") });

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) return { title: "Yazı bulunamadı", robots: { index: false } };

  const title = post.seo_title || post.title;
  const description = postDescription(post);
  // Kapak görseli yoksa markanın varsayılan paylaşım görseli kullanılır.
  const images = post.cover
    ? [{ url: post.cover.url, width: post.cover.width, height: post.cover.height, alt: post.cover_alt || post.title }]
    : [DEFAULT_OG_IMAGE];

  // Dış kanonik adres varsa paylaşım adresi de odur; canonical ile og:url çelişmez.
  const canonical = canonicalOf(post);
  const canonicalHref = canonical.external ? canonical.url : canonical.path;

  return {
    title,
    description,
    alternates: { canonical: canonicalHref },
    openGraph: openGraph({
      type: "article",
      title,
      description,
      url: canonicalHref,
      images,
      publishedTime: post.published_at,
      modifiedTime: post.updated_at,
      authors: [post.author_name || profile.fullName],
      section: post.category?.name,
      tags: post.tags?.map((tag) => tag.name),
    }),
    twitter: twitter({ title, description, images: images.map((image) => image.url) }),
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
    description: postDescription(post),
    image: post.cover ? [post.cover.url] : [new URL(DEFAULT_OG_IMAGE.url, SITE_URL).href],
    datePublished: post.published_at,
    dateModified: post.updated_at,
    author: { "@type": "Person", name: author, url: SITE_URL },
    publisher: { "@id": ORGANIZATION_ID },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonicalOf(post).url },
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

  // Yazının teması (content.meta.theme) sayfanın tamamına uygulanır.
  const tone = readMeta(post.content).theme === "dark" ? "dark" : "light";

  return (
    <main data-page-tone={tone}>
      <ReadingProgress />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(articleSchema)} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(breadcrumbSchema)} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(organizationJsonLd())} />
      {faqSchema ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(faqSchema)} />
      ) : null}

      <ArticleView post={post}>
        <ArticleClosing
          services={relatedServices(home.services.items, {
            title: post.title,
            category: post.category?.name ?? "",
            tags: (post.tags ?? []).map((tag) => tag.name),
            text: contentText(post.content),
          })}
        />
      </ArticleView>

      {related.length > 0 ? (
        <section className={`container ${styles.related}`} aria-labelledby="ilgili-baslik">
          <h2 id="ilgili-baslik" className={styles.relatedTitle}>
            {post.category?.name ? `${post.category.name} Üzerine Diğer Yazılar` : "Dijital Pazarlama Üzerine Diğer Yazılar"}
          </h2>
          <div className={styles.relatedGrid}>
            {related.map((item) => (
              <PostCard key={item.id} post={item} headingLevel={3} />
            ))}
          </div>
        </section>
      ) : null}

      <BlogContactCard mode="article" />
    </main>
  );
}
