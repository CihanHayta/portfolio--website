// Metin içi atıflar: "[1]", "[2, 3]" biçimindeki ifadeler kaynakçadaki sıra
// numarasına bağlanır. Yalnızca kaynakçada gerçekten bulunan numaralar
// bağlantıya dönüşür; olmayan numara düz metin kalır ve yayın öncesi uyarı verilir.

const CITATION = /\[(\d{1,2}(?:\s*,\s*\d{1,2}){0,4})\]/g;

export const sourceAnchor = (n) => `kaynak-${n}`;

// "Metin [1] devam [2, 3]" → [{ text }, { refs: [1] }, { text }, { refs: [2, 3] }]
export function splitCitations(text, count) {
  const value = String(text ?? "");
  if (!count || !value.includes("[")) return [{ text: value }];
  const parts = [];
  let last = 0;
  for (const match of value.matchAll(CITATION)) {
    const refs = match[1].split(",").map((part) => Number(part.trim()));
    if (!refs.every((n) => Number.isInteger(n) && n >= 1 && n <= count)) continue;
    if (match.index > last) parts.push({ text: value.slice(last, match.index) });
    parts.push({ refs });
    last = match.index + match[0].length;
  }
  if (last < value.length) parts.push({ text: value.slice(last) });
  return parts.length ? parts : [{ text: value }];
}

// Kaynakçada karşılığı olmayan atıf numaraları (yayın öncesi uyarı için).
export function danglingCitations(text, count) {
  const missing = new Set();
  for (const match of String(text ?? "").matchAll(CITATION)) {
    for (const part of match[1].split(",")) {
      const n = Number(part.trim());
      if (Number.isInteger(n) && (n < 1 || n > count)) missing.add(n);
    }
  }
  return [...missing].sort((a, b) => a - b);
}
