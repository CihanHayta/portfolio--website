import { Easing } from "remotion";

// Üç videonun ortak motion dili: tek yerden yönetilen süre ve easing değerleri.
export const FPS = 30;
export const WIDTH = 1440;
export const HEIGHT = 900;

export const T = {
  intro: 84, // açılış başlığı + pencerenin alttan yükselmesi
  settle: 30, // pencerenin perspektiften düzleşip merkeze oturması
  wipe: 18, // ekranlar arası maskeli geçiş
  outro: 96, // kapanış kartı
};

// Portföydeki --ease ile aynı eğri.
export const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

// Tarayıcı penceresinin sahnedeki ölçüleri (iç görünüm 16:10 = ekran görüntüsü oranı).
export const FRAME = {
  width: 1200,
  bar: 40,
  viewH: 750,
  top: 26,
  radius: 14,
};

// Her sahnenin başladığı kare ve ekranların bittiği kare.
export const timeline = (project) => {
  const starts = [];
  let cursor = T.intro;
  for (const scene of project.scenes) {
    starts.push(cursor);
    cursor += scene.dur;
  }
  return { starts, screensEnd: cursor };
};

export const totalFrames = (project) => timeline(project).screensEnd + T.outro;
