import Image from "next/image";
import styles from "./MediaFrame.module.css";

const TONE_CLASS = {
  neutral: styles.toneNeutral,
  accent: styles.toneAccent,
  dark: styles.toneDark,
};

export default function MediaFrame({
  image,
  alt = "",
  Icon,
  Illustration,
  label,
  tone = "neutral",
  className = "",
}) {
  const toneClass = TONE_CLASS[tone] ?? styles.toneNeutral;

  return (
    <div className={`${styles.frame} ${toneClass} ${className}`}>
      {image ? (
        <Image
          src={image}
          alt={alt}
          fill
          sizes="(max-width: 700px) 100vw, 50vw"
          className={styles.image}
        />
      ) : Illustration ? (
        <Illustration className={styles.illustration} />
      ) : (
        <div className={styles.placeholder}>
          {Icon ? <Icon className={styles.icon} strokeWidth={1.4} /> : null}
          {label ? <span className={styles.label}>{label}</span> : null}
        </div>
      )}
    </div>
  );
}
