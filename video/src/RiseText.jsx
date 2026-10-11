import { interpolate } from "remotion";
import { EASE_OUT } from "./theme";

// Kelime kelime, maske içinden yükselen başlık animasyonu.
export const RiseText = ({ text, frame, delay = 0, stagger = 3, style }) => (
  <span style={{ display: "block", ...style }}>
    {text.split(" ").map((word, i) => {
      const p = interpolate(frame, [delay + i * stagger, delay + i * stagger + 20], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASE_OUT,
      });
      return (
        <span
          key={i}
          style={{
            display: "inline-block",
            overflow: "hidden",
            verticalAlign: "top",
            // Türkçe büyük harf noktaları (İ, Ş) ve kuyruklar kırpılmasın.
            padding: "0.14em 0.04em 0.18em",
            margin: "-0.14em 0.2em -0.18em -0.04em",
          }}
        >
          <span
            style={{
              display: "inline-block",
              transform: `translateY(${(1 - p) * 110}%)`,
              opacity: p === 0 ? 0 : 1,
            }}
          >
            {word}
          </span>
        </span>
      );
    })}
  </span>
);
