import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Header from "@/components/Header";
import MobileCallBar from "@/components/MobileCallBar";
import SiteFooter from "@/components/SiteFooter";
import ContactButton from "@/components/home/ContactButton";
import styles from "./pages.module.css";

// Next.js bu sayfayı HTTP 404 ile ve "noindex" etiketiyle sunar.
export const metadata = { title: "Sayfa bulunamadı" };

export default function NotFound() {
  return (
    <>
      <Header />
      <main className={`${styles.notFound} onDark`}>
        <div className={styles.narrow}>
          <p className="eyebrow">Hata 404</p>
          <h1 className={styles.title}>Aradığınız sayfa bulunamadı.</h1>
          <p className={styles.lead}>
            Bağlantı değişmiş ya da sayfa kaldırılmış olabilir. Aşağıdaki sayfalardan devam edebilir ya da
            doğrudan bizimle iletişime geçebilirsiniz.
          </p>
          <div className={styles.actions}>
            <Link href="/" className="btn btnGold">
              Ana sayfaya dön
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <ContactButton className="btn btnOutlineLight" />
          </div>
          <ul className={styles.links} aria-label="Öne çıkan sayfalar">
            <li>
              <Link href="/#calisma-yontemimiz">Nasıl çalışıyoruz?</Link>
            </li>
            <li>
              <Link href="/#sss">Sıkça sorulan sorular</Link>
            </li>
            <li>
              <Link href="/blog">Blog yazıları</Link>
            </li>
          </ul>
        </div>
      </main>
      <SiteFooter />
      <MobileCallBar />
    </>
  );
}
