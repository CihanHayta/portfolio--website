// İçerik yaklaşımları: kullanıcı en fazla 3 tanesini seçer; hepsi TEK yazıda
// birlikte uygulanır (ayrı yazılara bölünmez). İlk seçimin şablon karşılığı varsa
// otomatik şablon seçiminde ana şablon olur. İstemci ve sunucu ortak kullanır.

export const MAX_APPROACHES = 3;

export const APPROACHES = [
  { key: "problemSolution", label: "Problem ve çözüm", template: "problemSolution", ai: "Okurun yaşadığı sorunu net tanımla, nedenlerini açıkla, uygulanabilir çözüm yollarını sırala." },
  { key: "guide", label: "Uygulama rehberi", template: "steps", ai: "Okurun izleyebileceği somut adımlar ver; her adımda neye dikkat edileceğini söyle." },
  { key: "mistakes", label: "Yaygın hatalar", template: "listicle", ai: "Sık yapılan hataları, neden zarar verdiklerini ve nasıl önleneceklerini anlat." },
  { key: "checklist", label: "Adım adım kontrol listesi", template: "steps", ai: "Yazının bir bölümünde okurun işaretleyebileceği kısa bir kontrol listesi ver." },
  { key: "comparison", label: "Karşılaştırma", template: "comparison", ai: "Seçenekleri aynı ölçütlerle karşılaştır; hangisinin kime uygun olduğunu açıkça söyle." },
  { key: "examples", label: "Örneklerle anlatım", template: null, ai: "Soyut anlatımı kısa ve gerçekçi örneklerle somutlaştır; örneklerde uydurma rakam ya da şirket kullanma." },
  { key: "faq", label: "Sık Sorulan Sorular (SSS)", template: "faq", ai: "Okurun sorabileceği soruları kısa ve net yanıtlarla bir SSS bölümünde topla." },
  { key: "strategy", label: "Stratejik bakış", template: null, ai: "Konunun iş hedefleriyle ilişkisini, önceliklendirmeyi ve uzun vadeli etkisini anlat." },
  { key: "tips", label: "Pratik öneriler", template: "listicle", ai: "Hemen uygulanabilecek kısa ve somut öneriler ver." },
  { key: "decision", label: "Karar verme rehberi", template: "comparison", ai: "Okurun karar vermesine yardım eden ölçütler ve “şu durumda şunu seç” yönlendirmeleri ver." },
];

const BY_KEY = new Map(APPROACHES.map((item) => [item.key, item]));

// Geçerli, tekil ve en fazla 3 anahtar (sıra korunur).
export function readApproaches(value) {
  const out = [];
  for (const key of Array.isArray(value) ? value : []) {
    if (BY_KEY.has(key) && !out.includes(key)) out.push(key);
    if (out.length === MAX_APPROACHES) break;
  }
  return out;
}

// Otomatik şablon seçimi için ilk uygun yaklaşımın şablonu (yoksa null).
export function approachTemplate(keys) {
  for (const key of readApproaches(keys)) {
    const template = BY_KEY.get(key).template;
    if (template) return template;
  }
  return null;
}

export const approachLabel = (key) => BY_KEY.get(key)?.label ?? key;

export function approachLines(keys) {
  const chosen = readApproaches(keys).map((key) => BY_KEY.get(key));
  if (!chosen.length) return "";
  return [
    `İçerik yaklaşımı (${chosen.length > 1 ? "hepsini TEK yazıda birlikte uygula; ayrı yazılara bölme, her biri yazının doğal bir parçası olsun" : "yazının tamamında uygula"}):`,
    ...chosen.map((item) => `- ${item.label}: ${item.ai}`),
  ].join("\n");
}
