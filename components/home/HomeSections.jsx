import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Minus } from "lucide-react";
import { home, meetingLabel } from "@/data/content";
import ContactButton from "./ContactButton";
import ExpertCard from "./ExpertCard";
import ProblemCheck from "./ProblemCheck";
import { HOME_ICONS } from "./icons";
import styles from "./home.module.css";

function SectionHead({ id, eyebrow, title, description, center = false, children }) {
  return (
    <div className={styles.head} data-center={center} data-reveal>
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={id} className={styles.h2}>
        {title}
      </h2>
      {description ? <p className={styles.lead}>{description}</p> : null}
      {children}
    </div>
  );
}

function Icon({ name, size = 20 }) {
  const Component = HOME_ICONS[name];
  return Component ? <Component size={size} aria-hidden="true" /> : null;
}

export function Hero() {
  const { hero } = home;
  return (
    <section className={`${styles.hero} onDark`} aria-labelledby="hero-baslik">
      <div className={`${styles.container} ${styles.heroGrid}`}>
        <div className={styles.heroCopy}>
          <p className={`${styles.badge} ${styles.load}`} style={{ "--load-delay": "0ms" }}>
            {hero.badge}
          </p>
          <h1 id="hero-baslik" className={styles.h1}>
            <span className={styles.h1Line} style={{ "--load-delay": "60ms" }}>
              {hero.titleLine1}
            </span>{" "}
            <span className={styles.h1Line} style={{ "--load-delay": "160ms" }}>
              <em className={styles.accent}>{hero.titleAccent}</em> {hero.titleLine2End}
            </span>
          </h1>
          <p className={`${styles.heroText} ${styles.load}`} style={{ "--load-delay": "280ms" }}>
            {hero.description}
          </p>
          <div className={styles.heroActions}>
            <span className={styles.load} style={{ "--load-delay": "380ms" }}>
              <ContactButton className={`btn btnGold ${styles.shine}`} />
            </span>
            <a href={`#${home.process.id}`} className={`btn btnOutlineLight ${styles.load}`} style={{ "--load-delay": "450ms" }}>
              {hero.secondaryCta}
            </a>
          </div>
        </div>
        <ExpertCard />
      </div>
    </section>
  );
}

export function Services() {
  const { services } = home;
  return (
    <section id={services.id} className={`${styles.services} onDark`} aria-labelledby="hizmetler-baslik">
      <div className={styles.container}>
        <div className={styles.servicesHead} data-reveal>
          <p className="eyebrow">{services.eyebrow}</p>
          <h2 id="hizmetler-baslik" className={styles.h3Title}>
            {services.title}
          </h2>
        </div>
        <ul className={styles.servicesGrid}>
          {services.items.map((item, index) => (
            <li key={item.title} className={styles.service} data-reveal style={{ "--reveal-delay": `${index * 80}ms` }}>
              <span className={styles.serviceIcon}>
                <Icon name={item.icon} size={18} />
              </span>
              <h3 className={styles.serviceTitle}>{item.title}</h3>
              <p className={styles.serviceText}>{item.text}</p>
              <a href={item.link.href} className={styles.serviceLink}>
                {item.link.label}
                <ArrowRight size={14} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Problems() {
  const { problems } = home;
  return (
    <section id={problems.id} className={styles.cream} aria-labelledby="sorunlar-baslik">
      <div className={styles.container}>
        <SectionHead id="sorunlar-baslik" eyebrow={problems.eyebrow} title={problems.title} description={problems.description} />
        <ProblemCheck items={problems.items} empty={problems.empty} result={problems.result} />
      </div>
    </section>
  );
}

export function Process() {
  const { process } = home;
  return (
    <section id={process.id} className={`${styles.night} onDark`} aria-labelledby="yontem-baslik">
      <div className={styles.container}>
        <SectionHead id="yontem-baslik" eyebrow={process.eyebrow} title={process.title} description={process.description} />
        <ol className={styles.flow}>
          <span className={styles.flowTrack} aria-hidden="true">
            <span className={styles.flowProgress} data-reveal="line" />
          </span>
          {process.steps.map((step, index) => (
            <li key={step.title} className={styles.flowStep} data-reveal style={{ "--reveal-delay": `${120 + index * 140}ms` }}>
              <span className={styles.flowNode} aria-hidden="true">
                <Icon name={step.icon} size={18} />
              </span>
              <span className={styles.flowNumber} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className={styles.flowTitle}>
                <span className={styles.srOnly}>{index + 1}. adım: </span>
                {step.title}
              </h3>
              <p className={styles.flowText}>{step.text}</p>
            </li>
          ))}
        </ol>
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
        <ul className={styles.cards3}>
          {principles.items.map((item, index) => (
            <li key={item.title} className={styles.card} data-reveal style={{ "--reveal-delay": `${index * 90}ms` }}>
              <span className={styles.cardIndex} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className={styles.cardIcon}>
                <Icon name={item.icon} />
              </span>
              <h3 className={styles.cardTitle}>{item.title}</h3>
              <p className={styles.cardText}>{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Difference() {
  const { difference } = home;
  return (
    <section id={difference.id} className={styles.paper} aria-labelledby="neden-baslik">
      <div className={styles.container}>
        <SectionHead id="neden-baslik" eyebrow={difference.eyebrow} title={difference.title} />
        <div className={styles.compare} role="table" aria-label="Sık karşılaşılan yaklaşım ve Persona yaklaşımı">
          <div className={styles.compareHead} role="row">
            <span role="columnheader">{difference.commonTitle}</span>
            <span role="columnheader" className={styles.compareOurs}>
              {difference.oursTitle}
            </span>
          </div>
          {difference.rows.map(([common, ours], index) => (
            <div key={common} className={styles.compareRow} role="row" data-reveal style={{ "--reveal-delay": `${index * 90}ms` }}>
              <span role="cell" className={styles.compareCommon}>
                <Minus size={16} aria-hidden="true" />
                {common}
              </span>
              <span role="cell" className={styles.compareOurs}>
                <Check size={16} aria-hidden="true" />
                {ours}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FitGroup({ title, items, kind, delay = 0 }) {
  const ItemIcon = kind === "not" ? Minus : Check;
  return (
    <div className={styles.fitGroup} data-kind={kind}>
      <h3 className={styles.fitTitle}>{title}</h3>
      <ul className={styles.fitList}>
        {items.map((item, index) => (
          <li key={item} className={styles.fitItem} data-reveal style={{ "--reveal-delay": `${delay + index * 70}ms` }}>
            <ItemIcon size={18} aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Audience() {
  const { audience } = home;
  return (
    <section className={`${styles.night} onDark`} aria-labelledby="kimler-baslik">
      <div className={styles.container}>
        <SectionHead id="kimler-baslik" eyebrow={audience.eyebrow} title={audience.title} />
        <div className={styles.audienceGrid}>
          <FitGroup title={audience.fitTitle} items={audience.fit} kind="fit" />
          <FitGroup title={audience.notFitTitle} items={audience.notFit} kind="not" delay={140} />
        </div>
      </div>
    </section>
  );
}

export function Offer() {
  const { offer } = home;
  return (
    <section className={styles.cream} aria-labelledby="teklif-baslik">
      <div className={styles.container}>
        <div className={`${styles.offer} onDark`} data-reveal>
          <span className={styles.offerLines} aria-hidden="true" />
          <div className={styles.offerCopy}>
            <p className="eyebrow">{offer.eyebrow}</p>
            <h2 id="teklif-baslik" className={styles.offerTitle}>
              {offer.title}
            </h2>
            <p className={styles.offerText}>{offer.description}</p>
          </div>
          <div className={styles.offerAction}>
            <ContactButton className={`btn btnGold ${styles.shine}`} />
            <ContactButton className="btn btnOutlineLight" label={meetingLabel} intent="gorusme" />
            <p className={styles.offerNote}>{offer.note}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Faq() {
  const { faq } = home;
  return (
    <section id={faq.id} className={styles.paper} aria-labelledby="sss-baslik">
      <div className={`${styles.container} ${styles.faqGrid}`}>
        <SectionHead id="sss-baslik" eyebrow={faq.eyebrow} title={faq.title} description={faq.description}>
          <div className={styles.faqAsk}>
            <p>Sorunuzun cevabını bulamadınız mı?</p>
            <ContactButton className="btn btnOutline" label={meetingLabel} intent="gorusme" />
          </div>
        </SectionHead>
        <div className={styles.faqList} data-reveal>
          {faq.items.map((item) => (
            // Yerel <details>: JavaScript olmadan ve klavyeyle açılır; birden
            // fazla soru aynı anda açık kalabilir.
            <details key={item.question} className={styles.faqItem}>
              <summary>
                {item.question}
                <ChevronDown size={18} aria-hidden="true" />
              </summary>
              <div className={styles.faqAnswer}>
                <p>{item.answer}</p>
              </div>
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
        <div className={styles.finalActions} data-reveal>
          <ContactButton className={`btn btnGold ${styles.shine}`} label={meetingLabel} intent="gorusme" />
        </div>
        <p className={styles.finalLink}>
          <Link href="/blog">
            {final.blogLink}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </p>
      </div>
    </section>
  );
}
