// Hazır yazı iskeletleri. Her şablon gerçek bloklar üretir; metinler yer
// tutucudur ve editörde değiştirilir. Kimlikler her uygulamada yeniden üretilir.
import { richFromText } from "./model.js";
import { PALETTE_ITEMS } from "./palette.js";

const from = (key, props = {}) => {
  const item = PALETTE_ITEMS[key];
  return { type: item.type, props: { ...item.props, ...props } };
};
const h = (text, level = "2") => from("heading", { text, level });
const p = (...paragraphs) => from("text", { doc: richFromText(...paragraphs) });
const INTRO = "Giriş paragrafı: okuyucunun sorununu ve bu yazıda ne bulacağını bir iki cümleyle anlatın.";
const BODY = "Bu bölümün içeriğini buraya yazın. Somut örnekler ve kendi deneyiminiz metni güçlendirir.";
const CTA = from("cta", { description: "Projenizi kısaca anlatın; birlikte bir yol haritası çıkaralım." });

export const TEMPLATES = [
  {
    key: "minimal",
    label: "Minimal blog makalesi",
    description: "Giriş, üç bölüm ve sonuç.",
    preview: ["text", "heading", "text", "heading", "text"],
    blocks: () => [p(INTRO), h("Birinci bölüm"), p(BODY), h("İkinci bölüm"), p(BODY), h("Sonuç"), p("Yazının ana fikrini ve okuyucunun atabileceği bir sonraki adımı özetleyin.")],
  },
  {
    key: "hero",
    label: "Büyük kapak görselli makale",
    description: "Kapak bölümü, giriş ve görselli bölümler.",
    preview: ["hero", "text", "heading", "image", "text"],
    blocks: () => [from("hero", { eyebrow: "KATEGORİ", title: "Yazının çarpıcı başlığı", description: "Okuyucuyu içeri çeken kısa bir açıklama.", buttonText: "Okumaya başla", buttonHref: "#giris" }), p(INTRO), h("Birinci bölüm"), from("image"), p(BODY), h("İkinci bölüm"), p(BODY)],
  },
  {
    key: "imageText",
    label: "Görsel + metin ağırlıklı makale",
    description: "Sırayla sağa ve sola hizalı görselli bölümler.",
    preview: ["text", "imageText", "imageText", "gallery"],
    blocks: () => [p(INTRO), from("imageText", { title: "Birinci konu", position: "right" }), from("imageText", { title: "İkinci konu", position: "left" }), from("imageText", { title: "Üçüncü konu", position: "right" }), from("gallery")],
  },
  {
    key: "steps",
    label: "Adım adım rehber",
    description: "Ön koşullar, adımlar ve sık sorulanlar.",
    preview: ["text", "callout", "steps", "faq"],
    blocks: () => [p(INTRO), from("callout", { variant: "info", title: "Başlamadan önce", text: "Bu rehberi uygulamak için gerekenleri listeleyin." }), h("Adımlar"), from("steps", { items: [1, 2, 3].map((n) => ({ title: `${n}. adım`, text: "Bu adımda ne yapılacağını anlatın.", image: null })) }), h("Sonuç"), p("Okuyucunun bu rehberin sonunda ne elde ettiğini özetleyin."), from("faq")],
  },
  {
    key: "comparison",
    label: "Liste ve karşılaştırma yazısı",
    description: "Maddeler, artılar-eksiler ve özet tablosu.",
    preview: ["text", "heading", "prosCons", "heading", "table"],
    blocks: () => [p(INTRO), h("Birinci seçenek"), p(BODY), from("prosCons"), h("İkinci seçenek"), p(BODY), from("prosCons"), h("Özet karşılaştırma"), from("table"), h("Hangisini seçmeli?"), p("Hangi durumda hangi seçeneğin daha uygun olduğunu açıklayın.")],
  },
  {
    key: "technical",
    label: "Teknik rehber",
    description: "İçindekiler, kod blokları ve uyarılar.",
    preview: ["toc", "text", "heading", "code", "callout"],
    blocks: () => [from("toc"), p(INTRO), h("Kurulum"), p("Gerekli araçları ve sürümleri belirtin."), from("code"), h("Uygulama"), p(BODY), from("code"), from("callout", { variant: "warning", title: "Dikkat", text: "Sık yapılan hatayı ve nasıl önleneceğini yazın." }), h("Sonuç"), p("Okuyucunun bir sonraki adımda ne deneyebileceğini önerin.")],
  },
  {
    key: "caseStudy",
    label: "Vaka analizi",
    description: "Sorun, yaklaşım, sonuçlar ve alıntı.",
    preview: ["text", "stats", "heading", "imageText", "quote"],
    blocks: () => [p("Projenin kim için, hangi hedefle yapıldığını özetleyin."), from("stats"), h("Sorun"), p("Başlangıçtaki durumu ve çözülmesi gereken problemi anlatın."), h("Yaklaşım"), from("imageText", { title: "Nasıl ele aldık" }), h("Sonuçlar"), p("Elde edilen sonuçları, ölçebildiğiniz gerçek verilerle anlatın."), from("quote", { text: "Müşterinin ya da ekibin gerçek bir değerlendirmesini buraya ekleyin.", source: "" }), CTA],
  },
  {
    key: "review",
    label: "Ürün veya araç incelemesi",
    description: "Özet, özellikler, artılar-eksiler ve karar.",
    preview: ["text", "imageText", "columns3", "prosCons", "callout"],
    blocks: () => [p("İncelediğiniz ürünü ve kimler için uygun olduğunu bir paragrafta özetleyin."), from("imageText", { title: "Genel bakış" }), h("Öne çıkan özellikler"), from("columns3"), h("Artılar ve eksiler"), from("prosCons"), h("Karar"), from("callout", { variant: "note", title: "Kısaca", text: "Bu ürünü kime önerirsiniz, kime önermezsiniz?" })],
  },
  {
    key: "faq",
    label: "FAQ ağırlıklı rehber",
    description: "Kısa giriş ve soru-cevap bölümleri.",
    preview: ["text", "heading", "faq", "heading", "faq"],
    blocks: () => [p(INTRO), h("Temel sorular"), from("faq", { title: "" }), h("İleri düzey sorular"), from("faq", { title: "" }), CTA],
  },
  {
    key: "marketing",
    label: "CTA ile biten pazarlama makalesi",
    description: "Sorun, çözüm, kanıt ve güçlü bir çağrı.",
    preview: ["text", "heading", "columns2", "quote", "cta"],
    blocks: () => [p("Okuyucunun yaşadığı sorunu kendi cümleleriyle tarif edin."), h("Neden önemli?"), p(BODY), h("Çözüm"), from("columns2"), from("quote"), h("Nasıl başlanır?"), p("İlk adımı olabildiğince somut biçimde anlatın."), CTA],
  },
];
