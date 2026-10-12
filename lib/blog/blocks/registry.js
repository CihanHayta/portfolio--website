// Blok kütüphanesinin tek tanım kaynağı. Her blok türü için alan şeması burada
// durur; ayar paneli (form), sunucu doğrulaması ve düz metin çıkarımı aynı
// şemadan üretilir. React ya da tarayıcı bağımlılığı yoktur.

const ALIGN = [["left", "Sola"], ["center", "Ortala"], ["right", "Sağa"]];

const text = (key, label, extra = {}) => ({ key, label, type: "text", max: 160, ...extra });
const area = (key, label, extra = {}) => ({ key, label, type: "textarea", max: 600, ...extra });
const rich = (key, label, extra = {}) => ({ key, label, type: "rich", ...extra });
const url = (key, label, extra = {}) => ({ key, label, type: "url", ...extra });
const image = (key, label, extra = {}) => ({ key, label, type: "image", ...extra });
const toggle = (key, label, extra = {}) => ({ key, label, type: "toggle", ...extra });
const select = (key, label, options, extra = {}) => ({ key, label, type: "select", options, ...extra });
const align = (key = "align", label = "Hizalama", extra = {}) => ({
  key, label, type: "align", options: ALIGN, tab: "design", ...extra,
});
const lines = (key, label, extra = {}) => ({ key, label, type: "lines", max: 12, ...extra });
const list = (key, label, itemLabel, fields, extra = {}) => ({
  key, label, itemLabel, fields, type: "list", min: 0, max: 12, ...extra,
});

// Her bloğun altına eklenen ortak tasarım alanı.
export const COMMON_FIELDS = [
  select("spacing", "Alt boşluk", [["sm", "Dar"], ["md", "Normal"], ["lg", "Geniş"]], {
    tab: "design", default: "md",
  }),
];

export const BLOCKS = {
  heading: {
    label: "Başlık",
    fields: [
      text("text", "Başlık metni", { default: "Yeni başlık" }),
      // Sayfanın H1'i yazı başlığıdır; içerikte H2–H4 kullanılır.
      select("level", "Seviye", [["2", "H2"], ["3", "H3"], ["4", "H4"]], { default: "2" }),
      url("href", "Bağlantı (isteğe bağlı)"),
      align("align", "Hizalama", { default: "left" }),
    ],
  },
  text: {
    label: "Paragraf",
    fields: [rich("doc", "Metin", { inline: true }), align("align", "Hizalama", { default: "left" })],
  },
  image: {
    label: "Görsel",
    fields: [
      image("image", "Görsel"),
      text("caption", "Açıklama (isteğe bağlı)", { max: 300 }),
      url("href", "Görsel bağlantısı (isteğe bağlı)"),
      toggle("newTab", "Bağlantıyı yeni sekmede aç"),
      select("size", "Genişlik", [["sm", "Küçük"], ["md", "Orta"], ["lg", "Büyük"], ["full", "Tam"]], {
        tab: "design", default: "full",
      }),
      align("align", "Hizalama", { default: "center" }),
      toggle("rounded", "Köşeleri yuvarlat", { tab: "design", default: true }),
    ],
  },
  video: {
    label: "Video",
    fields: [
      url("url", "YouTube ya da Vimeo bağlantısı", { video: true }),
      text("caption", "Açıklama (isteğe bağlı)", { max: 300 }),
    ],
  },
  button: {
    label: "Buton",
    fields: [
      text("text", "Buton metni", { default: "Devamını oku", max: 60 }),
      url("href", "Bağlantı"),
      toggle("newTab", "Yeni sekmede aç"),
      select("style", "Stil", [["primary", "Dolu"], ["outline", "Çerçeveli"]], { tab: "design", default: "primary" }),
      align("align", "Hizalama", { default: "left" }),
    ],
  },
  divider: {
    label: "Ayırıcı",
    fields: [select("style", "Stil", [["line", "Çizgi"], ["dots", "Noktalar"]], { tab: "design", default: "line" })],
  },
  spacer: {
    label: "Boşluk",
    fields: [select("size", "Yükseklik", [["sm", "Küçük"], ["md", "Orta"], ["lg", "Büyük"]], { default: "md" })],
  },
  quote: {
    label: "Alıntı",
    fields: [
      area("text", "Alıntı metni", { default: "Alıntı metnini buraya yazın." }),
      text("source", "Kaynak (isteğe bağlı)"),
      select("style", "Stil", [["bar", "Kenar çizgili"], ["large", "Büyük ve ortalı"]], { tab: "design", default: "bar" }),
    ],
  },
  callout: {
    label: "Bilgi Kutusu",
    fields: [
      select("variant", "Tür", [["info", "Bilgi"], ["warning", "Uyarı"], ["success", "İpucu"], ["note", "Öne çıkan not"]], { default: "info" }),
      text("title", "Başlık (isteğe bağlı)"),
      area("text", "Açıklama", { default: "Okuyucunun gözden kaçırmaması gereken notu buraya yazın." }),
    ],
  },
  imageText: {
    label: "Görsel + Metin",
    fields: [
      image("image", "Görsel"),
      text("title", "Başlık", { default: "Bölüm başlığı" }),
      rich("body", "Metin"),
      select("position", "Görsel konumu", [["left", "Solda"], ["right", "Sağda"], ["top", "Üstte"]], { tab: "design", default: "right" }),
      select("ratio", "Sütun oranı", [["equal", "Eşit"], ["image", "Görsel geniş"], ["text", "Metin geniş"]], { tab: "design", default: "equal" }),
      select("valign", "Dikey hizalama", [["start", "Üst"], ["center", "Orta"]], { tab: "design", default: "center" }),
    ],
  },
  columns: {
    label: "Sütunlar",
    fields: [
      list("columns", "Sütunlar", "Sütun", [
        text("title", "Başlık (isteğe bağlı)"),
        image("image", "Görsel (isteğe bağlı)"),
        rich("body", "Metin"),
      ], { min: 2, max: 3 }),
      select("ratio", "Oran (iki sütunda)", [["equal", "Eşit"], ["left", "Sol geniş"], ["right", "Sağ geniş"]], { tab: "design", default: "equal" }),
      toggle("cards", "Kart görünümü", { tab: "design" }),
    ],
  },
  hero: {
    label: "Kapak Bölümü",
    fields: [
      image("image", "Arka Plan Görseli"),
      text("eyebrow", "Üst Başlık", { max: 60 }),
      text("title", "Ana Başlık", { default: "Bölüm başlığı" }),
      area("description", "Açıklama", { max: 300 }),
      text("buttonText", "Buton Metni", { max: 60 }),
      url("buttonHref", "Buton Linki"),
      align("align", "Metin Hizalama", { default: "left" }),
      toggle("overlay", "Koyu Kaplama (Overlay)", { tab: "design", default: true }),
      select("height", "Yükseklik", [["sm", "Kısa (280px)"], ["md", "Orta (400px)"], ["lg", "Uzun (520px)"]], { tab: "design", default: "md" }),
    ],
  },
  gallery: {
    label: "Galeri",
    fields: [
      list("items", "Görseller", "Görsel", [
        image("image", "Görsel"),
        text("title", "Başlık (isteğe bağlı)", { max: 80 }),
        text("caption", "Açıklama (isteğe bağlı)", { max: 200 }),
      ], { max: 12 }),
      select("columns", "Sütun sayısı", [["2", "2"], ["3", "3"], ["4", "4"]], { tab: "design", default: "3" }),
      select("ratio", "Görsel oranı", [["4/3", "4:3"], ["1/1", "Kare"], ["16/9", "16:9"]], { tab: "design", default: "4/3" }),
    ],
  },
  cta: {
    label: "CTA Bölümü",
    fields: [
      text("title", "Başlık", { default: "Bir sonraki adımı atmaya hazır mısınız?" }),
      area("description", "Açıklama", { max: 300 }),
      text("buttonText", "Buton metni", { default: "İletişime geç", max: 60 }),
      url("buttonHref", "Buton bağlantısı", { default: "/#contact" }),
      text("secondText", "İkinci buton metni (isteğe bağlı)", { max: 60 }),
      url("secondHref", "İkinci buton bağlantısı"),
      select("tone", "Arka plan", [["soft", "Açık yeşil"], ["dark", "Koyu"], ["accent", "Yeşil"]], { tab: "design", default: "soft" }),
      select("layout", "Yerleşim", [["row", "Yatay"], ["center", "Ortalı"]], { tab: "design", default: "row" }),
    ],
  },
  faq: {
    label: "FAQ",
    fields: [
      text("title", "Bölüm başlığı (isteğe bağlı)", { default: "Sık sorulan sorular" }),
      list("items", "Sorular", "Soru", [
        text("question", "Soru", { max: 200 }),
        area("answer", "Cevap", { max: 1200 }),
      ], { max: 20 }),
      toggle("schema", "Arama motorları için FAQ yapılandırılmış verisi ekle"),
    ],
  },
  steps: {
    label: "Adım Adım",
    fields: [
      list("items", "Adımlar", "Adım", [
        text("title", "Adım başlığı"),
        area("text", "Açıklama"),
        image("image", "Görsel (isteğe bağlı)"),
      ], { max: 15 }),
    ],
  },
  prosCons: {
    label: "Avantaj/Dezavantaj",
    fields: [
      text("prosTitle", "Avantajlar başlığı", { default: "Avantajlar" }),
      lines("pros", "Avantajlar (her satıra bir madde)"),
      text("consTitle", "Dezavantajlar başlığı", { default: "Dezavantajlar" }),
      lines("cons", "Dezavantajlar (her satıra bir madde)"),
    ],
  },
  stats: {
    label: "İstatistik",
    fields: [
      list("items", "Değerler", "Değer", [
        text("value", "Değer", { max: 20 }),
        text("label", "Açıklama", { max: 80 }),
      ], { max: 4 }),
    ],
  },
  toc: {
    label: "İçindekiler",
    fields: [text("title", "Başlık", { default: "İçindekiler" })],
  },
  author: {
    label: "Yazar",
    fields: [toggle("showBio", "Kısa biyografiyi göster", { default: true })],
  },
};

export function fieldsFor(type) {
  const block = BLOCKS[type];
  return block ? [...block.fields, ...COMMON_FIELDS] : null;
}

export { ALIGN };
