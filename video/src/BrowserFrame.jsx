import { FRAME } from "./theme";

// Sade tarayıcı penceresi: üst çubuk + ekran görüntülerinin aktığı iç görünüm.
// `url` verilmezse adres alanı çizilmez, yalnızca pencere başlığı (`title`) gösterilir.
export const BrowserFrame = ({ url, title, theme, children }) => (
  <div
    style={{
      width: FRAME.width,
      borderRadius: FRAME.radius,
      overflow: "hidden",
      background: theme.chrome,
      boxShadow: theme.shadow,
      border: `1px solid ${theme.chromeLine}`,
    }}
  >
    <div
      style={{
        height: FRAME.bar,
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: 7,
        borderBottom: `1px solid ${theme.chromeLine}`,
      }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{ width: 10, height: 10, borderRadius: "50%", background: theme.chromeDot }}
        />
      ))}
      {url ? (
        <div
          style={{
            margin: "0 auto",
            transform: "translateX(-24px)",
            height: 24,
            minWidth: 360,
            padding: "0 16px",
            borderRadius: 7,
            background: theme.chromeField,
            color: theme.chromeText,
            fontSize: 12.5,
            fontWeight: 600,
            letterSpacing: "0.01em",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {url}
        </div>
      ) : (
        <div
          style={{
            margin: "0 auto",
            transform: "translateX(-24px)",
            color: theme.chromeText,
            fontSize: 12.5,
            fontWeight: 700,
            letterSpacing: "0.02em",
          }}
        >
          {title}
        </div>
      )}
    </div>
    <div
      style={{
        position: "relative",
        width: FRAME.width,
        height: FRAME.viewH,
        overflow: "hidden",
        background: theme.viewBg,
      }}
    >
      {children}
    </div>
  </div>
);
