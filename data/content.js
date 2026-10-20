import { Mail } from "lucide-react";
import { InstagramIcon, LinkedinIcon } from "@/components/icons";
import {
  BillingIllustration,
  InboxIllustration,
  KanbanIllustration,
  LandingIllustration,
} from "@/components/illustrations";

// ---------------------------------------------------------------------------
// Sitedeki metinlerin tamamı bu dosyadadır. Metinleri değiştirmek için kod
// bilmeye gerek yok: tırnak içindeki yazıları düzenleyip kaydetmek yeterli.
// ---------------------------------------------------------------------------

export const brand = {
  name: "Persona",
  suffix: "Dijital",
  legalName: "Persona Dijital Pazarlama",
  tagline: "Dijital Pazarlama Ajansı",
};

export const profile = {
  firstName: "Cihan",
  fullName: "Cihan Hayta",
  role: "Kurucu · Persona Dijital Pazarlama",
  email: "cihanhayta8080@gmail.com",
  phone: "+90 539 941 71 05",
  // Sadece rakam, başında ülke kodu, + veya boşluk yok — WhatsApp linki için kullanılır.
  whatsapp: "905399417105",
};

export const socials = [
  { name: "Instagram", href: "https://www.instagram.com/persona_dijital_pazarlama/", Icon: InstagramIcon },
  { name: "LinkedIn", href: "https://www.linkedin.com/in/cihan-hayta-4586671a0/", Icon: LinkedinIcon },
  { name: "E-posta", href: "mailto:cihanhayta8080@gmail.com", Icon: Mail },
];

export const navLinks = [
  { label: "Hizmetler", href: "/#hizmetler" },
  { label: "Nasıl Çalışıyoruz?", href: "/#calisma-yontemimiz" },
  { label: "Neden Persona?", href: "/#neden" },
  { label: "SSS", href: "/#sss" },
  { label: "Blog", href: "/blog" },
  { label: "İletişim", href: "/#iletisim" },
];

// İki ayrı çağrı aynı iletişim formunu açar; form başlığı ve hazırlanan
// WhatsApp mesajı seçilen talebe göre değişir. Gerçek bir randevu takvimi
// olmadığı için "randevu al" yerine "görüşme talep et" denir.
export const ctaLabel = "Ücretsiz Reklam Analizi Al";
export const meetingLabel = "Ücretsiz Görüşme Talep Et";

export const contactIntents = {
  analiz: { title: ctaLabel, request: "ücretsiz reklam analizi talep ediyorum" },
  gorusme: { title: meetingLabel, request: "ücretsiz bir ön görüşme talep ediyorum" },
};

// Kısa marka tanımı (alt bilgide görünür).
export const brandSummary =
  "Meta reklamları, stratejik kreatifler ve veri odaklı optimizasyonla işletmelerin müşteri kazanımını daha ölçülebilir hale getiren dijital pazarlama ajansı.";

// Ana sayfa bölümleri yukarıdan aşağıya bu sırayla görünür. Sayılar, müşteri
// sonuçları ya da yorumlar yalnızca gerçek ve doğrulanabilir olduğunda eklenmeli.
export const home = {
  hero: {
    badge: "Meta Reklam Yönetimi",
    // Başlık iki satırdır; ikinci satırdaki vurgulu kelime altın ve italik görünür.
    titleLine1: "Reklam bütçenizi harcamaya değil,",
    titleAccent: "büyümeye",
    titleLine2End: "yönlendirin.",
    description:
      "Meta reklamları, stratejik kreatifler, hedef kitle analizi ve sürekli optimizasyonla işletmelerin müşteri kazanım süreçlerini daha ölçülebilir hale getirmeye yardımcı oluyoruz.",
    secondaryCta: "Nasıl Çalışıyoruz?",
  },

  // Giriş alanının sağındaki uzmanlık kartı. Fotoğraf eklemek için görseli
  // public/images/ içine koyup yolunu `photo` alanına yaz (örn.
  // "/images/cihan-hayta.jpg"); boşken adın baş harfleri gösterilir.
  expert: {
    photo: null,
    name: "Cihan Hayta",
    role: "Kurucu · Persona Dijital Pazarlama",
    focus: "Meta reklam yönetimi ve performans optimizasyonu",
    message:
      "Reklam hesabına hazır bir şablonla değil; işletmenin hedefine, müşterisine ve verisine göre kurulan bir sistemle yaklaşıyoruz.",
    points: [
      "Veriye dayalı optimizasyon",
      "Kontrollü kreatif testleri",
      "İşletmeye özel reklam stratejisi",
      "Şeffaf performans değerlendirmesi",
    ],
    note: "Formunuz WhatsApp üzerinden bize ulaşır",
  },

  services: {
    id: "hizmetler",
    eyebrow: "Hizmetler",
    title: "Reklam yönetimini bir sisteme dönüştürüyoruz.",
    items: [
      {
        title: "Meta reklam yönetimi",
        text: "Facebook ve Instagram kampanyalarının kurulumu, bütçe dağılımı ve düzenli takibi.",
        icon: "target",
        link: { label: "Süreci inceleyin", href: "#calisma-yontemimiz" },
      },
      {
        title: "Reklam kreatifi ve mesaj stratejisi",
        text: "Reklam mesajına uygun görseller, Reels kurguları ve yapay zekâ destekli showroom görselleri.",
        icon: "sparkles",
        link: { label: "Yaklaşımımızı görün", href: "#neden" },
      },
      {
        title: "Hedef kitle ve dönüşüm optimizasyonu",
        text: "Hangi kitlenin, mesajın ve kreatifin işe yaradığını kampanya verisinden çıkarır, bütçeyi buna göre yönlendiririz.",
        icon: "search",
        link: { label: "Reklamlarınızı test edin", href: "#reklam-kontrolu" },
      },
      {
        title: "Performans analizi ve raporlama",
        text: "Bütçenin nereye gittiğini ve ne getirdiğini sade, anlaşılır raporlarla paylaşırız.",
        icon: "clipboard",
        link: { label: "Raporlama nasıl ilerliyor?", href: "#sss" },
      },
    ],
  },

  problems: {
    id: "reklam-kontrolu",
    eyebrow: "Kendinizi test edin",
    title: "Reklamlarınız çalışıyor mu, yoksa yalnızca bütçe mi harcıyor?",
    description: "İşletmenizin reklam sürecinde hangi alanların incelenmesi gerektiğini birlikte değerlendirelim.",
    items: [
      { text: "Reklam bütçemin gerçek müşteriye nasıl dönüştüğünü bilmiyorum.", area: "ölçümleme" },
      { text: "Tıklama geliyor ama yeterli satış veya nitelikli talep oluşmuyor.", area: "dönüşüm" },
      { text: "Reklam kreatiflerimi hangi verilere göre yenilemem gerektiğinden emin değilim.", area: "kreatif" },
      { text: "Müşteri edinme maliyetim yükseliyor.", area: "maliyet" },
      { text: "Hangi kampanyanın neden başarılı olduğunu anlamakta zorlanıyorum.", area: "kampanya analizi" },
      { text: "Raporları iş kararlarına dönüştürmekte zorlanıyorum.", area: "raporlama" },
    ],
    empty: "Size uyan maddeleri seçin; incelenmesi gereken alanları burada özetleyelim.",
    // Kesin teşhis değil: yalnızca görüşmede öncelikle konuşulabilecek başlıklar.
    result:
      "Bu alanları ücretsiz analiz görüşmesinde öncelikli olarak ele alabiliriz. Kesin değerlendirme, hesabınızı birlikte inceledikten sonra netleşir.",
    // Seçimler hiçbir yere kaydedilmez; yalnızca bu sayfada gösterilir.
  },

  process: {
    id: "calisma-yontemimiz",
    eyebrow: "Nasıl çalışıyoruz?",
    title: "Her işletmeye aynı strateji uygulanmaz.",
    description:
      "Her işletmenin hedefi, müşteri profili, reklam bütçesi, teklif yapısı ve mevcut performansı farklıdır. Bu nedenle reklam çalışmalarını işletmenin ihtiyaçlarına göre planlarız.",
    steps: [
      {
        title: "Analiz ve hedefler",
        text: "Mevcut kampanyaları, iş modelini, hedef kitleyi ve müşteri kazanım sürecini değerlendiririz.",
        icon: "search",
      },
      {
        title: "Strateji ve kreatif",
        text: "Hedeflere uygun reklam mesajlarını, kreatif yaklaşımını ve test planını belirleriz.",
        icon: "pen",
      },
      {
        title: "Test ve optimizasyon",
        text: "Kampanyaları izler, kontrollü testler yapar ve veriye göre iyileştirmeler gerçekleştiririz.",
        icon: "rocket",
      },
      {
        title: "Raporlama ve gelişim",
        text: "Sonuçları açıkça değerlendirir, sonraki adımları ve bütçe kararlarını veriye dayandırırız.",
        icon: "chart",
      },
    ],
  },

  principles: {
    eyebrow: "Çalışma prensipleri",
    title: "Başarılı reklam yönetimi, doğru çalışma sistemine dayanır.",
    items: [
      {
        title: "Şeffaf ve odaklı iş birliği",
        text: "İşletmenin hedefleri, görev kapsamı ve öncelikleri net şekilde belirlenir. İletişim ve raporlama sürecinde belirsizliği azaltırız.",
        icon: "message",
      },
      {
        title: "Veri odaklı harcamalar",
        text: "Bütçe kararlarını yalnızca tıklama sayısına göre değil, kampanya hedefleri, dönüşüm verileri ve iş sonuçlarına göre değerlendiririz.",
        icon: "chart",
      },
      {
        title: "İşletmeye özel sistem",
        text: "Her işletmeye aynı kampanya planını uygulamak yerine ihtiyaçları ve mevcut verileri dikkate alarak çalışma yaklaşımını belirleriz.",
        icon: "focus",
      },
    ],
  },

  difference: {
    id: "neden",
    eyebrow: "Neden Persona?",
    title: "Reklam yönetiminde farkı yaratan şey, yaklaşımdır.",
    commonTitle: "Sık karşılaşılan sorunlar",
    oursTitle: "Persona yaklaşımı",
    // Her satır: [sık karşılaşılan sorun, Persona'nın çalışma yaklaşımı]
    rows: [
      ["Her işletmeye benzer strateji uygulanması", "İşletmeye özel strateji"],
      ["Tıklamaların başarı olarak değerlendirilmesi", "Dönüşüm ve müşteri kazanımına odaklı ölçümleme"],
      ["Yetersiz test ve düzensiz optimizasyon", "Planlı kreatif ve kampanya testleri"],
      ["Raporlama verisinin iş kararlarına dönüşmemesi", "Anlaşılır raporlama ve optimizasyon"],
    ],
  },

  audience: {
    eyebrow: "Uygunluk",
    title: "Bu iş birliği kimler için uygun?",
    fitTitle: "Uygun olabilecek işletmeler",
    fit: [
      "Reklam bütçesini daha bilinçli değerlendirmek isteyenler",
      "Müşteri kazanım sürecini geliştirmek isteyen markalar",
      "Performansını ölçmek ve optimize etmek isteyen ekipler",
      "Test ve sürekli gelişime açık işletmeler",
    ],
    notFitTitle: "Beklentilerin uyuşmayabileceği durumlar",
    notFit: [
      "Hiçbir test yapılmadan garantili sonuç beklentisi",
      "Ölçüm ve optimizasyon sürecine öncelik verilmemesi",
      "Gerçekçi olmayan sonuç veya kesin kazanç garantisi beklentisi",
    ],
  },

  offer: {
    eyebrow: "Ücretsiz analiz",
    title: "Reklam hesabınızdaki gelişim fırsatlarını birlikte değerlendirelim.",
    description:
      "İşletmenizin hedeflerini, mevcut reklam yaklaşımını ve değerlendirilmesi gereken alanları konuşalım. Sonraki adımları birlikte netleştirelim.",
    note: "Formunuz WhatsApp mesajı olarak hazırlanır; size dönüş yapıp görüşme zamanını birlikte belirleriz.",
  },

  faq: {
    id: "sss",
    eyebrow: "SSS",
    title: "Sıkça sorulan sorular.",
    description: "Bütçe, süre ve çalışma şekli hakkında en çok sorulanlar.",
    items: [
      {
        question: "Reklam yönetimi için minimum bütçe ne kadar olmalı?",
        answer:
          "Herkese uyan sabit bir tutar yok. Gerekli bütçe; sektörünüze, hedefinize, rekabete ve test etmek istediğimiz kampanya sayısına göre değişir. Analiz görüşmesinde işletmenize uygun, gerçekçi bir başlangıç aralığını birlikte değerlendiririz. Buradaki tutar Meta'ya ödenen reklam harcamasını ifade eder; hizmet bedelinin kapsamı görüşmede ayrıca netleştirilir.",
      },
      {
        question: "Reklamlardan ne kadar sürede sonuç alabilirim?",
        answer:
          "Kesin bir süre ya da sonuç garantisi vermiyoruz; çünkü sonuç sektöre, teklif yapısına, kreatiflere, bütçeye, ölçüm kalitesine ve satış sürecine bağlıdır. İlk aşamada kampanyalar veri toplar ve Meta'nın öğrenme süreci tamamlanır. Ardından testlerle neyin işe yaradığını ayırır, kalıcı iyileşmeyi düzenli optimizasyonla hedefleriz.",
      },
      {
        question: "Reklam yönetimi süreci nasıl başlıyor?",
        answer:
          "Ücretsiz analiz ya da görüşme talebinizle başlıyoruz. İlk görüşmede hedeflerinizi, mevcut kampanyalarınızı ve ihtiyaçlarınızı konuşup neler yapılabileceğini anlatıyoruz; birlikte çalışıp çalışmamaya ondan sonra karar veriyoruz.",
      },
      {
        question: "Hangi sektörlerle çalışabilirsiniz?",
        answer:
          "Ürününü ya da hizmetini Meta reklamlarıyla anlatabilecek işletmelerle çalışıyoruz: mobilya ve ev dekorasyonu başta olmak üzere perakende, hizmet ve yerel işletmeler. Uygun olup olmadığımızı ilk görüşmede birlikte değerlendiririz.",
      },
      {
        question: "Reklam bütçesini kim belirliyor?",
        answer:
          "Son karar her zaman işletmenindir. Hedeflerinizi, mevcut bütçenizi ve kampanya verilerini değerlendirerek bir öneri sunarız; bütçeyi artırma ya da azaltma gibi kararları da veriye dayanarak birlikte alırız.",
      },
      {
        question: "Reklam performansını nasıl raporluyorsunuz?",
        answer:
          "Hangi kampanyanın ne kadar harcadığını ve ne getirdiğini gösteren, teknik terimlerle boğulmamış sade raporlar paylaşıp birlikte yorumluyoruz. Satış ve müşteri edinme maliyeti gibi metrikler ancak ölçüm altyapısı (Meta Pixel ya da dönüşüm takibi) doğru kurulduğunda güvenilir şekilde raporlanabilir; bu yüzden ölçüm durumunu çalışmanın başında birlikte kontrol ederiz.",
      },
      {
        question: "Reklam kreatiflerini kim hazırlıyor?",
        answer:
          "Reklam görselleri, Reels kurguları ve yapay zekâ destekli showroom görselleri ekibimiz tarafından hazırlanır. Görsellerde ürününüzün gerçek rengi ve kumaşı korunur.",
      },
      {
        question: "Ücretsiz reklam analizi nasıl ilerliyor?",
        answer:
          "Formu doldurduğunuzda bilgileriniz WhatsApp mesajı olarak hazırlanır; mesajı gönderdiğinizde size dönüş yapıp kısa bir görüşme planlıyoruz. Görüşmede mevcut durumu ve öne çıkan fırsatları konuşuyoruz; herhangi bir taahhüt yok.",
      },
      {
        question: "Reklam hesabım zaten varsa mevcut kampanyalarla devam edebilir miyiz?",
        answer:
          "Evet. Mevcut hesabınızdaki geçmiş veriler değerli bir başlangıç noktasıdır. Önce var olan kampanyaları inceler, işe yarayanları koruyup geliştirilmesi gereken alanları belirleriz; her şeyi sıfırdan kurmak zorunlu değildir.",
      },
      {
        question: "Kampanyalar ne sıklıkla optimize ediliyor?",
        answer:
          "Kampanyaları düzenli olarak takip ediyoruz; değişiklikleri ise anlamlı veri biriktikçe ve planlı testlere dayanarak yapıyoruz. Gereksiz sık müdahale kampanyanın öğrenme sürecini bozabileceği için ritmi veriye göre belirliyoruz.",
      },
    ],
  },

  final: {
    id: "iletisim",
    eyebrow: "Başlamaya hazır mısınız?",
    title: "Reklam bütçenizi daha bilinçli yönetmeye hazır mısınız?",
    description: "İşletmenizin hedeflerini değerlendirelim ve size uygun sonraki adımları netleştirelim.",
    blogLink: "Önce yazılarımıza göz atmak isterseniz blogu inceleyin",
  },
};

// Blog sayfasının üst bölümü. `heroImage` için /public altına bir görsel koyup
// yolunu yaz (örn. "/images/blog-hero.jpg"); boşken sade bir panel gösterilir.
// `avatar` yazar kartındaki fotoğraftır; boşken adının baş harfi gösterilir.
export const blog = {
  title: "Dijital pazarlama, içerik ve marka büyütme üzerine yazılar.",
  description:
    "Reklam, içerik ve görsel üretiminde uyguladığımız yöntemleri, öğrendiklerimizi ve işe yarayanları burada paylaşıyoruz.",
  quote: "Doğru mesaj, doğru kitle, ölçülebilir sonuç.",
  heroImage: null,
  heroImageAlt: "",
  avatar: null,
  authorTagline: "Kurucu · Persona Dijital Pazarlama",
  authorBio:
    "Markaların ürünlerini doğru kitleye anlatmalarına yardımcı oluyor; reklam, içerik ve görsel üretimi üzerine yazıyorum.",
};

// Projeler bölümü şu an ana sayfada gösterilmiyor; veriler ve bileşen
// (components/Work.jsx) ileride yeniden kullanmak için korunuyor.
// `video` + `poster` verilirse kartta sessiz ürün videosu önizlemesi oynar
// (video/ klasöründeki Remotion projesiyle üretilir: `cd video && npm run render`).
// Etiketler ilgili projenin package.json'ından doğrulanmıştır.
export const projects = [
  {
    id: 5,
    name: "KPI Control Center",
    year: "2026",
    description:
      "Dijital pazarlama ajansları için operasyon paneli — müşterilerden günlük KPI verisi toplar; haftalık raporları, başa baş ROAS hesabını ve takip notlarını tek yerden yönetir.",
    tags: ["Next.js", "TypeScript", "Supabase", "Recharts"],
    href: "https://kpi-control-center.vercel.app/login",
    video: "/videos/projects/kpi-control-center.mp4",
    poster: "/videos/projects/kpi-control-center-poster.jpg",
    posterAlt: "KPI Control Center operasyon paneli: KPI bekleyen müşteriler, yaklaşan randevular ve takipler",
  },
  {
    id: 6,
    name: "Diyetisyen CRM",
    year: "2026",
    description:
      "Diyetisyenler için danışan yönetim sistemi — danışan kartları, vücut ölçümü ve hedef takibi, öğün öğün beslenme programı, randevular ve haftalık takip tek panelde.",
    tags: ["Next.js", "Express", "Prisma", "PostgreSQL"],
    href: "https://crm-diyetisyen-l1o3.vercel.app/login",
    video: "/videos/projects/diyetisyen-crm.mp4",
    poster: "/videos/projects/diyetisyen-crm-poster.jpg",
    posterAlt: "Diyetisyen CRM ana sayfası: bugünkü randevular, ilgilenilmesi gereken danışanlar ve ölçüm zamanı gelenler",
  },
  {
    id: 7,
    name: "Fizyoterapist CRM",
    year: "2026",
    description:
      "Fizyoterapi klinikleri için CRM — hasta kayıtları, randevu takvimi, seans notları, ağrı (VAS) takibi ve klinik uyarılarla tedavi sürecini uçtan uca yönetir.",
    tags: ["Next.js", "TypeScript", "Prisma", "PostgreSQL"],
    href: "https://fizyoterapist-crm.vercel.app/login",
    video: "/videos/projects/fizyoterapist-crm.mp4",
    poster: "/videos/projects/fizyoterapist-crm-poster.jpg",
    posterAlt: "Fizyoterapist CRM genel bakış: bugünkü randevular, sıradaki hasta ve yarının programı",
  },
  {
    id: 0,
    name: "Şahin Emlak CRM",
    year: "2026",
    description:
      "Emlak ofisleri için uçtan uca CRM — ilan yönetimi, randevu takvimi ve Instagram/WhatsApp mesajlarını tek panelden yöneten satış hattı.",
    tags: ["Next.js", "CRM", "WhatsApp Entegrasyonu"],
    href: "https://sahin-emlak-frontend.vercel.app",
    image: "/images/sahin-emlak-cover.png",
  },
  {
    id: 1,
    name: "TaskFlow",
    year: "2024",
    description:
      "Gerçek zamanlı panolar, otomasyonlar ve ekip analitiğine sahip, işbirliğine dayalı bir proje yönetimi SaaS'ı.",
    tags: ["Next.js", "PostgreSQL", "Stripe"],
    href: "#",
    image: null,
    Illustration: KanbanIllustration,
  },
  {
    id: 2,
    name: "MetricLoop",
    year: "2024",
    description:
      "SaaS kurucuları için kullanım analitiği ve faturalama platformu — MRR, churn ve kohort elde tutma oranını takip eder.",
    tags: ["Node.js", "Redis", "Chart.js"],
    href: "#",
    image: null,
    Illustration: BillingIllustration,
  },
  {
    id: 3,
    name: "InboxPilot",
    year: "2023",
    description:
      "Destek ekipleri için akıllı yönlendirme ve hazır yanıt önerileriyle yapay zekâ destekli ortak gelen kutusu.",
    tags: ["React", "OpenAI API", "WebSockets"],
    href: "#",
    image: null,
    Illustration: InboxIllustration,
  },
  {
    id: 4,
    name: "LaunchDeck",
    year: "2023",
    description:
      "İlk SaaS ürününü yayınlayan bağımsız geliştiriciler için kodsuz açılış sayfası ve bekleme listesi oluşturucu.",
    tags: ["Next.js", "Supabase"],
    href: "#",
    image: null,
    Illustration: LandingIllustration,
  },
];
