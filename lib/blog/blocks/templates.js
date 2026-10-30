// Hazır yazı iskeletleri. Her şablon gerçek bloklar üretir; metinler yer
// tutucudur ve editörde değiştirilir. Kimlikler her uygulamada yeniden üretilir.
// React ya da tarayıcı bağımlılığı yoktur: galeri, editör, sunucu tarafı yayın
// denetimi ve yapay zekâ doldurma aynı tanımları kullanır.
import { contentText, createBlock, richFromText } from "./model.js";
import { PALETTE_ITEMS } from "./palette.js";

const from = (key, props = {}) => {
  const item = PALETTE_ITEMS[key];
  return { type: item.type, props: { ...item.props, ...props } };
};
const h = (text, level = "2") => from("heading", { text, level });
const p = (...paragraphs) => from("text", { doc: richFromText(...paragraphs) });
const bullets = (...items) =>
  from("text", {
    doc: {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: items.map((item) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: item }] }] })),
        },
      ],
    },
  });

const INTRO = "Giriş paragrafı: okuyucunun sorununu ve bu yazıda ne bulacağını bir iki cümleyle anlatın.";
const BODY = "Bu bölümün içeriğini buraya yazın. Somut örnekler ve kendi deneyiminiz metni güçlendirir.";
const CONCLUSION = "Yazının ana fikrini ve okuyucunun atabileceği bir sonraki adımı özetleyin.";
const CTA = () => from("cta", { description: "Projeni kısaca anlat; birlikte bir yol haritası çıkaralım." });
const RELATED = () => [
  h("İlgili yazılar"),
  bullets("İlgili bir blog yazısının bağlantısını ekleyin.", "Konuyla ilişkili bir hizmet sayfasının bağlantısını ekleyin."),
];

export const TEMPLATE_CATEGORIES = [
  ["rehber", "Rehber"],
  ["liste", "Liste ve karşılaştırma"],
  ["pazarlama", "Pazarlama ve hizmet"],
  ["teknik", "Teknik"],
  ["arastirma", "Araştırma"],
  ["gorsel", "Görsel ağırlıklı"],
];

// `ai`: "Yapay Zekâ ile Bu Şablonu Doldur" için yapı yönergesi. Modelden yalnızca
// şablonun mevcut bloklarını doldurması istenir; yeni blok eklemez.
export const TEMPLATES = [
  {
    key: "seoGuide",
    label: "SEO uyumlu rehber",
    category: "rehber",
    description: "İçindekiler, H2/H3 bölümleri, SSS, ilgili yazılar ve CTA.",
    useCase: "Bir arama sorgusunu baştan sona yanıtlayan kapsamlı rehberler için.",
    preview: ["toc", "text", "heading", "image", "faq"],
    ai: "Kapsamlı bir rehber yaz. Her H2 bir alt soruyu yanıtlasın; H3'ler o sorunun ayrıntılarını açsın. Listeyi uygulanabilir ipuçlarıyla doldur. SSS'de arama yapan birinin gerçekten soracağı soruları yanıtla.",
    blocks: () => [
      from("toc"),
      p(INTRO),
      h("Konunun temel kavramı"),
      p("Konunun ne olduğunu ve okuyucu için neden önemli olduğunu açıklayın."),
      h("Alt başlık", "3"),
      p(BODY),
      from("image"),
      h("Uygulamada dikkat edilmesi gerekenler"),
      p(BODY),
      bullets("Birinci önemli noktayı yazın.", "İkinci önemli noktayı yazın.", "Üçüncü önemli noktayı yazın."),
      h("Sonuç"),
      p(CONCLUSION),
      ...RELATED(),
      from("faq"),
      CTA(),
    ],
  },
  {
    key: "steps",
    label: "Nasıl yapılır? / adım adım rehber",
    category: "rehber",
    description: "Ön koşullar, numaralı adımlar, sık yapılan hatalar ve CTA.",
    useCase: "Okuyucunun bir işi sırayla uygulayacağı talimat yazıları için.",
    preview: ["text", "callout", "steps", "callout", "cta"],
    ai: "Okuyucunun sırayla uygulayabileceği net adımlar yaz. Her adım tek bir eylemi anlatsın ve emir kipinde başlasın. Ön koşulları bilgi kutusunda, sık yapılan hataları uyarı kutusunda topla.",
    blocks: () => [
      p(INTRO),
      from("callout", { variant: "info", title: "Başlamadan önce", text: "Bu rehberi uygulamak için gerekenleri listeleyin." }),
      h("Adımlar"),
      from("steps", { items: [1, 2, 3, 4].map((n) => ({ title: `${n}. adım`, text: "Bu adımda ne yapılacağını anlatın.", image: null })) }),
      h("Sık yapılan hatalar"),
      from("callout", { variant: "warning", title: "Dikkat", text: "Okuyucunun en sık düştüğü hatayı ve nasıl önleneceğini yazın." }),
      h("Sonuç"),
      p("Okuyucunun bu rehberin sonunda ne elde ettiğini özetleyin."),
      from("faq"),
      CTA(),
    ],
  },
  {
    key: "listicle",
    label: "Liste ve öneriler",
    category: "liste",
    description: "Kısa özet, numaralı maddeler ve sonuç.",
    useCase: "“X için 7 öneri” gibi taranması kolay liste yazıları için. Madde sayısı editörde değiştirilebilir.",
    preview: ["text", "callout", "heading", "text", "heading"],
    ai: "Her madde başlığı numarayla başlasın (ör. “1. …”) ve tek bir öneriyi anlatsın. Maddeler birbirini tekrar etmesin; en etkili öneri ilk sırada olsun.",
    blocks: () => [
      p(INTRO),
      from("callout", { variant: "note", title: "Kısaca", text: "Listedeki önerileri tek cümleyle özetleyin." }),
      ...[1, 2, 3, 4, 5].flatMap((n) => [h(`${n}. Madde başlığı`), p("Bu maddeyi ve neden önemli olduğunu açıklayın.")]),
      h("Sonuç"),
      p(CONCLUSION),
      CTA(),
    ],
  },
  {
    key: "comparison",
    label: "Karşılaştırma ve alternatifler",
    category: "liste",
    description: "Kriterler, seçenekler, artılar-eksiler ve özet tablosu.",
    useCase: "İki ya da daha fazla seçeneği tarafsızca karşılaştıran yazılar için.",
    preview: ["text", "heading", "prosCons", "heading", "table"],
    ai: "Önce karşılaştırma kriterlerini açıkla, sonra her seçeneği aynı kriterlerle değerlendir. Fiyat, performans ya da pazar payı gibi doğrulanamayan sayılar yazma; bilmediğin değeri tabloda “—” bırak.",
    blocks: () => [
      p(INTRO),
      h("Karşılaştırma kriterleri"),
      bullets("Birinci kriteri ve neden önemli olduğunu yazın.", "İkinci kriteri yazın.", "Üçüncü kriteri yazın."),
      h("Birinci seçenek"),
      p(BODY),
      from("prosCons"),
      h("İkinci seçenek"),
      p(BODY),
      from("prosCons"),
      h("Özet karşılaştırma"),
      from("table"),
      h("Hangisini seçmeli?"),
      p("Hangi durumda hangi seçeneğin daha uygun olduğunu açıklayın."),
      CTA(),
    ],
  },
  {
    key: "problemSolution",
    label: "Problem ve çözüm",
    category: "pazarlama",
    description: "Sorun, belirtiler, nedenler, çözüm adımları ve CTA.",
    useCase: "Okuyucunun yaşadığı belirli bir sorunu teşhis edip çözüm öneren yazılar için.",
    preview: ["text", "heading", "callout", "steps", "cta"],
    ai: "Sorunu okuyucunun kendi cümleleriyle tarif et. Belirtileri ve olası nedenleri ayrı tut; çözümü uygulanabilir adımlara böl. Kesin sonuç vaat etme.",
    blocks: () => [
      p("Okuyucunun yaşadığı sorunu kendi cümleleriyle tarif edin."),
      h("Bu sorun neden önemli?"),
      p("Sorun çözülmezse okuyucuyu neyin beklediğini açıklayın."),
      h("Belirtiler"),
      bullets("Sorunu fark ettiren birinci işareti yazın.", "İkinci işareti yazın.", "Üçüncü işareti yazın."),
      h("Olası nedenler"),
      p(BODY),
      h("Çözüm yaklaşımı"),
      from("callout", { variant: "success", title: "Temel fikir", text: "Çözümün özünü bir iki cümleyle açıklayın." }),
      from("steps", { items: [1, 2, 3].map((n) => ({ title: `${n}. adım`, text: "Bu adımda ne yapılacağını anlatın.", image: null })) }),
      h("Sonuç"),
      p(CONCLUSION),
      CTA(),
    ],
  },
  {
    key: "faq",
    label: "SSS odaklı blog",
    category: "rehber",
    description: "Kısa giriş, soru-cevap bölümleri, sonuç ve CTA.",
    useCase: "Müşterilerin sık sorduğu soruları tek yazıda toplayan rehberler için.",
    preview: ["text", "heading", "faq", "heading", "faq"],
    ai: "Gerçekten sorulan, birbirini tekrar etmeyen sorular seç. Her cevap ilk cümlede soruyu doğrudan yanıtlasın, sonra gerekirse ayrıntı versin.",
    blocks: () => [
      p(INTRO),
      h("Temel sorular"),
      from("faq", { title: "" }),
      h("İleri düzey sorular"),
      from("faq", { title: "" }),
      h("Sonuç"),
      p(CONCLUSION),
      CTA(),
    ],
  },
  {
    key: "serviceGuide",
    label: "Hizmet ve sektör rehberi",
    category: "pazarlama",
    description: "Sektör tanıtımı, hedef kitlenin sorunu, yaklaşımlar, süreç ve SSS.",
    useCase: "Bir sektöre ya da hizmete yönelik, gerçek hizmet kapsamına dayanan rehberler için.",
    preview: ["text", "heading", "columns3", "steps", "faq"],
    ai: "Yalnızca yazarın gerçekten sunduğu hizmetleri anlat; kapsamda olmayan hizmet, garanti ya da sonuç vaat etme. Değerlendirme kriterleri okuyucunun bir hizmet sağlayıcıyı seçerken kullanabileceği somut ölçütler olsun.",
    blocks: () => [
      p("Sektörü ya da hizmeti ve kimler için olduğunu kısaca tanıtın."),
      h("Hedef kitlenin yaşadığı sorun"),
      p(BODY),
      h("Uygulanabilecek yaklaşımlar"),
      from("columns3"),
      h("Süreç nasıl işler?"),
      from("steps", { items: [1, 2, 3].map((n) => ({ title: `${n}. aşama`, text: "Bu aşamada neler yapıldığını anlatın.", image: null })) }),
      h("Değerlendirme kriterleri"),
      bullets("Bir hizmet sağlayıcıyı seçerken bakılacak ilk ölçütü yazın.", "İkinci ölçütü yazın.", "Üçüncü ölçütü yazın."),
      from("faq"),
      ...RELATED(),
      CTA(),
    ],
  },
  {
    key: "sourceResearch",
    label: "URL kaynaklı araştırma yazısı",
    category: "arastirma",
    description: "Kaynaktaki temel bilgiler, konu başlıkları ve kaynak bağlantısı.",
    useCase: "Güvenilir bir kaynağı temel alan, özgün bir özet ve yorum yazısı için.",
    preview: ["text", "callout", "heading", "text", "quote"],
    ai: "Yalnızca kaynakta geçen bilgilere dayan ve bunları kendi cümlelerinle anlat. Kaynakta olmayan bir bilgiyi kaynağa atfetme. “Kaynaklar” bölümüne yalnızca verilen kaynak bağlantısını yaz.",
    blocks: () => [
      p("Kaynaktan anlaşılan konuyu ve okuyucu için önemini özgün bir girişle anlatın."),
      from("callout", { variant: "info", title: "Öne çıkanlar", text: "Kaynaktaki en önemli bilgileri kısaca özetleyin." }),
      h("Birinci konu başlığı"),
      p(BODY),
      h("İkinci konu başlığı"),
      p(BODY),
      h("Üçüncü konu başlığı"),
      p(BODY),
      h("Sonuç"),
      p(CONCLUSION),
      h("Kaynaklar"),
      bullets("Kaynak yazının başlığını ve bağlantısını ekleyin."),
      CTA(),
    ],
  },
  {
    key: "minimal",
    label: "Minimal blog makalesi",
    category: "rehber",
    description: "Giriş, üç bölüm ve sonuç.",
    useCase: "Kısa görüş yazıları ve hızlı duyurular için.",
    preview: ["text", "heading", "text", "heading", "text"],
    ai: "Sade ve odaklı bir yazı yaz; her bölüm tek bir fikri anlatsın.",
    blocks: () => [p(INTRO), h("Birinci bölüm"), p(BODY), h("İkinci bölüm"), p(BODY), h("Sonuç"), p(CONCLUSION)],
  },
  {
    key: "hero",
    label: "Büyük kapak görselli makale",
    category: "gorsel",
    description: "Kapak bölümü, giriş ve görselli bölümler.",
    useCase: "Güçlü bir kapak görseliyle açılan öne çıkan yazılar için.",
    preview: ["hero", "text", "heading", "image", "text"],
    ai: "Kapak bölümünün başlığı yazının ana vaadini tek cümlede söylesin; açıklama bunu bir cümleyle desteklesin.",
    // Kapak düğmesi bilerek boş: sayfada karşılığı olmayan bir çapaya bağlantı verilmez.
    blocks: () => [from("hero", { eyebrow: "KATEGORİ", title: "Yazının çarpıcı başlığı", description: "Okuyucuyu içeri çeken kısa bir açıklama yazın." }), p(INTRO), h("Birinci bölüm"), from("image"), p(BODY), h("İkinci bölüm"), p(BODY)],
  },
  {
    key: "imageText",
    label: "Görsel + metin ağırlıklı makale",
    category: "gorsel",
    description: "Sırayla sağa ve sola hizalı görselli bölümler.",
    useCase: "Her bölümü bir görselle anlatılan ürün ya da süreç tanıtımları için.",
    preview: ["text", "imageText", "imageText", "gallery"],
    ai: "Her görsel + metin bölümü tek bir konuyu anlatsın; başlık kısa, metin iki üç cümle olsun.",
    blocks: () => [p(INTRO), from("imageText", { title: "Birinci konu", position: "right" }), from("imageText", { title: "İkinci konu", position: "left" }), from("imageText", { title: "Üçüncü konu", position: "right" }), from("gallery")],
  },
  {
    key: "technical",
    label: "Teknik rehber",
    category: "teknik",
    description: "İçindekiler, kod blokları ve uyarılar.",
    useCase: "Kurulum ve uygulama adımları içeren teknik yazılar için.",
    preview: ["toc", "text", "heading", "code", "callout"],
    ai: "Teknik doğruluğa öncelik ver. Kod bloklarını doldurma; kodu yazar ekleyecek. Sürüm numarası ya da komut uydurma.",
    blocks: () => [from("toc"), p(INTRO), h("Kurulum"), p("Gerekli araçları ve sürümleri belirtin."), from("code"), h("Uygulama"), p(BODY), from("code"), from("callout", { variant: "warning", title: "Dikkat", text: "Sık yapılan hatayı ve nasıl önleneceğini yazın." }), h("Sonuç"), p("Okuyucunun bir sonraki adımda ne deneyebileceğini önerin.")],
  },
  {
    key: "caseStudy",
    label: "Vaka analizi",
    category: "pazarlama",
    description: "Sorun, yaklaşım, sonuçlar ve alıntı.",
    useCase: "Gerçek bir projenin hikâyesini anlatan yazılar için.",
    preview: ["text", "stats", "heading", "imageText", "quote"],
    ai: "Yalnızca verilen bilgilerdeki gerçek proje ayrıntılarını kullan. İstatistik ve alıntıları doldurma; bunları yazar gerçek verilerle ekleyecek.",
    blocks: () => [p("Projenin kim için, hangi hedefle yapıldığını özetleyin."), from("stats"), h("Sorun"), p("Başlangıçtaki durumu ve çözülmesi gereken problemi anlatın."), h("Yaklaşım"), from("imageText", { title: "Nasıl ele aldık" }), h("Sonuçlar"), p("Elde edilen sonuçları, ölçebildiğiniz gerçek verilerle anlatın."), from("quote", { text: "Müşterinin ya da ekibin gerçek bir değerlendirmesini buraya ekleyin.", source: "" }), CTA()],
  },
  {
    key: "review",
    label: "Ürün veya araç incelemesi",
    category: "liste",
    description: "Özet, özellikler, artılar-eksiler ve karar.",
    useCase: "Bir ürünü ya da aracı kullanmış biri olarak değerlendirdiğiniz yazılar için.",
    preview: ["text", "imageText", "columns3", "prosCons", "callout"],
    ai: "Yalnızca ürünün gerçekten bilinen özelliklerini anlat; fiyat ve performans değeri uydurma.",
    blocks: () => [p("İncelediğiniz ürünü ve kimler için uygun olduğunu bir paragrafta özetleyin."), from("imageText", { title: "Genel bakış" }), h("Öne çıkan özellikler"), from("columns3"), h("Artılar ve eksiler"), from("prosCons"), h("Karar"), from("callout", { variant: "note", title: "Kısaca", text: "Bu ürünü kime önerirsiniz, kime önermezsiniz?" })],
  },
  {
    key: "marketing",
    label: "CTA ile biten pazarlama makalesi",
    category: "pazarlama",
    description: "Sorun, çözüm, kanıt ve güçlü bir çağrı.",
    useCase: "Bir hizmete ya da teklife yönlendiren ikna edici yazılar için.",
    preview: ["text", "heading", "columns2", "quote", "cta"],
    ai: "İkna edici ama abartısız yaz. Alıntıyı doldurma; gerçek bir müşteri yorumunu yazar ekleyecek.",
    blocks: () => [p("Okuyucunun yaşadığı sorunu kendi cümleleriyle tarif edin."), h("Neden önemli?"), p(BODY), h("Çözüm"), from("columns2"), from("quote"), h("Nasıl başlanır?"), p("İlk adımı olabildiğince somut biçimde anlatın."), CTA()],
  },
];

export const templateByKey = (key) => TEMPLATES.find((template) => template.key === key) ?? null;

// Şablonun düzenlenebilir, kalıcı kimlikli bloklarını üretir. Sunucuda da
// çalışır: yeni taslak sayfası blokları burada üretip editöre hazır verir.
export function instantiateTemplate(template) {
  return template.blocks().map((block) => createBlock(block.type, structuredClone(block.props)));
}

// Galeri ve AI yönergesi için şablonun okunabilir bölüm listesi.
export function templateOutline(template) {
  return template
    .blocks()
    .filter((block) => block.type === "heading")
    .map((block) => ({ text: block.props.text, level: Number(block.props.level) }));
}

// --- Yer tutucu denetimi ------------------------------------------------------
// Şablon ve blok kütüphanesindeki talimat cümleleri ("…yazın", "…anlatın")
// gerçek içerik değildir. Yayınlanmadan önce yazıda kalmadıklarından emin olunur.
const INSTRUCTION = /(yaz[ıi]n|anlat[ıi]n|ekleyin|belirtin|özetleyin|listeleyin|açıklayın|önerin|tarif edin|buraya)[.!?]?$/i;

function collectPlaceholders() {
  const found = new Set();
  const add = (blocks) => {
    for (const line of contentText({ type: "blocks", version: 1, blocks }).split("\n")) {
      const value = line.trim();
      if (value.length >= 18 && INSTRUCTION.test(value)) found.add(value);
    }
  };
  for (const template of TEMPLATES) add(instantiateTemplate(template));
  add(Object.values(PALETTE_ITEMS).map((item) => createBlock(item.type, structuredClone(item.props ?? {}))));
  return found;
}

export const PLACEHOLDER_TEXTS = collectPlaceholders();

// Düz metinde (blog_posts.content_text) hâlâ duran şablon cümlelerini döndürür.
export function findPlaceholders(text) {
  const leftovers = [];
  for (const line of String(text ?? "").split("\n")) {
    const value = line.trim();
    if (PLACEHOLDER_TEXTS.has(value) && !leftovers.includes(value)) leftovers.push(value);
  }
  return leftovers;
}
