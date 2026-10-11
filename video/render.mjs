// Proje tanıtım videolarını ve kapak görsellerini üretir.
//   npm run render                      → tüm projeler
//   npm run render -- kpi-control-center → tek proje
//   npm run render -- --stills          → video yerine her sahnenin bitiş karesi (kadraj kontrolü, out/)
//   npm run render -- --full            → tam çözünürlüklü (1440×900) kopya, out/ altına
// Çıktı: ../public/videos/projects/<slug>.mp4 ve <slug>-poster.jpg
// Siteye giden sürüm kart önizlemesi içindir: 960×600, sessiz H.264.
//
// Remotion kendi Chromium'unu indirir. O kopya çalışmazsa (ör. harici diskte) başka bir
// headless Chromium gösterilebilir: REMOTION_BROWSER=/yol/chrome-headless-shell npm run render
import path from "node:path";
import fs from "node:fs";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { projects } from "./src/projects.js";
import { T } from "./src/theme.js";

const root = import.meta.dirname;
const publicDir = path.join(root, "..", "public");
const outDir = path.join(publicDir, "videos", "projects");
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(root, "out"), { recursive: true });

const args = process.argv.slice(2);
const stillsOnly = args.includes("--stills");
const full = args.includes("--full");
const PREVIEW_SCALE = 2 / 3;
const only = args.filter((a) => !a.startsWith("--"));
const browserExecutable = process.env.REMOTION_BROWSER || null;
const targets = projects.filter((p) => only.length === 0 || only.includes(p.slug));
if (targets.length === 0) {
  console.error(`Bilinmeyen proje. Geçerli değerler: ${projects.map((p) => p.slug).join(", ")}`);
  process.exit(1);
}

// Eksik ekran görüntüsü varsa render'a hiç başlama.
const missing = targets.flatMap((p) =>
  p.scenes.map((s) => s.img).filter((f) => !fs.existsSync(path.join(publicDir, f)))
);
if (missing.length) {
  console.error(`Eksik ekran görüntüleri:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}

// Yalnızca ekran görüntülerini pakete al; sitenin diğer statik dosyalarını kopyalama.
const stagedPublic = path.join(root, ".public");
fs.rmSync(stagedPublic, { recursive: true, force: true });
fs.cpSync(path.join(publicDir, "projects"), path.join(stagedPublic, "projects"), { recursive: true });

console.log("Paketleniyor…");
const serveUrl = await bundle({
  entryPoint: path.join(root, "src", "index.jsx"),
  publicDir: stagedPublic,
});

for (const project of targets) {
  const composition = await selectComposition({ serveUrl, id: project.slug, browserExecutable });
  const video = full
    ? path.join(root, "out", `${project.slug}-1440.mp4`)
    : path.join(outDir, `${project.slug}.mp4`);
  const poster = path.join(outDir, `${project.slug}-poster.jpg`);

  if (stillsOnly) {
    const dir = path.join(root, "out", project.slug);
    fs.mkdirSync(dir, { recursive: true });
    let end = T.intro;
    const frames = [["00-intro", 46]];
    project.scenes.forEach((s, i) => {
      end += s.dur;
      frames.push([`${String(i + 1).padStart(2, "0")}-end`, end - 1]);
    });
    frames.push(["99-outro", composition.durationInFrames - 12]);
    for (const [name, frame] of frames) {
      await renderStill({
        composition,
        serveUrl,
        frame,
        output: path.join(dir, `${name}.jpg`),
        imageFormat: "jpeg",
        jpegQuality: 80,
        scale: 0.5,
        browserExecutable,
      });
    }
    console.log(`${project.slug}: ${frames.length} kare → ${path.relative(root, dir)}`);
    continue;
  }

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: video,
    crf: full ? 20 : 25,
    scale: full ? 1 : PREVIEW_SCALE,
    pixelFormat: "yuv420p",
    muted: true,
    browserExecutable,
    onProgress: ({ progress }) => {
      process.stdout.write(`\r${project.slug}: %${Math.round(progress * 100)}  `);
    },
  });

  const scale = full ? 1 : PREVIEW_SCALE;
  const mb = (fs.statSync(video).size / 1024 / 1024).toFixed(2);
  const seconds = (composition.durationInFrames / composition.fps).toFixed(1);
  console.log(
    `\r${project.slug}: ${Math.round(composition.width * scale)}×${Math.round(
      composition.height * scale
    )}, ${seconds} sn, ${mb} MB → ${path.relative(path.join(root, ".."), video)}`
  );
  if (full) continue;

  // Kapak: ilk ürün ekranının ortası (pencere tam oturmuş, başlık görünür).
  const before = project.scenes.slice(0, project.posterScene).reduce((n, s) => n + s.dur, 0);
  const posterFrame = T.intro + before + Math.round(project.scenes[project.posterScene].dur * 0.55);
  await renderStill({
    composition,
    serveUrl,
    frame: posterFrame,
    output: poster,
    imageFormat: "jpeg",
    jpegQuality: 88,
    browserExecutable,
  });
}

fs.rmSync(stagedPublic, { recursive: true, force: true });
