// Blog görselleri için marka grafikleri (SVG). Yapay zekâ görseli DEĞİLDİR:
// sitenin renkleriyle, konuya göre seçilen soyut bir motiften sunucuda çizilir.
// Yazı içermez; bu sayede sunucuda yazı tipi gerekmez ve çıktı her yerde aynıdır.

export const GRAPHIC_SIZES = {
  cover: { width: 1600, height: 840 },
  inline: { width: 1600, height: 900 },
};

const PALETTES = {
  forest: { bg: "#14513f", bgAlt: "#0e3d2f", surface: "#1d6650", line: "#2f7c64", ink: "#edf5f1", accent: "#d8fb3f" },
  ink: { bg: "#111110", bgAlt: "#1c1c1a", surface: "#262623", line: "#3a3a36", ink: "#f4f4f0", accent: "#d8fb3f" },
  mint: { bg: "#edf5f1", bgAlt: "#dfece5", surface: "#ffffff", line: "#bcd5c9", ink: "#14513f", accent: "#d8fb3f" },
  sand: { bg: "#f4f4f0", bgAlt: "#e9e9e2", surface: "#ffffff", line: "#d2d2c8", ink: "#111110", accent: "#14513f" },
};

// Aynı tohum her zaman aynı görseli üretir (mulberry32).
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const n = (value) => Math.round(value * 10) / 10;

function backdrop({ width, height }, c, random) {
  const cx = n(width * (0.62 + random() * 0.28));
  const cy = n(height * (0.1 + random() * 0.3));
  const dots = [];
  const step = 40;
  for (let y = step; y < height; y += step) {
    for (let x = step; x < width; x += step) dots.push(`<circle cx="${x}" cy="${y}" r="1.6"/>`);
  }
  return [
    `<rect width="${width}" height="${height}" fill="${c.bg}"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${n(height * 0.62)}" fill="${c.bgAlt}"/>`,
    `<g fill="${c.line}" opacity="0.55">${dots.join("")}</g>`,
  ].join("");
}

// Her motif, ortalanmış 1000×560'lık bir çalışma alanına çizilir.
const MOTIFS = {
  chart(c, random) {
    const bars = Array.from({ length: 7 }, (_, index) => 110 + random() * 150 + index * 34);
    const points = bars.map((value, index) => [110 + index * 130, 470 - value * 0.92 - 46]);
    const path = points.map(([x, y], index) => `${index ? "L" : "M"}${n(x)} ${n(y)}`).join(" ");
    return [
      `<line x1="40" y1="470" x2="960" y2="470" stroke="${c.line}" stroke-width="4" stroke-linecap="round"/>`,
      ...bars.map(
        (value, index) =>
          `<rect x="${70 + index * 130}" y="${n(470 - value)}" width="80" height="${n(value)}" rx="14" fill="${index === bars.length - 1 ? c.accent : c.surface}"/>`
      ),
      `<path d="${path}" fill="none" stroke="${c.ink}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
      ...points.map(([x, y]) => `<circle cx="${n(x)}" cy="${n(y)}" r="11" fill="${c.bg}" stroke="${c.ink}" stroke-width="6"/>`),
    ].join("");
  },

  network(c, random) {
    const nodes = [[500, 280, 54]];
    for (let index = 0; index < 7; index += 1) {
      const angle = (index / 7) * Math.PI * 2 + random() * 0.5;
      const radius = 190 + random() * 70;
      nodes.push([500 + Math.cos(angle) * radius * 1.5, 280 + Math.sin(angle) * radius * 0.92, 22 + random() * 16]);
    }
    const edges = nodes.slice(1).map(([x, y]) => `<line x1="500" y1="280" x2="${n(x)}" y2="${n(y)}"/>`);
    for (let index = 1; index < nodes.length; index += 1) {
      const [x1, y1] = nodes[index];
      const [x2, y2] = nodes[(index % (nodes.length - 1)) + 1];
      if (random() > 0.35) edges.push(`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"/>`);
    }
    return [
      `<g stroke="${c.line}" stroke-width="4" stroke-linecap="round">${edges.join("")}</g>`,
      ...nodes.map(
        ([x, y, r], index) =>
          `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${index === 0 ? c.accent : index % 3 === 0 ? c.ink : c.surface}" stroke="${c.bg}" stroke-width="8"/>`
      ),
    ].join("");
  },

  layers(c, random) {
    const tilt = 46 + random() * 20;
    const sheet = (y, fill, stroke) =>
      `<path d="M500 ${y} L${500 + 330} ${y + tilt * 2.2} L500 ${y + tilt * 4.4} L${500 - 330} ${y + tilt * 2.2} Z" fill="${fill}" stroke="${stroke}" stroke-width="5" stroke-linejoin="round"/>`;
    return [
      sheet(250, c.surface, c.line),
      sheet(165, c.surface, c.line),
      sheet(80, c.ink, c.ink),
      sheet(-5, c.accent, c.accent),
    ].join("");
  },

  flow(c, random) {
    const ys = Array.from({ length: 5 }, () => 180 + random() * 200);
    const points = ys.map((y, index) => [90 + index * 205, y]);
    let path = `M${points[0][0]} ${n(points[0][1])}`;
    for (let index = 1; index < points.length; index += 1) {
      const [px, py] = points[index - 1];
      const [x, y] = points[index];
      path += ` C${px + 100} ${n(py)} ${x - 100} ${n(y)} ${x} ${n(y)}`;
    }
    return [
      `<path d="${path}" fill="none" stroke="${c.line}" stroke-width="10" stroke-linecap="round" stroke-dasharray="2 26"/>`,
      ...points.map(([x, y], index) => {
        const last = index === points.length - 1;
        return (
          `<circle cx="${x}" cy="${n(y)}" r="${last ? 62 : 46}" fill="${last ? c.accent : index % 2 ? c.surface : c.ink}" stroke="${c.bg}" stroke-width="10"/>` +
          `<circle cx="${x}" cy="${n(y)}" r="12" fill="${last ? c.bg : index % 2 ? c.ink : c.bg}"/>`
        );
      }),
    ].join("");
  },

  grid(c, random) {
    const cells = [];
    const size = 104;
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const roll = random();
        const fill = roll > 0.86 ? c.accent : roll > 0.62 ? c.ink : roll > 0.3 ? c.surface : "none";
        cells.push(
          `<rect x="${52 + col * (size + 10)}" y="${54 + row * (size + 10)}" width="${size}" height="${size}" rx="20" fill="${fill}" stroke="${c.line}" stroke-width="4"/>`
        );
      }
    }
    return cells.join("");
  },

  target(c, random) {
    const angle = -0.5 - random() * 0.5;
    const tipX = 500 + Math.cos(angle) * 20;
    const tipY = 290 + Math.sin(angle) * 20;
    const tailX = 500 + Math.cos(angle) * 400;
    const tailY = 290 + Math.sin(angle) * 400;
    return [
      ...[250, 190, 130, 70].map(
        (r, index) =>
          `<circle cx="500" cy="290" r="${r}" fill="${index % 2 ? c.bg : c.surface}" stroke="${c.line}" stroke-width="4"/>`
      ),
      `<circle cx="500" cy="290" r="28" fill="${c.accent}"/>`,
      `<line x1="${n(tailX)}" y1="${n(tailY)}" x2="${n(tipX)}" y2="${n(tipY)}" stroke="${c.ink}" stroke-width="10" stroke-linecap="round"/>`,
      `<circle cx="${n(tailX)}" cy="${n(tailY)}" r="22" fill="${c.ink}"/>`,
    ].join("");
  },

  code(c, random) {
    const lines = [];
    for (let row = 0; row < 7; row += 1) {
      let x = 150 + (row % 3) * 46;
      const y = 176 + row * 46;
      const parts = 2 + Math.floor(random() * 3);
      for (let part = 0; part < parts; part += 1) {
        const width = 60 + random() * 170;
        if (x + width > 850) break;
        const fill = part === 0 && row % 2 === 0 ? c.accent : random() > 0.5 ? c.ink : c.line;
        lines.push(`<rect x="${n(x)}" y="${y}" width="${n(width)}" height="18" rx="9" fill="${fill}"/>`);
        x += width + 18;
      }
    }
    return [
      `<rect x="100" y="40" width="800" height="480" rx="28" fill="${c.surface}" stroke="${c.line}" stroke-width="4"/>`,
      `<line x1="100" y1="118" x2="900" y2="118" stroke="${c.line}" stroke-width="4"/>`,
      `<circle cx="150" cy="79" r="11" fill="${c.line}"/><circle cx="186" cy="79" r="11" fill="${c.line}"/><circle cx="222" cy="79" r="11" fill="${c.accent}"/>`,
      ...lines,
    ].join("");
  },

  device(c, random) {
    const bar = 150 + random() * 120;
    return [
      `<rect x="120" y="50" width="640" height="410" rx="26" fill="${c.surface}" stroke="${c.line}" stroke-width="4"/>`,
      `<rect x="160" y="96" width="250" height="26" rx="13" fill="${c.ink}"/>`,
      `<rect x="160" y="146" width="${n(bar + 180)}" height="16" rx="8" fill="${c.line}"/>`,
      `<rect x="160" y="178" width="${n(bar + 80)}" height="16" rx="8" fill="${c.line}"/>`,
      `<rect x="160" y="236" width="170" height="170" rx="20" fill="${c.accent}"/>`,
      `<rect x="354" y="236" width="170" height="170" rx="20" fill="${c.bgAlt}"/>`,
      `<rect x="548" y="236" width="170" height="170" rx="20" fill="${c.bgAlt}"/>`,
      `<rect x="380" y="460" width="120" height="50" fill="${c.line}"/>`,
      `<rect x="300" y="506" width="280" height="16" rx="8" fill="${c.line}"/>`,
      `<rect x="690" y="170" width="210" height="370" rx="32" fill="${c.ink}" stroke="${c.bg}" stroke-width="10"/>`,
      `<rect x="716" y="214" width="158" height="120" rx="16" fill="${c.accent}"/>`,
      `<rect x="716" y="356" width="158" height="16" rx="8" fill="${c.line}"/>`,
      `<rect x="716" y="388" width="110" height="16" rx="8" fill="${c.line}"/>`,
      `<rect x="716" y="452" width="158" height="46" rx="23" fill="${c.surface}"/>`,
    ].join("");
  },

  document(c, random) {
    const rows = Array.from({ length: 6 }, () => 190 + random() * 190);
    return [
      `<rect x="340" y="60" width="400" height="470" rx="26" fill="${c.bgAlt}" stroke="${c.line}" stroke-width="4" transform="rotate(7 540 295)"/>`,
      `<rect x="280" y="40" width="400" height="480" rx="26" fill="${c.surface}" stroke="${c.line}" stroke-width="4"/>`,
      `<rect x="324" y="88" width="210" height="30" rx="15" fill="${c.ink}"/>`,
      ...rows.map((width, index) => `<rect x="324" y="${158 + index * 40}" width="${n(Math.min(width, 312))}" height="16" rx="8" fill="${c.line}"/>`),
      `<rect x="324" y="420" width="150" height="54" rx="27" fill="${c.accent}"/>`,
      `<circle cx="700" cy="120" r="56" fill="${c.accent}" stroke="${c.bg}" stroke-width="10"/>`,
      `<path d="M676 121 l17 17 l32 -36" fill="none" stroke="${c.bg}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`,
    ].join("");
  },

  spark(c, random) {
    const rays = [];
    const count = 14;
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      const inner = 150;
      const outer = 215 + random() * 95;
      rays.push(
        `<line x1="${n(500 + Math.cos(angle) * inner)}" y1="${n(280 + Math.sin(angle) * inner)}" x2="${n(500 + Math.cos(angle) * outer)}" y2="${n(280 + Math.sin(angle) * outer)}" stroke="${index % 3 === 0 ? c.accent : c.line}" stroke-width="12" stroke-linecap="round"/>`
      );
    }
    return [
      ...rays,
      `<circle cx="500" cy="280" r="112" fill="${c.ink}"/>`,
      `<circle cx="500" cy="280" r="58" fill="${c.accent}"/>`,
      `<circle cx="${n(180 + random() * 60)}" cy="${n(110 + random() * 40)}" r="20" fill="${c.surface}" stroke="${c.line}" stroke-width="4"/>`,
      `<circle cx="${n(800 + random() * 50)}" cy="${n(440 + random() * 40)}" r="28" fill="${c.surface}" stroke="${c.line}" stroke-width="4"/>`,
    ].join("");
  },
};

export const GRAPHIC_MOTIFS = Object.keys(MOTIFS);
export const GRAPHIC_PALETTES = Object.keys(PALETTES);

export function renderGraphicSvg({ motif, palette, role = "inline", seed = 1 }) {
  const size = GRAPHIC_SIZES[role] ?? GRAPHIC_SIZES.inline;
  const colors = PALETTES[palette] ?? PALETTES.forest;
  const draw = MOTIFS[motif] ?? MOTIFS.layers;
  const random = createRandom(seed);

  const scale = Math.min(size.width / 1000, size.height / 560) * 0.82;
  const offsetX = n((size.width - 1000 * scale) / 2);
  const offsetY = n((size.height - 560 * scale) / 2);
  const background = backdrop(size, colors, random);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">` +
    background +
    `<g transform="translate(${offsetX} ${offsetY}) scale(${n(scale * 100) / 100})">${draw(colors, random)}</g>` +
    `</svg>`
  );
}
