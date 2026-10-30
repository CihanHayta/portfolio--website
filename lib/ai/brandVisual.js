// Persona Dijital Pazarlama görsel dili — AI görsel istemleri için tek kaynak.
// Renkler app/globals.css marka paletinden alınır (brandVisual.test.js eşleşmeyi
// doğrular). Kullanıcının istediği turuncu vurgu, sitenin tek vurgusu olan sıcak
// altın-amber tonu üzerinden verilir; palet dışı eski renkler kullanılmaz.

export const BRAND_PALETTE = {
  night: "#141414", // gece siyahı — koyu zemin
  cream: "#f5f0e6", // kumaş kremi — açık zemin
  gold: "#c9a24b", // Persona altını — tek vurgu (sıcak amber-turuncu)
  walnut: "#7a4e2d", // ceviz — derin sıcak gölge
  stone: "#6b6259", // taş gri — yumuşak ikincil ton
};

export const BRAND_STYLE = [
  "Editorial, premium and calm visual for a performance marketing agency blog (Persona Dijital Pazarlama).",
  `Color palette: deep night black ${BRAND_PALETTE.night}, warm cream ${BRAND_PALETTE.cream}, one warm amber-orange accent ${BRAND_PALETTE.gold} with walnut ${BRAND_PALETTE.walnut} shadows; soft natural light, gentle contrast.`,
  "Clean composition with generous negative space, subtle film grain, modern and minimal, no clutter.",
].join(" ");

export const BRAND_NEGATIVE = "text, letters, words, numbers, watermark, logo, brand mark, signature, company names, UI screenshots with readable text, distorted faces, extra fingers, neon colors, rainbow gradients";

export const PURPOSE_ASPECT = { cover: "16:9", inline: "16:9", gallery: "4:3", square: "1:1" };

const clip = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// Referans görselin tarifinden ÖZGÜN, markaya uygun yeni bir görsel istemi kurar.
// Referans birebir kopyalanmaz: konu ve işlev korunur, kompozisyon yeniden kurulur.
// `reference: false` → referanssız, yalnızca konudan üretim (aynı marka kuralları).
export function buildBrandImagePrompt({ description = null, topic = "", section = "", purpose = "inline", reference = true } = {}) {
  const subject = clip(description?.subject, 240);
  const parts = [
    BRAND_STYLE,
    topic ? `Blog topic: ${clip(topic, 160)}.` : "",
    section ? `This image illustrates the section: "${clip(section, 120)}".` : "",
    purpose === "cover" ? "Use: wide blog cover image, strong single focal point, readable at small sizes." : "Use: in-article illustration supporting the paragraph above it.",
    subject ? (reference ? `Subject to convey (same idea as the reference, NOT a copy): ${subject}.` : `Subject to convey: ${subject}.`) : "",
    description?.elements?.length ? `Useful elements to reinterpret in an original way: ${description.elements.slice(0, 6).map((item) => clip(item, 60)).join(", ")}.` : "",
    description?.mood ? `Mood: ${clip(description.mood, 80)}.` : "",
    reference
      ? "Create an original composition: change the layout, viewpoint and framing compared to the reference; do not reproduce its exact arrangement, people, brands or any text."
      : "Create an original composition with no text, letters, logos or brand marks.",
  ];
  return parts.filter(Boolean).join(" ");
}

// Gemini'nin referansı tarif ettiği yapı (görsel girdi, ücretsiz katman).
export const DESCRIBE_SYSTEM = `Sen bir görsel yönetmensin. Verilen görseli, aynı fikri anlatan ÖZGÜN yeni bir görsel üretilebilsin diye tarif et.
- Görseldeki yazıları, logoları, marka adlarını ve tanınabilir kişileri TARİF ETME; bunlar yeni görselde kullanılmayacak.
- Kısa ve somut ol. İngilizce yaz (görsel modelleri İngilizce istemle daha iyi çalışır).`;

export const DESCRIBE_SCHEMA = {
  type: "OBJECT",
  properties: {
    subject: { type: "STRING", description: "Görselin anlattığı fikir/konu, tek cümle" },
    elements: { type: "ARRAY", items: { type: "STRING" }, description: "Önemli nesne ve sahne öğeleri (yazı/logo hariç)" },
    composition: { type: "STRING" },
    mood: { type: "STRING" },
  },
  required: ["subject"],
};

// ChatGPT'ye elle verilecek istem (kullanıcı kendi ücretsiz hesabıyla üretir).
// Uygulama ChatGPT'yi otomatik kullanmaz; yalnızca istemi hazırlar ve sekmeyi açar.
export const CHATGPT_URL = "https://chatgpt.com/";
export function buildHandoffPrompt({ topic = "", section = "", purpose = "inline", alt = "", hasReference = false } = {}) {
  const aspect = purpose === "cover" ? "16:9 yatay (blog kapağı, 1200×630 civarı)" : purpose === "gallery" ? "4:3 yatay" : "16:9 yatay";
  return [
    "Persona Dijital Pazarlama blogu için ÖZGÜN bir görsel üret.",
    topic ? `Yazının konusu: ${clip(topic, 160)}.` : "",
    section ? `Görselin anlatacağı bölüm: "${clip(section, 120)}".` : "",
    alt ? `Anlatılacak fikir: ${clip(alt, 200)}.` : "",
    hasReference
      ? "Eklediğim referans görselden yalnızca fikir al: birebir kopyalama; kompozisyonu, bakış açısını ve kişileri değiştir; referanstaki yazı, logo ve markaları kullanma."
      : "",
    `Biçim: ${aspect}.`,
    `Görsel dil: sade, premium, editoryal. Renkler: koyu gece siyahı ${BRAND_PALETTE.night}, sıcak krem ${BRAND_PALETTE.cream}, tek vurgu olarak sıcak amber-turuncu ${BRAND_PALETTE.gold}, ceviz ${BRAND_PALETTE.walnut} gölgeler. Yumuşak doğal ışık, bol boşluk.`,
    "Görselde hiçbir yazı, harf, rakam, logo, filigran ya da marka adı olmasın. Neon renk ve gökkuşağı gradyanı kullanma.",
  ]
    .filter(Boolean)
    .join("\n");
}

// --- Kapak istemi (ChatGPT ile elle üretim) ---------------------------------------
// Her yazı için konuya özgü sahne: başlık, ana fikir, öne çıkan bölüm ve hedef kitle
// istemde yer alır; sahne konu kelimelerinden seçilir (aynı kapak başka konuya
// gitmez). Maskot yalnızca kullanıcının yüklediği/var olan kendi tilki
// görselleriyle tarif edilir; başka bir tilki uydurulmaz. Görselde yazı OLMAZ:
// Türkçe başlık sayfada doğru fontla ayrıca gösterilir.
export const FOX_ORANGE = "#e0902f"; // public/brand/persona-mark.png'den ölçülen tilki turuncusu
export const SECONDARY_PURPLE = "#7c5cff";

const COVER_SCENES = [
  [/b[uü]t[cç]e|maliyet|harcama|roas|yat[ıi]r[ıi]m/i, "dijital reklam panelleri, bütçe dağılımını gösteren grafikler ve yükselen performans çizgileri"],
  [/seo|arama motoru|google|anahtar kelime|s[ıi]ralama/i, "arama sonuçlarını andıran ışıklı paneller ve yukarı tırmanan sıralama basamakları"],
  [/instagram|facebook|meta|sosyal medya|reels|tiktok/i, "sosyal medya akışlarını andıran kart dizileri, beğeni ve etkileşim ışıkları"],
  [/kreatif|g[oö]rsel|tasar[ıi]m|video|i[cç]erik/i, "yaratıcı bir stüdyo masası: storyboard kartları, kamera ve renk paletleri"],
  [/analiz|rapor|veri|[oö]l[cç][uü]m|kpi|takip/i, "veri panoları, analiz grafikleri ve büyüteçle incelenen raporlar"],
  [/hedef kitle|m[uü]şteri|persona|segment|d[oö]n[uü]ş[uü]m/i, "hedef tahtası etrafında kümelenen kitle simgeleri ve dönüşüm hunisi"],
  [/e-?posta|mail|b[uü]lten/i, "zarf simgeleri, otomasyon akışı ve açılan e-posta pencereleri"],
  [/strateji|plan|yol haritas[ıi]|b[uü]y[uü]me/i, "satranç tahtası benzeri bir strateji masası ve ileri uzanan yol haritası"],
];

export function coverScene(text) {
  const value = String(text ?? "");
  const found = COVER_SCENES.filter(([pattern]) => pattern.test(value)).map(([, scene]) => scene);
  return found.length ? found.slice(0, 2).join("; ") : "konuyu anlatan sade dijital pazarlama nesneleri ve ışıklı bir teknoloji ortamı";
}

export function buildCoverPrompt({ title = "", idea = "", topic = "", highlight = "", audience = "", mascotCount = 0 } = {}) {
  const subject = [title, topic, highlight, idea].join(" ");
  return [
    "Persona Dijital Pazarlama blogu için ÖZGÜN bir kapak görseli üret.",
    "Biçim: yatay 1536×1024 (16:9'a yakın blog kapağı). Ana öğeler merkezde kalsın; kenarlarda boşluk olsun (kırpılabilir).",
    title ? `Yazının başlığı: "${clip(title, 160)}".` : "",
    idea ? `Ana fikir: ${clip(idea, 240)}.` : "",
    highlight ? `Öne çıkan bölüm: "${clip(highlight, 120)}".` : "",
    audience ? `Hedef kitle: ${clip(audience, 120)}.` : "",
    `Sahne: ${coverScene(subject)}. Sahne bu yazının konusuna özgü olsun; genel bir stok görsel olmasın.`,
    mascotCount > 0
      ? `Ekte verdiğim ${mascotCount > 1 ? `${mascotCount} görseldeki` : "görseldeki"} tilki, Persona Dijital Pazarlama'nın KENDİ maskotudur. Sahnenin kahramanı olarak bu tilkiyi kullan: yüz hatları, kulakları, turuncu (${FOX_ORANGE}) ve krem renkleri, stili referanstaki gibi kalsın. Başka bir tilki ya da farklı bir maskot çizme.`
      : "Maskot referansı verilmedi: tilki ya da başka bir maskot çizme; sahneyi nesnelerle kur.",
    `Görsel dil: koyu antrasit zemin (${BRAND_PALETTE.night}), tilki turuncusu (${FOX_ORANGE}) ışık vurguları, çok ölçülü ikincil mor ışık (${SECONDARY_PURPLE}), dijital teknoloji atmosferi, premium ve temiz kompozisyon, yumuşak derinlik.`,
    "Görselde HİÇBİR yazı, harf, rakam, logo, filigran ya da marka adı olmasın; başlık sayfada ayrıca gösterilecek.",
    "Başka bir şirketin logosunu, maskotunu, ürününü ya da kişilerini kullanma.",
  ]
    .filter(Boolean)
    .join("\n");
}
