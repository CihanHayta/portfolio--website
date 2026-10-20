import { Montserrat, Playfair_Display } from "next/font/google";
import { brand } from "@/data/content";
import { SITE_URL } from "@/lib/supabase/env";
import { openGraph, twitter } from "@/lib/seo";
import "./globals.css";

// Marka fontları: başlık ve metin Montserrat, vurgu Playfair Display İtalik.
// latin-ext: Türkçe karakterler (ğ, ş, ı, İ) için gerekli.
const montserrat = Montserrat({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600"],
  style: ["italic"],
  display: "swap",
  // Yalnızca tek vurgu kelimesinde kullanılır; önceden yüklenmesi ilk boyamayı
  // geciktiren kaynaklarla yarışır. Yüklenene kadar Georgia italik görünür.
  preload: false,
});

const HOME_TITLE = `${brand.legalName} — Meta Reklam Yönetimi`;
const HOME_DESCRIPTION =
  "Meta reklamları, stratejik kreatifler ve sürekli optimizasyonla reklam bütçenizi ölçülebilir büyümeye yönlendiriyoruz. Ücretsiz reklam analizi alın.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  // Alt sayfalar yalnızca kendi başlığını verir; marka adı otomatik eklenir.
  title: { default: HOME_TITLE, template: `%s — ${brand.legalName}` },
  description: HOME_DESCRIPTION,
  openGraph: openGraph({ title: HOME_TITLE, description: HOME_DESCRIPTION, url: "/" }),
  twitter: twitter({ title: HOME_TITLE, description: HOME_DESCRIPTION }),
  // Search Console HTML etiketi yöntemi: değer yalnızca ortam değişkeni
  // tanımlıysa eklenir (GOOGLE_SITE_VERIFICATION). Sahte değer yok.
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr" className={`${montserrat.variable} ${playfair.variable}`}>
      <body>{children}</body>
    </html>
  );
}
