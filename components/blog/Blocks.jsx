import Image from "next/image";
import {
  ArrowRight,
  Check,
  CircleAlert,
  ImageIcon,
  Info,
  Lightbulb,
  Minus,
  Sparkles,
  SquarePlay,
} from "lucide-react";
import { blog, profile } from "@/data/content";
import { safeHref } from "@/lib/blog/content";
import { videoEmbed } from "@/lib/blog/blocks/model";
import PostContent from "./PostContent";
import styles from "./Blocks.module.css";

// Blokların tek görünümü. Yayındaki yazı sayfası ve editör tuvali aynı
// bileşenleri kullanır; `editing` yalnızca boş alanlar için yer tutucu gösterir.

const CALLOUT_ICONS = { info: Info, warning: CircleAlert, success: Lightbulb, note: Sparkles };

function linkProps(href, newTab) {
  const safe = safeHref(href);
  if (!safe) return null;
  const external = /^https?:\/\//i.test(safe);
  return {
    href: safe,
    ...(newTab || external ? { target: "_blank", rel: "noopener noreferrer" } : {}),
  };
}

function Placeholder({ label, Icon = ImageIcon }) {
  return (
    <div className={styles.placeholder}>
      <Icon size={22} strokeWidth={1.6} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function Picture({ image, sizes, fill = false, className }) {
  if (fill) return <Image src={image.url} alt={image.alt} fill sizes={sizes} className={className} />;
  return (
    <Image
      src={image.url}
      alt={image.alt}
      width={image.width ?? 1200}
      height={image.height ?? 675}
      sizes={sizes}
      className={className}
    />
  );
}

const hasText = (doc) => JSON.stringify(doc ?? {}).includes('"text"');

function Button({ text, href, newTab, variant = "primary", editing }) {
  if (!text) return null;
  const link = linkProps(href, newTab);
  // Bağlantısı olmayan buton yayında gösterilmez; editörde önizleme olarak durur.
  if (!link && !editing) return null;
  const Tag = link && !editing ? "a" : "span";
  return (
    <Tag className={styles.button} data-variant={variant} {...(Tag === "a" ? link : {})}>
      {text}
      <ArrowRight size={16} aria-hidden="true" />
    </Tag>
  );
}

const RENDERERS = {
  heading({ props }, ctx) {
    const Tag = `h${props.level}`;
    const link = linkProps(props.href);
    return (
      <Tag id={ctx.headingIds?.get(ctx.blockId)} className={styles.heading} data-level={props.level} style={{ textAlign: props.align }}>
        {link && !ctx.editing ? <a {...link}>{props.text}</a> : props.text}
      </Tag>
    );
  },

  text({ props }, ctx) {
    if (!hasText(props.doc)) return ctx.editing ? <p className={styles.emptyText}>Metin yazmak için tıklayın…</p> : null;
    return <div style={{ textAlign: props.align }}><PostContent doc={props.doc} citations={ctx.citations} /></div>;
  },

  image({ props }, ctx) {
    if (!props.image) return ctx.editing ? <Placeholder label="Görsel seçmek için ayarlar panelini kullanın" /> : null;
    const link = ctx.editing ? null : linkProps(props.href, props.newTab);
    const picture = (
      <Picture image={props.image} sizes="(max-width: 800px) 100vw, 760px" className={props.rounded ? styles.rounded : undefined} />
    );
    return (
      <figure className={styles.figure} data-size={props.size} data-align={props.align}>
        {link ? <a {...link}>{picture}</a> : picture}
        {props.caption ? <figcaption>{props.caption}</figcaption> : null}
      </figure>
    );
  },

  video({ props }, ctx) {
    const embed = videoEmbed(props.url);
    if (!embed) return ctx.editing ? <Placeholder Icon={SquarePlay} label="YouTube ya da Vimeo bağlantısı ekleyin" /> : null;
    return (
      <figure className={styles.figure} data-size="full">
        <div className={styles.video}>
          <iframe
            src={embed.src}
            title={props.caption || "Video"}
            loading="lazy"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            // Editörde videoya tıklamak oynatmak yerine bloğu seçer.
            style={ctx.editing ? { pointerEvents: "none" } : undefined}
          />
        </div>
        {props.caption ? <figcaption>{props.caption}</figcaption> : null}
      </figure>
    );
  },

  button({ props }, ctx) {
    return (
      <div style={{ textAlign: props.align }}>
        <Button text={props.text} href={props.href} newTab={props.newTab} variant={props.style} editing={ctx.editing} />
      </div>
    );
  },

  divider({ props }) {
    return props.style === "dots" ? (
      <div className={styles.dots} role="separator" aria-hidden="true">• • •</div>
    ) : (
      <hr className={styles.divider} />
    );
  },

  spacer({ props }, ctx) {
    return <div className={styles.spacer} data-size={props.size} data-editing={ctx.editing} aria-hidden="true" />;
  },

  quote({ props }) {
    if (!props.text.trim()) return null;
    return (
      <figure className={styles.quote} data-style={props.style}>
        <blockquote>{props.text}</blockquote>
        {props.source ? <figcaption>— {props.source}</figcaption> : null}
      </figure>
    );
  },

  callout({ props }) {
    const Icon = CALLOUT_ICONS[props.variant] ?? Info;
    return (
      <aside className={styles.callout} data-variant={props.variant}>
        <Icon size={20} aria-hidden="true" />
        <div>
          {props.title ? <p className={styles.calloutTitle}>{props.title}</p> : null}
          <p className={styles.preLine}>{props.text}</p>
        </div>
      </aside>
    );
  },

  imageText({ props }, ctx) {
    return (
      <section className={styles.imageText} data-position={props.position} data-ratio={props.ratio} data-valign={props.valign}>
        <div className={styles.imageTextMedia}>
          {props.image ? (
            <Picture image={props.image} sizes="(max-width: 800px) 100vw, 420px" />
          ) : ctx.editing ? (
            <Placeholder label="Görsel seçin" />
          ) : null}
        </div>
        <div className={styles.imageTextBody}>
          {props.title ? <h3 className={styles.sectionTitle}>{props.title}</h3> : null}
          {hasText(props.body) ? <PostContent doc={props.body} citations={ctx.citations} /> : null}
        </div>
      </section>
    );
  },

  columns({ props }, ctx) {
    return (
      <section
        className={styles.columns}
        data-count={props.columns.length}
        data-ratio={props.columns.length === 2 ? props.ratio : "equal"}
        data-cards={props.cards}
      >
        {props.columns.map((column) => (
          <div key={column.id} className={styles.column}>
            {column.image ? <Picture image={column.image} sizes="(max-width: 800px) 100vw, 380px" className={styles.columnImage} /> : null}
            {column.title ? <h3 className={styles.columnTitle}>{column.title}</h3> : null}
            {hasText(column.body) ? <PostContent doc={column.body} citations={ctx.citations} /> : ctx.editing && !column.title && !column.image ? <p className={styles.emptyText}>Boş sütun</p> : null}
          </div>
        ))}
      </section>
    );
  },

  hero({ props }, ctx) {
    return (
      <section className={styles.hero} data-height={props.height} data-align={props.align} data-image={Boolean(props.image)}>
        {props.image ? <Picture image={props.image} fill sizes="(max-width: 800px) 100vw, 860px" className={styles.heroImage} /> : null}
        {props.image && props.overlay ? <span className={styles.heroOverlay} aria-hidden="true" /> : null}
        <div className={styles.heroBody}>
          {props.eyebrow ? <p className={styles.heroEyebrow}>{props.eyebrow}</p> : null}
          <h2 className={styles.heroTitle}>{props.title}</h2>
          {props.description ? <p className={styles.heroText}>{props.description}</p> : null}
          <Button text={props.buttonText} href={props.buttonHref} variant="light" editing={ctx.editing} />
        </div>
      </section>
    );
  },

  gallery({ props }, ctx) {
    const items = props.items.filter((item) => item.image || ctx.editing);
    if (items.length === 0) return ctx.editing ? <Placeholder label="Galeriye görsel eklemek için ayarlar panelini kullanın" /> : null;
    return (
      <section className={styles.gallery} data-columns={props.columns}>
        {items.map((item) => (
          <figure key={item.id} className={styles.galleryItem}>
            <div className={styles.galleryMedia} style={{ aspectRatio: props.ratio }}>
              {item.image ? <Picture image={item.image} fill sizes="(max-width: 800px) 50vw, 300px" /> : <Placeholder label="Görsel seçin" />}
            </div>
            {item.title || item.caption ? (
              <figcaption>
                {item.title ? <strong>{item.title}</strong> : null}
                {item.caption ? <span>{item.caption}</span> : null}
              </figcaption>
            ) : null}
          </figure>
        ))}
      </section>
    );
  },

  cta({ props }, ctx) {
    return (
      <aside className={styles.cta} data-tone={props.tone} data-layout={props.layout}>
        <div>
          <h2 className={styles.ctaTitle}>{props.title}</h2>
          {props.description ? <p className={styles.ctaText}>{props.description}</p> : null}
        </div>
        <div className={styles.ctaActions}>
          <Button text={props.buttonText} href={props.buttonHref} variant={props.tone === "soft" ? "primary" : "light"} editing={ctx.editing} />
          <Button text={props.secondText} href={props.secondHref} variant="ghost" editing={ctx.editing} />
        </div>
      </aside>
    );
  },

  faq({ props }, ctx) {
    const items = props.items.filter((item) => item.question.trim() || ctx.editing);
    if (items.length === 0) return ctx.editing ? <Placeholder Icon={Info} label="Soru eklemek için ayarlar panelini kullanın" /> : null;
    // Geniş alanda iki sütun (solda başlık, sağda numaralı sorular), dar alanda dikey.
    return (
      <section className={styles.faq}>
        <div className={styles.faqHead}>
          <p className={styles.faqEyebrow}>SSS</p>
          {props.title ? <h2 className={styles.faqTitle}>{props.title}</h2> : null}
          <p className={styles.faqCount}>{items.length} soru</p>
        </div>
        <div className={styles.faqList}>
          {items.map((item, index) => (
            // Yerel <details>: klavyeyle açılır, JavaScript gerektirmez.
            <details key={item.id} className={styles.faqItem} open={ctx.editing || undefined}>
              <summary>
                <span className={styles.faqNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.faqQuestion}>{item.question || "Soru"}</span>
                <span className={styles.faqIcon} aria-hidden="true" />
              </summary>
              <p className={styles.preLine}>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>
    );
  },

  steps({ props }, ctx) {
    if (props.items.length === 0) return ctx.editing ? <Placeholder Icon={Info} label="Adım eklemek için ayarlar panelini kullanın" /> : null;
    return (
      <ol className={styles.steps}>
        {props.items.map((item, index) => (
          <li key={item.id} className={styles.step}>
            <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
            <div className={styles.stepBody}>
              {item.title ? <h3 className={styles.columnTitle}>{item.title}</h3> : null}
              {item.text ? <p className={styles.preLine}>{item.text}</p> : null}
              {item.image ? <Picture image={item.image} sizes="(max-width: 800px) 100vw, 640px" className={styles.stepImage} /> : null}
            </div>
          </li>
        ))}
      </ol>
    );
  },

  prosCons({ props }) {
    const column = (title, items, kind, Icon) => (
      <div className={styles.prosConsColumn} data-kind={kind}>
        <h3 className={styles.columnTitle}>{title}</h3>
        <ul>
          {items.filter((item) => item.trim()).map((item, index) => (
            <li key={index}>
              <Icon size={16} aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    );
    return (
      <section className={styles.prosCons}>
        {column(props.prosTitle, props.pros, "pros", Check)}
        {column(props.consTitle, props.cons, "cons", Minus)}
      </section>
    );
  },

  stats({ props }) {
    if (props.items.length === 0) return null;
    return (
      <dl className={styles.stats} data-count={props.items.length}>
        {props.items.map((item) => (
          <div key={item.id} className={styles.stat}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    );
  },

  toc({ props }, ctx) {
    const headings = ctx.headings ?? [];
    if (headings.length === 0) return ctx.editing ? <Placeholder Icon={Info} label="İçindekiler, eklediğiniz başlık bloklarından oluşur" /> : null;
    return (
      <nav className={styles.toc} aria-label={props.title || "İçindekiler"}>
        {props.title ? <p className={styles.calloutTitle}>{props.title}</p> : null}
        <ol>
          {headings.map((heading) => (
            <li key={heading.id} data-level={heading.level}>
              <a href={`#${heading.id}`}>{heading.label}</a>
            </li>
          ))}
        </ol>
      </nav>
    );
  },

  author({ props }) {
    return (
      <aside className={styles.author}>
        <span className={styles.avatar}>
          {blog.avatar ? <Image src={blog.avatar} alt="" fill sizes="56px" /> : <span aria-hidden="true">{profile.firstName[0]}</span>}
        </span>
        <div>
          <p className={styles.calloutTitle}>{profile.fullName}</p>
          <p className={styles.authorTagline}>{blog.authorTagline}</p>
          {props.showBio ? <p className={styles.authorBio}>{blog.authorBio}</p> : null}
        </div>
      </aside>
    );
  },
};

export function Block({ block, ctx = {} }) {
  const render = RENDERERS[block.type];
  // Tanınmayan blok türü sayfayı bozmaz; yalnızca atlanır.
  if (!render) return null;
  return render(block, { ...ctx, blockId: block.id });
}

export default function Blocks({ blocks, headings = [], citations = 0 }) {
  const headingIds = new Map(headings.filter((item) => item.blockId).map((item) => [item.blockId, item.id]));
  const ctx = { headingIds, headings, editing: false, citations };
  return (
    <div className={styles.blocks}>
      {blocks.map((block) => (
        <div key={block.id} className={styles.block} data-type={block.type} data-spacing={block.props.spacing}>
          <Block block={block} ctx={ctx} />
        </div>
      ))}
    </div>
  );
}

export { styles as blockStyles };
