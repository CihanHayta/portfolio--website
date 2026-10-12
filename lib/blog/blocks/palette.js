// Sol paneldeki blok kartları. Bir kart, bir blok türünü (ve gerekirse hazır
// başlangıç değerlerini) temsil eder; `icon` istemcide lucide ikonuna eşlenir.
import { richFromText } from "./model.js";

const bullet = (...items) => ({
  type: "doc",
  content: [{
    type: "bulletList",
    content: items.map((item) => ({
      type: "listItem",
      content: [{ type: "paragraph", content: [{ type: "text", text: item }] }],
    })),
  }],
});

const cell = (type, value) => ({
  type,
  attrs: { colspan: 1, rowspan: 1 },
  content: [{ type: "paragraph", content: value ? [{ type: "text", text: value }] : [] }],
});

const table = {
  type: "doc",
  content: [{
    type: "table",
    content: [
      { type: "tableRow", content: [cell("tableHeader", "Başlık 1"), cell("tableHeader", "Başlık 2"), cell("tableHeader", "Başlık 3")] },
      { type: "tableRow", content: [cell("tableCell", ""), cell("tableCell", ""), cell("tableCell", "")] },
      { type: "tableRow", content: [cell("tableCell", ""), cell("tableCell", ""), cell("tableCell", "")] },
    ],
  }],
};

const code = {
  type: "doc",
  content: [{ type: "codeBlock", attrs: { language: null }, content: [{ type: "text", text: "// kodunuzu buraya yazın" }] }],
};

const column = (title, body) => ({ title, image: null, body: richFromText(body) });

export const PALETTE = [
  {
    title: "Temel Bloklar",
    items: [
      { key: "heading", label: "Başlık", type: "heading", icon: "heading", keywords: "h2 h3 baslik" },
      { key: "text", label: "Paragraf", type: "text", icon: "text", keywords: "metin yazi paragraf", props: { doc: richFromText("") } },
      { key: "image", label: "Görsel", type: "image", icon: "image", keywords: "resim foto gorsel" },
      { key: "video", label: "Video", type: "video", icon: "video", keywords: "youtube vimeo gomulu embed" },
      { key: "button", label: "Buton", type: "button", icon: "button", keywords: "link baglanti dugme" },
      { key: "divider", label: "Ayırıcı", type: "divider", icon: "divider", keywords: "cizgi ayirici" },
      { key: "spacer", label: "Boşluk", type: "spacer", icon: "spacer", keywords: "bosluk ara" },
      { key: "list", label: "Liste", type: "text", icon: "list", keywords: "madde numarali liste", props: { doc: bullet("Birinci madde", "İkinci madde", "Üçüncü madde") } },
    ],
  },
  {
    title: "İçerik Blokları",
    items: [
      { key: "imageText", label: "Görsel + Metin", type: "imageText", icon: "imageText", keywords: "gorsel metin yan yana", props: { body: richFromText("Bu bölümün metnini buraya yazın.") } },
      { key: "columns2", label: "İki Sütun", type: "columns", icon: "columns2", keywords: "iki sutun kolon", props: { columns: [column("Birinci sütun", "Metninizi buraya yazın."), column("İkinci sütun", "Metninizi buraya yazın.")] } },
      { key: "columns3", label: "Üç Sütun", type: "columns", icon: "columns3", keywords: "uc sutun kolon kart", props: { cards: true, columns: [column("Birinci", "Kısa açıklama."), column("İkinci", "Kısa açıklama."), column("Üçüncü", "Kısa açıklama.")] } },
      { key: "quote", label: "Alıntı", type: "quote", icon: "quote", keywords: "alinti soz" },
      { key: "callout", label: "Bilgi Kutusu", type: "callout", icon: "callout", keywords: "bilgi uyari not ipucu" },
      { key: "steps", label: "Adım Adım", type: "steps", icon: "steps", keywords: "adim rehber surec", props: { items: [{ title: "Birinci adım", text: "Bu adımda ne yapılacağını anlatın.", image: null }, { title: "İkinci adım", text: "Bu adımda ne yapılacağını anlatın.", image: null }] } },
      { key: "prosCons", label: "Avantaj / Dezavantaj", type: "prosCons", icon: "prosCons", keywords: "arti eksi karsilastirma", props: { pros: ["Birinci avantaj", "İkinci avantaj"], cons: ["Birinci dezavantaj", "İkinci dezavantaj"] } },
      { key: "faq", label: "FAQ", type: "faq", icon: "faq", keywords: "soru cevap sss", props: { items: [{ question: "İlk soru nedir?", answer: "Cevabı buraya yazın." }, { question: "İkinci soru nedir?", answer: "Cevabı buraya yazın." }] } },
    ],
  },
  {
    title: "Özel Bloklar",
    items: [
      { key: "hero", label: "Kapak Bölümü", type: "hero", icon: "hero", keywords: "kapak hero banner" },
      { key: "gallery", label: "Galeri", type: "gallery", icon: "gallery", keywords: "galeri gorseller" },
      { key: "cta", label: "CTA Bölümü", type: "cta", icon: "cta", keywords: "cta cagri buton iletisim" },
      { key: "table", label: "Tablo", type: "text", icon: "table", keywords: "tablo satir sutun", props: { doc: table } },
      { key: "code", label: "Kod", type: "text", icon: "code", keywords: "kod teknik", props: { doc: code } },
      { key: "stats", label: "İstatistik", type: "stats", icon: "stats", keywords: "sayi istatistik rakam", props: { items: [{ value: "—", label: "Ölçüm adı" }, { value: "—", label: "Ölçüm adı" }, { value: "—", label: "Ölçüm adı" }] } },
      { key: "toc", label: "İçindekiler", type: "toc", icon: "toc", keywords: "icindekiler basliklar" },
      { key: "author", label: "Yazar", type: "author", icon: "author", keywords: "yazar hakkinda" },
    ],
  },
];

export const PALETTE_ITEMS = Object.fromEntries(
  PALETTE.flatMap((group) => group.items.map((item) => [item.key, item]))
);
