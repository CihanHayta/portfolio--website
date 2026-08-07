import {
  Mail,
  LayoutDashboard,
  Smartphone,
  BarChart3,
  Boxes,
  Megaphone,
  TrendingUp,
} from "lucide-react";
import { GithubIcon, LinkedinIcon, InstagramIcon } from "@/components/icons";
import {
  DashboardIllustration,
  MobileAppIllustration,
  AnalyticsIllustration,
  StrategyIllustration,
  CodeIllustration,
  MarketingIllustration,
  SeoIllustration,
  KanbanIllustration,
  BillingIllustration,
  InboxIllustration,
  LandingIllustration,
} from "@/components/illustrations";

// ---------------------------------------------------------------------------
// Bu portfolyoyu kendine göre düzenlemek için aşağıdaki değerleri güncelle.
// Gerçek görsellerin olduğunda `image` alanlarına /public altındaki bir yolu
// yaz (örn. "/images/project-1.png") — o zamana kadar bir placeholder gösterilir.
// ---------------------------------------------------------------------------

export const profile = {
  firstName: "Cihan",
  lastNameDisplay: "-Hayta",
  fullName: "Cihan Hayta",
  role: "Full-Stack Geliştirici",
  email: "cihanhayta8080@gmail.com",
  phone: "+90 539 941 71 05 ",
  // Sadece rakam, başında ülke kodu, + veya boşluk yok — WhatsApp linki için kullanılır.
  whatsapp: "905551234567",
  location: "İstanbul, Türkiye",
  bio: "Cihan Hayta, uçtan uca SaaS ürünleri tasarlayıp geliştiren bir full-stack yazılım geliştiricisidir. Detaylara verdiği önem ve temiz mimariye olan tutkusuyla, girişimcilerin ve ekiplerin fikirlerini hızlı, güvenilir ve production'a hazır yazılımlara dönüştürmesine yardımcı olur.",
};

export const socials = [
  { name: "GitHub", href: "https://github.com/CihanHayta", Icon: GithubIcon },
  { name: "LinkedIn", href: "https://www.linkedin.com/in/cihan-hayta-4586671a0/", Icon: LinkedinIcon },
  { name: "Instagram", href: "https://www.instagram.com/persona_dijital_pazarlama/", Icon: InstagramIcon },
  { name: "E-posta", href: "mailto:cihanhayta8080@gmail.com", Icon: Mail },
];

export const navLinks = [
  { label: "Hizmetler", href: "#services" },
  { label: "Projeler", href: "#work" },
  { label: "Süreç", href: "#process" },
  { label: "İletişim", href: "#contact" },
];

export const galleryItems = [
  { id: 1, label: "SaaS Paneli", Icon: LayoutDashboard, Illustration: DashboardIllustration, tone: "neutral", image: null },
  { id: 2, label: "Mobil Uygulama", Icon: Smartphone, Illustration: MobileAppIllustration, tone: "accent", image: null },
  { id: 3, label: "Ürün Analitiği", Icon: BarChart3, Illustration: AnalyticsIllustration, tone: "dark", image: null },
];

export const services = [
  {
    id: "01",
    title: "Ürün Stratejisi ve Mimarisi",
    description:
      "Bir fikri net bir teknik yol haritasına dönüştürmek — sistem tasarımı, veri modelleme ve işin büyümesiyle birlikte ölçeklenen teknoloji kararları.",
    image: null,
    Icon: Boxes,
    Illustration: StrategyIllustration,
  },
  {
    id: "02",
    title: "Full-Stack Geliştirme",
    description:
      "Modern framework'lerle uçtan uca web uygulaması geliştirme — piksel mükemmelliğinde arayüzlerden sağlam, iyi test edilmiş backend mantığına kadar.",
    image: null,
    Icon: LayoutDashboard,
    Illustration: CodeIllustration,
  },
  {
    id: "03",
    title: "Dijital Pazarlama",
    description:
      "SaaS ürününüzün doğru kitleye ulaşması için performans odaklı reklam kampanyaları, sosyal medya yönetimi ve veriye dayalı büyüme stratejileri.",
    image: null,
    Icon: Megaphone,
    Illustration: MarketingIllustration,
  },
  {
    id: "04",
    title: "SEO ve Büyüme Pazarlaması",
    description:
      "Arama motorlarında görünürlüğü artıran SEO çalışmaları, içerik stratejisi ve organik büyümeyi hızlandıran taktiklerle sürdürülebilir trafik.",
    image: null,
    Icon: TrendingUp,
    Illustration: SeoIllustration,
  },
];

export const processSteps = [
  { id: "discovery", label: "Keşif", description: "Tek bir satır kod yazılmadan önce hedefleri, kullanıcıları ve kısıtları anlamak." },
  { id: "planning", label: "Planlama", description: "Mimariyi, veri akışını ve kilometre taşlarını net bir uygulama planına dökmek." },
  { id: "build", label: "Geliştirme", description: "Yol boyunca sıkı geri bildirim döngüleriyle temiz, test edilmiş, production kalitesinde kod yazmak.", active: true },
  { id: "test", label: "Test", description: "Her şeyin sorunsuz çalışması için cihazlar ve uç durumlar genelinde titiz testler." },
  { id: "launch", label: "Yayına Alma", description: "İzleme, yedekleme ve sonraki adımlar için bir planla birlikte production'a çıkış." },
];

export const projects = [
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
