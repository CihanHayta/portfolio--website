import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { loadFont as loadManrope } from "@remotion/google-fonts/Manrope";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { BrowserFrame } from "./BrowserFrame";
import { RiseText } from "./RiseText";
import { ScreenshotScene } from "./ScreenshotScene";
import { EASE_IN_OUT, EASE_OUT, FRAME, HEIGHT, T, WIDTH, timeline } from "./theme";

// Portföyle aynı yazı ailesi; Türkçe karakterler için latin-ext şart.
const { fontFamily: sans } = loadManrope("normal", {
  weights: ["500", "600", "700", "800"],
  subsets: ["latin", "latin-ext"],
});
const { fontFamily: display } = loadPlayfair("normal", {
  weights: ["700"],
  subsets: ["latin", "latin-ext"],
});

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };
const FRAME_H = FRAME.bar + FRAME.viewH;
const FRAME_LEFT = (WIDTH - FRAME.width) / 2;

export const ProjectVideo = ({ project }) => {
  const frame = useCurrentFrame();
  const { theme, scenes } = project;

  const { starts, screensEnd } = timeline(project);

  // --- Pencere koreografisi: alttan yüksel → düzleş → kapanışta küçül ---
  const rise = interpolate(frame, [6, 48], [0, 1], { ...CLAMP, easing: EASE_OUT });
  const settle = interpolate(frame, [T.intro - T.settle, T.intro + 8], [0, 1], {
    ...CLAMP,
    easing: EASE_IN_OUT,
  });
  const out = interpolate(frame, [screensEnd, screensEnd + 36], [0, 1], {
    ...CLAMP,
    easing: EASE_IN_OUT,
  });

  const peekY = interpolate(rise, [0, 1], [HEIGHT, 440]);
  const frameY = interpolate(settle, [0, 1], [peekY, 0]) + out * 30;
  const frameRotate = interpolate(settle, [0, 1], [14, 0]);
  const frameScale = interpolate(settle, [0, 1], [0.9, 1]) - out * 0.47;
  // Ekranlar boyunca çok hafif bir nefes: sabit kare hissini kırar, dikkat dağıtmaz.
  const drift = interpolate(frame, [T.intro, screensEnd], [0, 1], CLAMP);

  const introOut = interpolate(frame, [T.intro - T.settle, T.intro - 8], [0, 1], {
    ...CLAMP,
    easing: EASE_IN_OUT,
  });

  const activeIndex = starts.reduce((acc, s, i) => (frame >= s ? i : acc), 0);
  const captionVisible = frame >= T.intro - 4 && frame < screensEnd + 6;
  const captionLocal = frame - starts[activeIndex];
  const captionIn = interpolate(captionLocal, [2, 18], [0, 1], { ...CLAMP, easing: EASE_OUT });
  const captionFade = interpolate(frame, [screensEnd - 6, screensEnd + 6], [1, 0], CLAMP);

  const outroLocal = frame - (screensEnd + 14);

  return (
    <AbsoluteFill style={{ background: theme.bg, fontFamily: sans, color: theme.ink }}>
      {/* Yumuşak, tek renkli zemin derinliği */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(1100px 700px at 78% 8%, ${theme.wash}, transparent 70%)`,
        }}
      />

      {/* Sahne 1 — açılış başlığı */}
      <div
        style={{
          position: "absolute",
          left: FRAME_LEFT,
          top: 92,
          width: FRAME.width,
          opacity: 1 - introOut,
          transform: `translateY(${-introOut * 28}px)`,
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: theme.accentText,
            opacity: interpolate(frame, [2, 16], [0, 1], CLAMP),
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ width: 28, height: 2, background: theme.accent }} />
          {project.eyebrow}
        </div>
        <RiseText
          text={project.name}
          frame={frame}
          delay={6}
          style={{
            fontFamily: display,
            fontWeight: 700,
            fontSize: 96,
            lineHeight: 1.08,
            letterSpacing: "-0.015em",
            marginTop: 20,
          }}
        />
        <RiseText
          text={project.tagline}
          frame={frame}
          delay={16}
          stagger={2}
          style={{
            fontSize: 27,
            fontWeight: 500,
            lineHeight: 1.4,
            color: theme.inkSoft,
            marginTop: 18,
            maxWidth: 860,
          }}
        />
      </div>

      {/* Tarayıcı penceresi (sahne 1–5 boyunca tek ve sürekli) */}
      <div
        style={{
          position: "absolute",
          left: FRAME_LEFT,
          top: FRAME.top,
          width: FRAME.width,
          height: FRAME_H,
          perspective: 1800,
          perspectiveOrigin: "50% 0%",
        }}
      >
        <div
          style={{
            transformOrigin: "50% 0%",
            transform: `translateY(${frameY}px) rotateX(${frameRotate}deg) scale(${
              frameScale + drift * 0.008
            })`,
          }}
        >
          <BrowserFrame url={project.addressBar === false ? null : project.domain} title={project.name} theme={theme}>
            {scenes.map((scene, i) => {
              const local = frame - starts[i];
              const next = starts[i + 1];
              if (i > 0 && local < 0) return null;
              if (next !== undefined && frame >= next + T.wipe) return null;
              return <ScreenshotScene key={scene.img} scene={scene} local={local} isFirst={i === 0} />;
            })}
          </BrowserFrame>
        </div>
      </div>

      {/* Sahne 2–4 — ekran başlığı */}
      {captionVisible ? (
        <div
          style={{
            position: "absolute",
            left: FRAME_LEFT,
            width: FRAME.width,
            top: FRAME.top + FRAME_H,
            height: HEIGHT - FRAME.top - FRAME_H,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            opacity: captionFade,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16, overflow: "hidden" }}>
            <span
              style={{
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: "0.08em",
                color: theme.accentText,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {String(activeIndex + 1).padStart(2, "0")}
              <span style={{ color: theme.inkFaint }}> / {String(scenes.length).padStart(2, "0")}</span>
            </span>
            <span style={{ width: 1, height: 18, background: theme.line }} />
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "-0.01em",
                opacity: captionIn,
                transform: `translateY(${(1 - captionIn) * 14}px)`,
              }}
            >
              {scenes[activeIndex].label}
            </span>
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: theme.inkFaint, letterSpacing: "0.04em" }}>
            {project.name}
          </span>
        </div>
      ) : null}

      {/* Sahne 5 — kapanış */}
      {outroLocal > 0 ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 536,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <RiseText
            text={project.name}
            frame={outroLocal}
            style={{ fontFamily: display, fontWeight: 700, fontSize: 68, lineHeight: 1.1 }}
          />
          <RiseText
            text={project.summary}
            frame={outroLocal}
            delay={8}
            stagger={1}
            style={{
              fontSize: 23,
              fontWeight: 500,
              lineHeight: 1.5,
              color: theme.inkSoft,
              maxWidth: 820,
              marginTop: 16,
            }}
          />
          <div
            style={{
              marginTop: 30,
              padding: "13px 26px",
              borderRadius: 999,
              background: theme.accent,
              color: theme.onAccent,
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: "0.01em",
              opacity: interpolate(outroLocal, [22, 38], [0, 1], CLAMP),
              transform: `translateY(${interpolate(outroLocal, [22, 38], [12, 0], {
                ...CLAMP,
                easing: EASE_OUT,
              })}px)`,
            }}
          >
            {project.domain}
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
