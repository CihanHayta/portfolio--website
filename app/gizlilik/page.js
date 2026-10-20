import Link from "next/link";
import Header from "@/components/Header";
import MobileCallBar from "@/components/MobileCallBar";
import SiteFooter from "@/components/SiteFooter";
import { brand, profile } from "@/data/content";
import { openGraph, twitter } from "@/lib/seo";
import styles from "../pages.module.css";

const TITLE = "Gizlilik Politikası";
const DESCRIPTION = `${brand.legalName} web sitesinde hangi kişisel verilerin, hangi amaçla ve hangi hizmetler aracılığıyla işlendiğini açıklar.`;

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/gizlilik" },
  openGraph: openGraph({ title: TITLE, description: DESCRIPTION, url: "/gizlilik" }),
  twitter: twitter({ title: TITLE, description: DESCRIPTION }),
};

// Bu metin, sitenin gerçekte kullandığı hizmetlere göre hazırlanmış bir
// taslaktır; yayımlamadan önce hukuki olarak gözden geçirilmelidir.
export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className={styles.legal}>
        <article className={styles.narrow}>
          <p className="eyebrow">Yasal bilgiler</p>
          <h1 className={styles.title}>{TITLE}</h1>
          <p className={styles.lead}>
            Bu sayfa, {brand.legalName} web sitesini ziyaret ettiğinizde ya da bizimle iletişime geçtiğinizde
            kişisel verilerinizin nasıl işlendiğini açıklar.
          </p>

          <div className={styles.prose}>
            <h2>Veri sorumlusu</h2>
            <p>
              {brand.legalName} adına {profile.fullName}. Bize{" "}
              <a href={`mailto:${profile.email}`}>{profile.email}</a> adresinden ya da{" "}
              <a href={`tel:${profile.phone.replace(/[^+\d]/g, "")}`}>{profile.phone}</a> numarasından ulaşabilirsiniz.
            </p>

            <h2>İletişim formu, WhatsApp ve e-posta</h2>
            <p>
              Analiz ve görüşme formlarına yazdığınız ad, e-posta, markanız ve hedefinizle ilgili bilgiler, zamanlama
              ve aylık bütçe tercihiniz ile ana sayfadaki kontrol listesinde işaretlediğiniz durumlar sitemizin
              sunucularına kaydedilmez. Form, bu bilgileri içeren hazır bir mesajla seçiminize göre WhatsApp’ı ya da
              cihazınızdaki e-posta uygulamasını açar; mesaj ancak siz gönderdiğinizde bize ulaşır. WhatsApp üzerinden
              gönderilen mesajlar WhatsApp’ın (Meta), e-postalar ise kullandığınız e-posta hizmetinin kendi gizlilik
              koşullarına tabidir.
            </p>
            <p>
              Bu bilgileri yalnızca talebinizi değerlendirmek, size dönüş yapmak ve olası iş birliğini görüşmek için
              kullanırız.
            </p>

            <h2>E-posta ve telefon</h2>
            <p>
              Bize e-posta gönderdiğinizde ya da telefonla ulaştığınızda paylaştığınız bilgileri yalnızca
              sorunuzu yanıtlamak ve iletişimi sürdürmek için kullanırız.
            </p>

            <h2>Çerezler ve ölçüm</h2>
            <p>
              Sitede ziyaretçileri izleyen analitik ya da reklam çerezi kullanılmamaktadır. Yalnızca blog yönetim
              paneline giriş yapan yetkili kişiler için, oturumu sürdürmeye yarayan zorunlu bir çerez oluşturulur.
              Yazı tipleri sitenin kendi sunucusundan yüklenir.
            </p>

            <h2>Blog yazılarındaki gömülü içerikler</h2>
            <p>
              Bazı blog yazıları YouTube ya da Vimeo videoları içerebilir. Bu videolar, YouTube için gizliliği
              artırılmış mod (youtube-nocookie.com), Vimeo için “izleme yapma” (dnt) ayarıyla yüklenir. Videoyu
              oynattığınızda ilgili hizmet kendi koşulları çerçevesinde veri işleyebilir.
            </p>

            <h2>Barındırma ve altyapı</h2>
            <ul>
              <li>
                Site Vercel üzerinde barındırılır; sunucular, isteklerin güvenli ve hatasız işlenmesi için teknik
                kayıtlar (IP adresi, tarayıcı bilgisi, istek zamanı gibi) tutabilir.
              </li>
              <li>
                Blog yazıları ve yazılardaki görseller Supabase üzerinde saklanır. Ziyaretçilere ait kişisel veri
                burada tutulmaz.
              </li>
            </ul>

            <h2>Haklarınız</h2>
            <p>
              6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında kişisel verilerinizin işlenip
              işlenmediğini öğrenme, düzeltilmesini ya da silinmesini isteme gibi haklara sahipsiniz. Talepleriniz
              için <a href={`mailto:${profile.email}`}>{profile.email}</a> adresine yazabilirsiniz.
            </p>

            <p className={styles.updated}>
              Son güncelleme: 17 Ekim 2026 · <Link href="/">Ana sayfaya dön</Link>
            </p>
          </div>
        </article>
      </main>
      <SiteFooter />
      <MobileCallBar />
    </>
  );
}
