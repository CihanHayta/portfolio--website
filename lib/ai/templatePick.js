// Kaynak makaleye göre blog şablonunu otomatik seçer (saf; istemci ve testler
// kullanır). Önce yapay zekânın kaynak profilinde verdiği biçim (`format`)
// kullanılır; yoksa ya da tanınmıyorsa başlık ve başlık iskeletine bakan
// kurallar devreye girer; hiçbiri uymazsa güvenli varsayılan "SEO uyumlu rehber".

export const FORMAT_TEMPLATES = {
  guide: "seoGuide",
  howto: "steps",
  list: "listicle",
  comparison: "comparison",
  problem: "problemSolution",
  faq: "faq",
  service: "serviceGuide",
  review: "review",
  caseStudy: "caseStudy",
  technical: "technical",
  research: "sourceResearch",
};

export const FORMAT_LABELS = {
  guide: "kapsamlı rehber",
  howto: "adım adım anlatım",
  list: "liste / öneriler",
  comparison: "karşılaştırma",
  problem: "sorun ve çözüm",
  faq: "soru-cevap ağırlıklı",
  service: "hizmet / sektör anlatımı",
  review: "ürün ya da araç incelemesi",
  caseStudy: "vaka analizi",
  technical: "teknik rehber",
  research: "araştırma / haber derlemesi",
};

export const DEFAULT_TEMPLATE = "seoGuide";

const fold = (text) =>
  String(text ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[ıİ]/g, "i");

// Kural tabanlı tahmin: yalnızca belirgin işaretler varsa bir biçim döndürür.
export function guessFormat({ title = "", headings = [], text = "" }) {
  const t = fold(title);
  const heads = headings.map(fold);
  const questionHeads = headings.filter((heading) => /\?\s*$/.test(heading)).length;
  const numbered = heads.filter((heading) => /^(\d+[.)-]|adim\s*\d+|step\s*\d+|\d+\.\s)/.test(heading)).length;

  if (/^\d+\s|\b\d+\s+(ways|ideas|tips|examples|reasons|mistakes|tools|fikir|ipucu|öneri|oneri|örnek|ornek|yol|neden|hata|araç|arac)/.test(t)) return { format: "list", why: "başlık numaralı bir liste vaat ediyor", fromTitle: true };
  if (/\bvs\.?\b|versus|karşılaştır|karsilastir|alternatif|hangisi|compared|comparison/.test(t)) return { format: "comparison", why: "başlık seçenekleri karşılaştırıyor", fromTitle: true };
  if (/how to|nasıl yapılır|nasil yapilir|adım adım|adim adim|step[- ]by[- ]step/.test(t) || numbered >= 3) return { format: "howto", why: numbered >= 3 ? "alt başlıklar numaralı adımlardan oluşuyor" : "başlık bir işin nasıl yapılacağını anlatıyor" };
  if (/sık sorulan|sik sorulan|\bfaq\b|frequently asked/.test(t) || (headings.length >= 4 && questionHeads / headings.length >= 0.5)) return { format: "faq", why: "alt başlıkların çoğu soru" };
  if (/\breview\b|inceleme|incelemesi|değerlendirme/.test(t)) return { format: "review", why: "başlık bir inceleme" };
  if (/case study|vaka analizi|başarı hikayesi|basari hikayesi/.test(t)) return { format: "caseStudy", why: "başlık bir vaka analizi" };
  if (/sorun|problem|hata|çözüm|cozum|neden çalışmıyor|not working|\bfix\b/.test(t)) return { format: "problem", why: "başlık bir sorunu ve çözümünü ele alıyor" };
  if ((String(text).match(/```/g)?.length ?? 0) >= 4) return { format: "technical", why: "kaynakta kod blokları var" };
  return null;
}

// { key, format, reason, by: "ai" | "rules" | "default" }
export function pickTemplate({ format = "", title = "", headings = [], text = "" } = {}, templates = null) {
  const exists = (key) => !templates || templates.some((item) => item.key === key);
  const guess = guessFormat({ title, headings, text });
  // Yapay zekâ en genel biçimi ("guide") verdiyse başlıktaki açık liste ya da
  // karşılaştırma vaadi daha bilgilendiricidir (ör. "… + 10 Ideas").
  if (format === "guide" && guess?.fromTitle && exists(FORMAT_TEMPLATES[guess.format])) {
    return { key: FORMAT_TEMPLATES[guess.format], format: guess.format, reason: `Kaynak ${FORMAT_LABELS[guess.format]} biçiminde (${guess.why}).`, by: "ai+rules" };
  }
  if (FORMAT_TEMPLATES[format] && exists(FORMAT_TEMPLATES[format])) {
    return { key: FORMAT_TEMPLATES[format], format, reason: `Kaynak ${FORMAT_LABELS[format]} biçiminde.`, by: "ai" };
  }
  if (guess && exists(FORMAT_TEMPLATES[guess.format])) {
    return { key: FORMAT_TEMPLATES[guess.format], format: guess.format, reason: `Kaynak ${FORMAT_LABELS[guess.format]} biçiminde (${guess.why}).`, by: "rules" };
  }
  return { key: DEFAULT_TEMPLATE, format: "guide", reason: "Belirgin bir biçim bulunamadı; kapsamlı rehber şablonu kullanıldı.", by: "default" };
}
