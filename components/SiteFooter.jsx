import Image from "next/image";
import Link from "next/link";
import { brand, navLinks, socials } from "@/data/content";
import styles from "./SiteFooter.module.css";

export default function SiteFooter() {
  return (
    <footer className={`${styles.footer} onDark`}>
      <div className={styles.inner}>
        <Link href="/" className={styles.logo}>
          <Image src="/brand/persona-mark.png" alt="" width={26} height={26} className={styles.mark} />
          <span>
            <span className={styles.name}>{brand.name}</span> {brand.suffix}
          </span>
        </Link>

        <nav className={styles.nav} aria-label="Alt menü">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>

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

        <p className={styles.copy}>
          © {new Date().getFullYear()} — {brand.legalName}
        </p>
      </div>
    </footer>
  );
}
