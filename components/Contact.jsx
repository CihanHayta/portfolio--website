import { profile, socials, navLinks } from "@/data/content";
import Reveal from "./Reveal";
import styles from "./Contact.module.css";

export default function Contact() {
  return (
    <footer id="contact" className={styles.contact}>
      <div className={`container ${styles.inner}`}>
        <Reveal className={styles.top}>
          <span className={styles.pretitle}>Hadi</span>
          <h2 className={styles.heading}>
            İletişime <em className={styles.italic}>Geç</em>
          </h2>
        </Reveal>

        <Reveal delay={0.1} className={styles.mid}>
          <a href={`mailto:${profile.email}`} className={styles.email}>
            {profile.email}
          </a>

          <div className={styles.socialRow}>
            {socials.map(({ name, href, Icon }) => (
              <a
                key={name}
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label={name}
                className={styles.socialLink}
              >
                <Icon size={16} strokeWidth={1.75} />
              </a>
            ))}
          </div>
        </Reveal>

        <div className={styles.bottom}>
          <span className={styles.bottomLogo}>{profile.fullName}</span>

          <nav className={styles.bottomNav}>
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className={styles.bottomLink}>
                {link.label}
              </a>
            ))}
          </nav>

          <a
            href={`tel:${profile.phone.replace(/[^+\d]/g, "")}`}
            className={styles.bottomPhone}
          >
            {profile.phone}
          </a>
        </div>
      </div>
    </footer>
  );
}
