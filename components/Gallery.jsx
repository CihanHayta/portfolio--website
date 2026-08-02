import { galleryItems } from "@/data/content";
import MediaFrame from "./MediaFrame";
import Reveal from "./Reveal";
import styles from "./Gallery.module.css";

export default function Gallery() {
  return (
    <section className={styles.gallery}>
      <div className={`container ${styles.grid}`}>
        {galleryItems.map((item, i) => (
          <Reveal key={item.id} delay={i * 0.1} className={styles.item}>
            <MediaFrame
              image={item.image}
              alt={item.label}
              Icon={item.Icon}
              Illustration={item.Illustration}
              label={item.label}
              tone={item.tone}
            />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
