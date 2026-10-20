import Header from "@/components/Header";
import MobileCallBar from "@/components/MobileCallBar";
import SiteFooter from "@/components/SiteFooter";
import {
  Audience,
  Difference,
  Faq,
  FinalCta,
  Hero,
  Offer,
  Principles,
  Problems,
  Process,
  Services,
} from "@/components/home/HomeSections";
import RevealObserver from "@/components/home/RevealObserver";
import { jsonLdHtml, organizationJsonLd, websiteJsonLd } from "@/lib/seo";

// Başlık, açıklama ve paylaşım bilgisi kök düzendeki varsayılandan gelir;
// canonical yalnızca ana sayfaya özgüdür (kökte tanımlansa alt sayfalara sızardı).
export const metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdHtml(organizationJsonLd())} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdHtml(websiteJsonLd())} />
      <Header />
      <main>
        <Hero />
        <Services />
        <Problems />
        <Process />
        <Principles />
        <Difference />
        <Audience />
        <Offer />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
      <MobileCallBar />
      <RevealObserver />
    </>
  );
}
