import Image from "next/image";
import { blog, profile } from "@/data/content";
import styles from "./ArticleEnd.module.css";

// Yazar kutusu: gerçek yazar adı ve sitedeki tanıtım metni. Fotoğraf tanımlı değilse
// markanın kendi tilki işareti kullanılır (başka birinin fotoğrafı/iddiası yok).
export default function AuthorBox({ name }) {
  const avatar = blog.avatar || "/brand/persona-mark.png";
  return (
    <section className={styles.author} aria-labelledby="yazar-baslik">
      <Image src={avatar} alt="" width={64} height={64} className={styles.avatar} />
      <div>
        <p className={styles.eyebrow}>Yazar</p>
        <h2 id="yazar-baslik" className={styles.authorName}>{name || profile.fullName}</h2>
        {blog.authorTagline ? <p className={styles.tagline}>{blog.authorTagline}</p> : null}
        {blog.authorBio ? <p className={styles.bio}>{blog.authorBio}</p> : null}
      </div>
    </section>
  );
}
