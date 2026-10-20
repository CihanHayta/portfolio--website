import { brand, profile, socials } from "@/data/content";
import { SITE_URL } from "@/lib/supabase/env";

// Varsayılan paylaşım görseli (public/og/persona-og.png, 1200×630).
// Kendi görseli olmayan sayfalar ve kapak görseli olmayan blog yazıları bunu kullanır.
export const DEFAULT_OG_IMAGE = {
  url: "/og/persona-og.png",
  width: 1200,
  height: 630,
  alt: `${brand.legalName}: Reklam bütçenizi harcamaya değil, büyümeye yönlendirin.`,
};

// Bir sayfanın Open Graph bilgisi kökteki değerlerin yerine geçer (birleşmez);
// bu yardımcı ortak alanları her sayfaya eksiksiz taşır.
export function openGraph({ title, description, url, type = "website", images = [DEFAULT_OG_IMAGE], ...rest }) {
  return {
    type,
    siteName: brand.legalName,
    locale: "tr_TR",
    title,
    description,
    url,
    images,
    ...rest,
  };
}

export function twitter({ title, description, images = [DEFAULT_OG_IMAGE.url] }) {
  return { card: "summary_large_image", title, description, images };
}

// JSON-LD içindeki "<" kaçırılır; içerik <script> etiketini kapatamaz.
export const jsonLdHtml = (data) => ({ __html: JSON.stringify(data).replace(/</g, "\\u003c") });

export const ORGANIZATION_ID = `${SITE_URL}/#organization`;

// Yalnızca sitede görünen, doğrulanabilir bilgiler: ad, adres (URL), logo,
// e-posta, telefon ve sosyal hesaplar. Fiziksel adres bilinmediği için yok.
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: brand.legalName,
    url: SITE_URL,
    logo: `${SITE_URL}/brand/persona-mark.png`,
    email: profile.email,
    telephone: profile.phone.replace(/\s+/g, ""),
    // LinkedIn kurucunun kişisel profilidir; kuruluşa değil kişiye bağlanır.
    founder: {
      "@type": "Person",
      name: profile.fullName,
      sameAs: socials.filter((item) => item.name === "LinkedIn").map((item) => item.href),
    },
    sameAs: socials.filter((item) => item.name === "Instagram").map((item) => item.href),
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: brand.legalName,
    url: SITE_URL,
    inLanguage: "tr-TR",
    publisher: { "@id": ORGANIZATION_ID },
  };
}
