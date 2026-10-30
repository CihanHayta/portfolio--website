// Görseller ekranının düzeni: makalenin GERÇEK bölüm sırası.
//   Kapak → (Giriş) → Bölüm 1..n (gerçek H2 başlıkları; H3'ler alt hedef) → Eşleşmesi doğrulanamayanlar
// Her bölümde yalnızca o bölümde gerçekten duran görseller (blok sırasından) ve
// kaynakta o bölüme ait olduğu DOĞRULANAN kaynak görselleri gösterilir.
// Doğrulama iki yoldan biriyle yapılır; ikisi de yoksa görsel bir bölüme
// yakıştırılmaz, "Eşleşme doğrulanamadı" grubuna düşer:
//   1) map: taslak başlığının karşılığı olarak yapay zekânın verdiği kaynak başlığı,
//      kaynak görselin kaynaktaki başlığıyla BİREBİR aynı (normalize edilmiş).
//   2) words: kaynak başlığı ile taslak başlığı en az 2 anlamlı kelimeyi ve kısa
//      olanın kelimelerinin en az %60'ını paylaşıyor.

const fold = (text) =>
  String(text ?? "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const STOP = new Set(["icin", "ile", "veya", "nasil", "nedir", "neden", "olan", "gibi", "daha", "the", "and", "for", "with", "your", "how", "what", "why", "from"]);
const tokens = (text) => new Set(fold(text).split(" ").filter((word) => word.length > 2 && !STOP.has(word)));
export const sameHeading = (a, b) => Boolean(fold(a)) && fold(a) === fold(b);

export function headingOverlap(a, b) {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  const shared = [...left].filter((word) => right.has(word)).length;
  if (shared < 2) return 0;
  return shared / Math.min(left.size, right.size);
}

const headingText = (block) => String(block?.props?.text ?? "").trim();
const isHeading = (block) => block?.type === "heading" && headingText(block);

// Bir bloğun içindeki görseller (görsel, görsel+metin, kahraman alanı, galeri).
export function blockImages(block) {
  if (!block?.props) return [];
  if (block.type === "gallery") return (block.props.items ?? []).map((item, index) => ({ ...item.image, slot: index })).filter((image) => image?.url);
  if (["image", "imageText", "hero"].includes(block.type)) return block.props.image?.url ? [{ ...block.props.image }] : [];
  return [];
}

// sources: [{ id, section, role, src }] — kaynak görselleri (sıra korunur)
// sectionMap: { [başlık bloğu kimliği]: "kaynaktaki başlık" } (yapay zekâ beyanı)
export function imageSections(blocks = [], { sources = [], sectionMap = {} } = {}) {
  const sections = [];
  const intro = { key: "intro", title: "Giriş", target: "intro", placed: [], matches: [], hasContent: false };
  let current = null;

  for (const block of blocks) {
    if (isHeading(block) && String(block.props.level ?? "2") === "2") {
      current = {
        key: block.id,
        number: sections.length + 1,
        title: headingText(block),
        target: `block:${block.id}`,
        headingIds: [block.id],
        subheadings: [],
        placed: [],
        emptySlots: [],
        matches: [],
      };
      sections.push(current);
      continue;
    }
    if (isHeading(block)) {
      // H3/H4: bir önceki H2'nin alt hedefi (H2'den önce gelirse girişe aittir).
      if (current) {
        current.subheadings.push({ id: block.id, title: headingText(block), target: `block:${block.id}`, level: Number(block.props.level) });
        current.headingIds.push(block.id);
      }
      continue;
    }
    const owner = current ?? intro;
    if (!current && block.type !== "heading") intro.hasContent = true;
    const found = blockImages(block);
    for (const image of found) owner.placed.push({ blockId: block.id, type: block.type, url: image.url, alt: image.alt ?? "", slot: image.slot ?? null });
    if (current && ["image", "imageText", "hero"].includes(block.type) && !found.length) current.emptySlots.push({ blockId: block.id, target: `block:${block.id}` });
  }

  // Kaynak görsellerini bölümlere bağla (yalnızca doğrulanabilen eşleşmeler).
  const unmatched = [];
  let cover = null;
  for (const source of sources) {
    if (source.role === "og") {
      cover ??= { id: source.id, reason: "og" };
      continue;
    }
    const section = String(source.section ?? "").trim();
    let hit = null;
    if (section) {
      for (const candidate of sections) {
        if (candidate.headingIds.some((id) => sectionMap[id] && sameHeading(sectionMap[id], section))) {
          hit = { section: candidate, reason: "map" };
          break;
        }
      }
      if (!hit) {
        let best = 0;
        for (const candidate of sections) {
          const titles = [candidate.title, ...candidate.subheadings.map((item) => item.title)];
          const score = Math.max(...titles.map((title) => headingOverlap(section, title)));
          if (score >= 0.6 && score > best) {
            best = score;
            hit = { section: candidate, reason: "words" };
          }
        }
      }
    }
    if (hit) hit.section.matches.push({ id: source.id, reason: hit.reason, sourceSection: section });
    else unmatched.push({ id: source.id, sourceSection: section });
  }

  return {
    cover,
    intro: intro.hasContent || intro.placed.length ? intro : null,
    sections,
    unmatched,
    counts: {
      sections: sections.length,
      placed: sections.reduce((sum, item) => sum + item.placed.length, 0) + intro.placed.length,
      empty: sections.filter((item) => item.placed.length === 0).length,
    },
  };
}

// Yapay zekânın verdiği { başlık kimliği: kaynak başlığı } eşlemesinden yalnızca
// kaynakta GERÇEKTEN geçen başlıklar kalır (uydurma başlık eşleşme sayılmaz).
export function verifiedSectionMap(map, sourceHeadings = []) {
  const out = {};
  for (const [id, heading] of Object.entries(map ?? {})) {
    if (typeof id !== "string" || !/^[a-z0-9]{6,16}$/.test(id)) continue;
    const real = sourceHeadings.find((item) => sameHeading(item, heading));
    if (real) out[id] = String(real).slice(0, 160);
    if (Object.keys(out).length >= 60) break;
  }
  return out;
}
