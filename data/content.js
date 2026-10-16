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
  { label: "Yöntem", href: "/#yontem" },
  { label: "Neden Persona", href: "/#neden" },
  { label: "SSS", href: "/#sss" },
  { label: "Blog", href: "/blog" },
];

export const ctaLabel = "Ücretsiz Analiz Al";

// Ana sayfa bölümleri yukarıdan aşağıya bu sırayla görünür.
export const home = {
  hero: {
    badge: "Dijital Pazarlama Ajansı",
    // Başlık üç parçadır; ortadaki parça altın renkte ve italik görünür.
    titleStart: "Reklam, içerik ve görselle markanızı",
    titleAccent: "doğru müşteriye",
    titleEnd: "ulaştırıyoruz.",
    description:
      "Meta reklamları, Reels içerikleri ve yapay zekâ destekli showroom görselleriyle ürününüzü doğru kitleye, doğru mesajla ve ölçülebilir biçimde anlatıyoruz.",
    secondaryCta: "Nasıl çalışıyoruz?",
    // Fotoğrafınızı public/images içine koyup yolunu yazın (örn. "/images/cihan.jpg").
    // Boşken yuvarlak alanda Persona monogramı görünür.
    portrait: null,
    portraitAlt: "Cihan Hayta",
    highlights: [
      { value: "Meta", label: "Reklam yönetimi" },
      { value: "Reels", label: "İçerik üretimi" },
      { value: "AI", label: "Showroom görselleri" },
    ],
  },

  problems: {
    eyebrow: "Tanıdık geliyor mu?",
    title: "Bunlardan birkaçı size de oluyorsa, konuşmamız gerek.",
    hint: "Size uyanları işaretleyin",
    items: [
      "Reklama para harcıyorum ama hangi kampanyanın satış getirdiğini bilmiyorum.",
      "Instagram hesabım düzenli içerik paylaşamadığım için durgun.",
      "Ürün fotoğraflarım ürünün gerçek kalitesini yansıtmıyor.",
      "Gelen mesajlar fiyat sorup kayboluyor.",
      "Her ay farklı bir şey deniyorum ama oturan bir sistem yok.",
      "Rapor alıyorum ama rakamların ne anlama geldiğini bilmiyorum.",
    ],
    readyText: "İkiden fazlasını işaretlediyseniz ücretsiz analizle başlayalım.",
  },

  method: {
    id: "yontem",
    eyebrow: "Çalışma yöntemimiz",
    title: "Her markaya aynı reçete uygulanmaz.",
    description: "Ürününüze, kitlenize ve bütçenize göre kurulan dört adımlı bir sistemle çalışıyoruz.",
    steps: [
      {
        title: "Marka ve kitle analizi",
        text: "Mevcut reklamlarınızı, içeriklerinizi, kitlenizi ve rakiplerinizi inceliyoruz.",
        short: "Analiz & Kitle",
        icon: "search",
      },
      {
        title: "Strateji ve kreatif plan",
        text: "Hedef kitle, teklif ve mesajı belirleyip Reels, kapak ve görsel planını çıkarıyoruz.",
        short: "Strateji & Kreatif",
        icon: "pen",
      },
      {
        title: "Yayın, test ve optimizasyon",
        text: "Kampanyaları yayına alıyor, farklı kreatifleri test ediyor ve veriye göre düzenliyoruz.",
        short: "Yayın & Test",
        icon: "rocket",
      },
      {
        title: "Raporlama ve ölçekleme",
        text: "Bütçenin nereye gittiğini ve ne getirdiğini sade bir raporla paylaşıp işe yarayanı büyütüyoruz.",
        short: "Raporlama & Ölçekleme",
        icon: "chart",
      },
    ],
  },

  principles: {
    eyebrow: "Çalışma ilkelerimiz",
    title: "Tek seferlik bir kampanya değil, büyüyen bir sistem kuruyoruz.",
    items: [
      {
        title: "Sınırlı sayıda marka",
        text: "Aynı anda çok sayıda markayla çalışmak yerine her projeye yeterli zamanı ayırıyoruz.",
        icon: "focus",
      },
      {
        title: "Veriyle karar",
        text: "Bütçe ve kreatif kararlarını tahminle değil, kampanyalardan gelen veriyle veriyoruz.",
        icon: "chart",
      },
      {
        title: "Markaya özel kreatif",
        text: "Hazır şablon yerine markanızın diline ve ürününüze uygun içerik üretiyoruz.",
        icon: "sparkles",
      },
      {
        title: "Gerçek ürün, gerçek renk",
        text: "Yapay zekâ destekli görsellerde ürününüzün rengini ve kumaşını asla değiştirmiyoruz.",
        icon: "palette",
      },
    ],
  },

  compare: {
    id: "neden",
    eyebrow: "Neden Persona?",
    title: "Farkı yan yana görün.",
    tableHeads: ["Konu", "Persona ile"],
    rows: [
      ["Strateji", "Markanıza ve ürününüze özel"],
      ["İçerik", "Reklam planıyla birlikte üretilir"],
      ["Görseller", "Ürünün gerçek rengi ve dokusu korunur"],
      ["Raporlama", "Sade, anlaşılır ve düzenli"],
    ],
    usualTitle: "Alışılmış yaklaşım",
    usual: [
      { title: "Herkese aynı paket", text: "Sektör ve ürün fark etmeksizin aynı kampanya kurgusu." },
      { title: "Ayrı ayrı ekipler", text: "Reklam bir yerde, içerik başka yerde; mesaj dağılır." },
      { title: "Anlaşılmayan raporlar", text: "Erişim ve gösterim sayıları var, satışa etkisi belirsiz." },
      { title: "Tesadüfi denemeler", text: "Performans düşünce bütçe kısılır, nedeni sorulmaz." },
    ],
    oursTitle: "Persona yaklaşımı",
    ours: [
      { title: "Markaya özel sistem", text: "Ürününüzü ve müşterinizi anlayarak sıfırdan kurulan bir plan." },
      { title: "Tek elden yönetim", text: "Reklam, Reels ve görseller aynı hedefe hizmet eder." },
      { title: "Anlaşılır rapor", text: "Hangi kampanyanın ne getirdiğini birlikte görürüz." },
      { title: "Planlı testler", text: "Her değişiklik bir hipoteze ve ölçüme dayanır." },
    ],
  },

  audience: {
    eyebrow: "Uygunluk",
    title: "Kimlerle çalışıyoruz?",
    yes: [
      "Ürününü daha fazla kişiye doğru biçimde göstermek isteyen markalar",
      "Reklam, içerik ve görseli tek elden yönetmek isteyen işletmeler",
      "Test etmeye ve veriyle ilerlemeye açık ekipler",
    ],
    no: "Bir hafta içinde mucize sonuç bekleyen ve test sürecine zaman tanımayan işletmeler için uygun değiliz.",
  },

  start: {
    eyebrow: "Risksiz başlayın",
    title: "İlk adım ücretsiz.",
    description: "Birlikte çalışıp çalışmayacağımıza karar vermeden önce markanızı inceliyoruz.",
    items: [
      {
        title: "Ücretsiz analiz",
        text: "Mevcut reklamlarınızı, hesabınızı ve içeriklerinizi inceleyip neler yapılabileceğini anlatıyoruz. Hiçbir taahhüt yok.",
        icon: "search",
      },
      {
        title: "Şeffaf süreç",
        text: "Çalışmaya başlarsak bütçenin nereye gittiğini ve ne getirdiğini düzenli olarak birlikte görüyoruz.",
        icon: "clipboard",
      },
    ],
  },

  faq: {
    id: "sss",
    eyebrow: "SSS",
    title: "Sıkça sorulan sorular.",
    items: [
      {
        question: "Ne kadar sürede sonuç görürüm?",
        answer:
          "İlk veriler kampanyalar yayına girdikten sonraki birkaç hafta içinde oluşur. Kalıcı iyileşme için genellikle birkaç aylık test ve düzenleme gerekir; kesin süre sektörünüze ve bütçenize bağlıdır.",
      },
      {
        question: "Minimum reklam bütçesi ne olmalı?",
        answer:
          "Sabit bir alt sınır yok. Ücretsiz analizde hedefinize ve sektörünüze göre gerçekçi bir bütçe aralığı öneriyoruz.",
      },
      {
        question: "İçerikleri ve görselleri siz mi hazırlıyorsunuz?",
        answer:
          "Evet. Reels kurguları, kapak tasarımları ve yapay zekâ destekli showroom görselleri ekibimiz tarafından hazırlanır. Görsellerde ürününüzün gerçek rengi ve kumaşı korunur.",
      },
      {
        question: "Hangi sektörlerle çalışıyorsunuz?",
        answer:
          "Ürününü görsel olarak anlatması gereken markalarla çalışıyoruz: mobilya ve ev dekorasyonu başta olmak üzere perakende, hizmet ve yerel işletmeler. Uygun olup olmadığımızı ücretsiz analizde birlikte değerlendiririz.",
      },
    ],
  },

  final: {
    id: "iletisim",
    eyebrow: "Başlamaya hazır mısınız?",
    title: "Markanızın hikâyesini doğru kitleye birlikte anlatalım.",
    description:
      "Ücretsiz analiz görüşmesiyle başlıyoruz: sizi dinliyor, mevcut durumunuzu inceliyor ve bir yol haritası çıkarıyoruz.",
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
