import { Montserrat, Playfair_Display } from "next/font/google";
import { brand } from "@/data/content";
import { SITE_URL } from "@/lib/supabase/env";
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
});

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${brand.legalName} — Reklam, İçerik ve Görsel`,
  description:
    "Meta reklamları, Reels içerikleri ve yapay zekâ destekli showroom görselleriyle markanızı doğru müşteriye ulaştıran dijital pazarlama ajansı.",
  openGraph: {
    type: "website",
    siteName: brand.legalName,
    locale: "tr_TR",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr" className={`${montserrat.variable} ${playfair.variable}`}>
      <body>{children}</body>
    </html>
  );
}
