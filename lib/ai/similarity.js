// Kaynak makale ile blog arşivi arasındaki benzerliğin yerel (yapay zekâsız)
// katmanı. Hızlı bir ön eleme yapar: başlık, arama niyeti terimleri, başlık
// iskeleti ve içerik gövdesi ayrı ayrı ölçülür. Kesin sınıflandırmayı yalnızca
// bu elemeden geçen birkaç aday için yapay zekâ yapar; yapay zekâ
// kullanılamazsa buradaki sinyallerle temkinli bir sınıflandırma yapılır.
//
// Puanlar 0-1 arasıdır ve yalnızca kendi sinyalini ölçer (ör. `title` yalnızca
// başlık benzerliğidir); arayüzde "genel benzerlik yüzdesi" olarak gösterilmez.

const FOLD = { ı: "i", İ: "i", ğ: "g", ü: "u", ş: "s", ö: "o", ç: "c", â: "a", î: "i", û: "u" };

export function fold(text) {
  return String(text ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[ıİğüşöçâîû]/g, (char) => FOLD[char] ?? char)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Türkçe ve İngilizce dolgu sözcükleri (soru kalıpları dahil: "nasıl", "nedir").
const STOP = new Set(
  (
    "ve ile icin bir bu su o da de mi mu ne nasil nedir neden niye hangi kac gibi daha cok en her hep tum butun " +
    "olan olarak olur olmali gerekir gereken icin ise ama fakat veya ya hem kadar sonra once ile uzerine " +
    "rehber rehberi rehberinde ipucu ipuclari yontem yontemleri adim adimlari yol yollari temel kapsamli " +
    "the and for with your you how what why are can that this from into about guide tips best ways step steps"
  ).split(" ")
);

export function terms(text) {
  return fold(text)
    .split(" ")
    .filter((word) => word.length >= 3 && !STOP.has(word));
}

// Türkçe eklemeli bir dil: sözcüğün ilk 5 harfi kaba ama işe yarar bir kök verir
// ("butcesi", "butceniz" → "butce").
export const stem = (word) => word.slice(0, 5);
export const stems = (text) => terms(text).map(stem);

function dice(a, b) {
  const left = new Set(a);
  const right = new Set(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const item of left) if (right.has(item)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

function trigrams(text) {
  const value = ` ${fold(text)} `;
  const out = [];
  for (let index = 0; index + 3 <= value.length; index += 1) out.push(value.slice(index, index + 3));
  return out;
}

// Seviye 1 — başlık: kök kümesi (sözcük sırasından bağımsız) ve harf üçlüleri
// (yazım farklarına dayanıklı). Yalnızca birkaç ortak sözcük yüksek puan vermez.
export function titleSimilarity(a, b) {
  const byStem = dice(stems(a), stems(b));
  const byChars = dice(trigrams(a), trigrams(b));
  return Math.round((0.65 * byStem + 0.35 * byChars) * 1000) / 1000;
}

// Seviye 3 — başlık iskeleti: kaynaktaki her H2/H3'e yazıdaki en yakın başlık.
export function headingOverlap(sourceHeadings, postHeadings, threshold = 0.5) {
  const pairs = [];
  const missing = [];
  for (const heading of sourceHeadings) {
    let best = { score: 0, match: "" };
    for (const other of postHeadings) {
      const score = titleSimilarity(heading, other);
      if (score > best.score) best = { score, match: other };
    }
    if (best.score >= threshold) pairs.push({ source: heading, existing: best.match, score: best.score });
    else missing.push(heading);
  }
  return { ratio: sourceHeadings.length ? pairs.length / sourceHeadings.length : 0, pairs, missing };
}

// Seviye 4 — gövde: kök frekanslarının kosinüs benzerliği ve 3'lü kök dizilerinin
// kaynakta yer alma oranı (aynı ifadelerin tekrarı).
function frequencies(list) {
  const map = new Map();
  for (const item of list) map.set(item, (map.get(item) ?? 0) + 1);
  return map;
}

export function bodySimilarity(a, b) {
  const left = stems(a);
  const right = stems(b);
  if (left.length < 20 || right.length < 20) return { cosine: 0, phrases: 0 };
  const fa = frequencies(left);
  const fb = frequencies(right);
  let dot = 0;
  for (const [key, value] of fa) dot += value * (fb.get(key) ?? 0);
  const norm = (map) => Math.sqrt([...map.values()].reduce((sum, value) => sum + value * value, 0));
  const cosine = dot / (norm(fa) * norm(fb) || 1);
  const shingles = (list) => new Set(list.slice(0, -2).map((item, index) => `${item} ${list[index + 1]} ${list[index + 2]}`));
  const sa = shingles(left);
  const sb = shingles(right);
  let shared = 0;
  for (const item of sa) if (sb.has(item)) shared += 1;
  const phrases = sa.size ? shared / Math.min(sa.size, sb.size || 1) : 0;
  return { cosine: Math.round(cosine * 1000) / 1000, phrases: Math.round(phrases * 1000) / 1000 };
}

// Seviye 2 (yerel yaklaşım) — konu ve niyet terimlerinin yazıda geçme oranı.
export function termCoverage(keyTerms, text) {
  const wanted = [...new Set(keyTerms.flatMap((term) => stems(term)))];
  if (!wanted.length) return 0;
  const present = new Set(stems(text));
  return wanted.filter((item) => present.has(item)).length / wanted.length;
}

// Kaynak profili: başlık, başlık iskeleti, anahtar terimler. `profile` yapay
// zekânın çıkardığı Türkçe karşılıkları içerebilir (kaynak başka dildeyse).
export function scorePost(source, post) {
  const titles = [source.title, ...(source.altTitles ?? [])].filter(Boolean);
  const postTitles = [post.title, post.seoTitle].filter(Boolean);
  const title = Math.max(0, ...titles.flatMap((a) => postTitles.map((b) => titleSimilarity(a, b))));
  const headings = headingOverlap(source.headings ?? [], post.headings ?? []);
  const postText = [post.title, post.seoTitle, post.seoDescription, post.excerpt, post.tags?.join(" "), post.category, post.headings?.join(" "), post.text]
    .filter(Boolean)
    .join("\n");
  const topic = termCoverage(source.keyTerms ?? [], postText);
  const body = bodySimilarity(source.text ?? "", post.text ?? "");
  // Ağırlıklar yalnızca sıralama içindir; sınıflandırma ayrı kurallarla yapılır.
  const rank = 0.35 * title + 0.25 * topic + 0.25 * headings.ratio + 0.1 * body.cosine + 0.05 * body.phrases;
  return { title, topic, headings, body, rank: Math.round(rank * 1000) / 1000 };
}

export const CATEGORIES = ["very_high", "high", "medium", "low", "none"];
export const CATEGORY_LABELS = {
  very_high: "Çok yüksek benzerlik",
  high: "Yüksek benzerlik",
  medium: "Orta benzerlik",
  low: "Düşük benzerlik",
  none: "Belirgin benzerlik yok",
};

// Yapay zekâ kullanılamadığında temkinli yerel sınıflandırma. Tek başına ortak
// sözcükler "yüksek" sonuç vermez: başlık, konu ve iskelet birlikte bakılır.
export function classifyLocal(score) {
  const { title, topic, headings, body } = score;
  if (title >= 0.8 && (topic >= 0.6 || headings.ratio >= 0.4)) return "very_high";
  if ((title >= 0.55 && topic >= 0.5) || (headings.ratio >= 0.5 && topic >= 0.6) || body.phrases >= 0.25) return "high";
  if ((title >= 0.4 && topic >= 0.35) || headings.ratio >= 0.3 || (topic >= 0.6 && body.cosine >= 0.35)) return "medium";
  if (title >= 0.25 || topic >= 0.35 || body.cosine >= 0.3) return "low";
  return "none";
}

// Ön eleme: yapay zekâya gidecek en fazla `limit` aday (en anlamlıdan başlayarak).
export function shortlist(source, posts, { limit = 6, minRank = 0.12 } = {}) {
  return posts
    .map((post) => ({ post, score: scorePost(source, post) }))
    .filter((item) => item.score.rank >= minRank || classifyLocal(item.score) !== "none")
    .sort((a, b) => b.score.rank - a.score.rank)
    .slice(0, limit);
}

// Sonuçları kategoriye, sonra yerel sıralama puanına göre dizer; "none" atılır.
export function rankMatches(matches, limit = 5) {
  return matches
    .filter((match) => match.category !== "none")
    .sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || b.score.rank - a.score.rank)
    .slice(0, limit);
}

// Kaynak, güvenilir bir karşılaştırma için yeterince okunmuş mu?
export function sourceIsSufficient({ wordCount = 0, headings = [] }) {
  return wordCount >= 150 || (wordCount >= 80 && headings.length >= 3);
}
