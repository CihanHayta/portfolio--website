import Image from "next/image";
import { Check, ChevronDown, X } from "lucide-react";
import { brand, home, profile } from "@/data/content";
import ContactButton from "./ContactButton";
import MethodSteps from "./MethodSteps";
import ProblemCheck from "./ProblemCheck";
import { HOME_ICONS } from "./icons";
import styles from "./home.module.css";

function SectionHead({ eyebrow, title, description, center = false, id }) {
  return (
    <div className={styles.head} data-center={center}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={id} className={styles.h2}>
        {title}
      </h2>
      {description ? <p className={styles.lead}>{description}</p> : null}
    </div>
  );
}

export function Hero() {
  const { hero } = home;
  return (
    <section className={`${styles.hero} onDark`} aria-labelledby="hero-baslik">
      <div className={`${styles.container} ${styles.heroGrid}`}>
        <div>
          <p className={styles.badge}>{hero.badge}</p>
          <h1 id="hero-baslik" className={styles.h1}>
            {hero.titleStart} <em className={styles.accent}>{hero.titleAccent}</em> {hero.titleEnd}
          </h1>
          <p className={styles.heroText}>{hero.description}</p>
          <div className={styles.heroActions}>
            <ContactButton />
            <a href={`#${home.method.id}`} className="btn btnOutlineLight">
              {hero.secondaryCta}
            </a>
          </div>
        </div>

        <aside className={styles.profile} aria-label="Kurucu">
          <div className={styles.portrait}>
            {hero.portrait ? (
              <Image src={hero.portrait} alt={hero.portraitAlt} fill priority sizes="220px" />
            ) : (
              <span className={styles.monogram} aria-hidden="true">
                {brand.name[0]}
              </span>
            )}
          </div>
          <div className={styles.nameCard}>
            <p className={styles.name}>{profile.fullName}</p>
            <p className={styles.role}>{profile.role}</p>
          </div>
          <ul className={styles.highlights}>
            {hero.highlights.map((item) => (
              <li key={item.value}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}

export function Problems() {
  const { problems } = home;
  return (
    <section className={styles.cream} aria-labelledby="sorunlar-baslik">
      <div className={styles.container}>
        <SectionHead id="sorunlar-baslik" eyebrow={problems.eyebrow} title={problems.title} center />
        <ProblemCheck items={problems.items} hint={problems.hint} readyText={problems.readyText} />
      </div>
    </section>
  );
}

export function Method() {
  const { method } = home;
  return (
    <section id={method.id} className={`${styles.night} onDark`} aria-labelledby="yontem-baslik">
      <div className={styles.container}>
        <SectionHead id="yontem-baslik" eyebrow={method.eyebrow} title={method.title} description={method.description} />
        <MethodSteps steps={method.steps} />
      </div>
    </section>
  );
}

export function Principles() {
  const { principles } = home;
  return (
    <section className={styles.cream} aria-labelledby="ilkeler-baslik">
      <div className={styles.container}>
        <SectionHead id="ilkeler-baslik" eyebrow={principles.eyebrow} title={principles.title} />
        <ul className={styles.cards4}>
          {principles.items.map((item) => {
            const Icon = HOME_ICONS[item.icon];
            return (
              <li key={item.title} className={styles.card}>
                <span className={styles.cardIcon} aria-hidden="true">
                  {Icon ? <Icon size={20} /> : null}
                </span>
                <h3 className={styles.cardTitle}>{item.title}</h3>
                <p className={styles.cardText}>{item.text}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function Compare() {
  const { compare } = home;
  return (
    <section id={compare.id} className={styles.paper} aria-labelledby="neden-baslik">
      <div className={styles.container}>
        <SectionHead id="neden-baslik" eyebrow={compare.eyebrow} title={compare.title} />

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {compare.tableHeads.map((head) => (
                  <th key={head} scope="col">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compare.rows.map(([topic, value]) => (
                <tr key={topic}>
                  <th scope="row">{topic}</th>
                  <td>
                    <Check size={16} strokeWidth={2.5} aria-hidden="true" />
                    {value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.versus}>
          <div className={styles.versusUsual}>
            <p className={styles.versusLabel}>{compare.usualTitle}</p>
            <ul>
              {compare.usual.map((item) => (
                <li key={item.title}>
                  <X size={16} aria-hidden="true" />
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.text}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <span className={styles.vs} aria-hidden="true">
            VS
          </span>
          <div className={`${styles.versusOurs} onDark`}>
            <p className={styles.versusLabel}>{compare.oursTitle}</p>
            <ul>
              {compare.ours.map((item) => (
                <li key={item.title}>
                  <Check size={16} aria-hidden="true" />
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.text}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Audience() {
  const { audience } = home;
  return (
    <section className={`${styles.night} onDark`} aria-labelledby="kimler-baslik">
      <div className={`${styles.container} ${styles.audienceGrid}`}>
        <SectionHead id="kimler-baslik" eyebrow={audience.eyebrow} title={audience.title} />
        <ul className={styles.fitList}>
          {audience.yes.map((item) => (
            <li key={item} data-fit="yes">
              <Check size={18} aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
          <li data-fit="no">
            <X size={18} aria-hidden="true" />
            <span>{audience.no}</span>
          </li>
        </ul>
      </div>
    </section>
  );
}

export function Start() {
  const { start } = home;
  return (
    <section className={styles.cream} aria-labelledby="baslangic-baslik">
      <div className={styles.container}>
        <SectionHead id="baslangic-baslik" eyebrow={start.eyebrow} title={start.title} description={start.description} />
        <ul className={styles.cards2}>
          {start.items.map((item) => {
            const Icon = HOME_ICONS[item.icon];
            return (
              <li key={item.title} className={styles.card}>
                <span className={styles.cardIcon} aria-hidden="true">
                  {Icon ? <Icon size={20} /> : null}
                </span>
                <h3 className={styles.cardTitle}>{item.title}</h3>
                <p className={styles.cardText}>{item.text}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function Faq() {
  const { faq } = home;
  return (
    <section id={faq.id} className={styles.paper} aria-labelledby="sss-baslik">
      <div className={`${styles.container} ${styles.faqGrid}`}>
        <SectionHead id="sss-baslik" eyebrow={faq.eyebrow} title={faq.title} />
        <div className={styles.faqList}>
          {faq.items.map((item) => (
            // Yerel <details>: JavaScript olmadan ve klavyeyle açılır.
            <details key={item.question} className={styles.faqItem}>
              <summary>
                {item.question}
                <ChevronDown size={18} aria-hidden="true" />
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  const { final } = home;
  return (
    <section id={final.id} className={`${styles.final} onDark`} aria-labelledby="son-baslik">
      <div className={styles.container}>
        <SectionHead id="son-baslik" eyebrow={final.eyebrow} title={final.title} description={final.description} center />
        <div className={styles.finalActions}>
          <ContactButton />
        </div>
      </div>
    </section>
  );
}
