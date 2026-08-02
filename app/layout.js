import { Playfair_Display, Manrope } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata = {
  title: "Cihan Hayta — Full-Stack Geliştirici",
  description:
    "Uçtan uca SaaS ürünleri tasarlayıp geliştiren full-stack yazılım geliştirici. Seçili projelerimi, hizmetlerimi keşfedin ve benimle iletişime geçin.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr" className={`${playfair.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  );
}
