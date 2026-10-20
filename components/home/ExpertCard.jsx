import Image from "next/image";
import { Check } from "lucide-react";
import { home, meetingLabel } from "@/data/content";
import ContactButton from "./ContactButton";
import styles from "./home.module.css";

// Giriş alanının sağındaki kişisel uzmanlık kartı. Yalnızca content.js'teki
// doğrulanabilir bilgileri gösterir; sonuç rakamı ya da garanti içermez.
// Fotoğraf yokken adın baş harfleri gösterilir (stok fotoğraf kullanılmaz).
export default function ExpertCard() {
  const { expert } = home;
  const initials = expert.name
    .split(" ")
    .map((part) => part[0])
    .join("");

  return (
    <aside className={`${styles.expert} ${styles.load}`} style={{ "--load-delay": "240ms" }} aria-label={`${expert.name} hakkında`}>
      <div className={styles.expertTop}>
        {expert.photo ? (
          <Image src={expert.photo} alt={expert.name} width={64} height={64} className={styles.expertPhoto} sizes="64px" />
        ) : (
          <span className={styles.expertPhoto} aria-hidden="true">
            {initials}
          </span>
        )}
        <div>
          <p className={styles.expertName}>{expert.name}</p>
          <p className={styles.expertRole}>{expert.role}</p>
        </div>
      </div>

      <p className={styles.expertFocus}>{expert.focus}</p>
      <p className={styles.expertMessage}>{expert.message}</p>

      <ul className={styles.expertPoints}>
        {expert.points.map((point) => (
          <li key={point}>
            <Check size={15} strokeWidth={2.5} aria-hidden="true" />
            {point}
          </li>
        ))}
      </ul>

      <div className={styles.expertFoot}>
        <ContactButton className={`btn btnOutlineLight ${styles.expertCta}`} label={meetingLabel} intent="gorusme" />
        <p className={styles.expertNote}>{expert.note}</p>
      </div>
    </aside>
  );
}
