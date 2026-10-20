import Image from "next/image";
import Link from "next/link";
import { brand, brandSummary, navLinks, profile, socials } from "@/data/content";
import styles from "./SiteFooter.module.css";

export default function SiteFooter() {
  return (
    <footer className={`${styles.footer} onDark`}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Link href="/" className={styles.logo}>
            <Image src="/brand/persona-mark.png" alt="" width={26} height={26} className={styles.mark} />
            <span>
              <span className={styles.name}>{brand.name}</span> {brand.suffix}
            </span>
          </Link>
          <p className={styles.summary}>{brandSummary}</p>
        </div>

        <nav className={styles.nav} aria-label="Alt menü">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>


        <div className={styles.contact}>
          <a href={`tel:${profile.phone.replace(/[^+\d]/g, "")}`}>{profile.phone}</a>
          <a href={`mailto:${profile.email}`}>{profile.email}</a>
          <ul className={styles.socials}>
            {socials.map(({ name, href, Icon }) => (
              <li key={name}>
                <a
                  href={href}
                  aria-label={name}
                  {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                >
                  <Icon size={17} strokeWidth={1.8} />
                </a>
              </li>
            ))}
          </ul>
        </div>

        <p className={styles.copy}>
          © {new Date().getFullYear()} — {brand.legalName} ·{" "}
          <Link href="/gizlilik" className={styles.legal}>
            Gizlilik Politikası
          </Link>
        </p>
      </div>
    </footer>
  );
}
