import { Img, interpolate, staticFile } from "remotion";
import { EASE_IN_OUT, EASE_OUT, FRAME, T } from "./theme";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// Kamera: görüntü üzerindeki odak noktası (x, y: 0–1) ve yakınlaştırma (z ≥ 1).
// Görüntü hiçbir zaman görünüm dışına taşmayacak şekilde sınırlandırılır.
const cameraTransform = ({ x, y, z }, ratio) => {
  const w = FRAME.width * z;
  const h = w * ratio;
  const tx = clamp(FRAME.width / 2 - x * w, FRAME.width - w, 0);
  const ty = clamp(FRAME.viewH / 2 - y * h, Math.min(0, FRAME.viewH - h), 0);
  return { w, tx, ty };
};

export const ScreenshotScene = ({ scene, local, isFirst }) => {
  const ratio = scene.ratio ?? 0.625;
  const camP = interpolate(local, [0, scene.dur + T.wipe], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_IN_OUT,
  });
  const cam = {
    x: interpolate(camP, [0, 1], [scene.from.x, scene.to.x]),
    y: interpolate(camP, [0, 1], [scene.from.y, scene.to.y]),
    z: interpolate(camP, [0, 1], [scene.from.z, scene.to.z]),
  };
  const { w, tx, ty } = cameraTransform(cam, ratio);

  // Maskeli geçiş: yeni ekran sağdan açılarak öncekinin üzerine gelir.
  const wipe = isFirst
    ? 1
    : interpolate(local, [0, T.wipe], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASE_OUT,
      });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        clipPath: `inset(0 0 0 ${(1 - wipe) * 100}%)`,
      }}
    >
      <Img
        src={staticFile(scene.img)}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: w,
          maxWidth: "none",
          transform: `translate3d(${tx + (1 - wipe) * 36}px, ${ty}px, 0)`,
        }}
      />
    </div>
  );
};
