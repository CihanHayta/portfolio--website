"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Eye, FilePlus2, Search, Wand2, X } from "lucide-react";
import { Block } from "@/components/blog/Blocks";
import { contentHeadings } from "@/lib/blog/blocks/model";
import { BLOCKS } from "@/lib/blog/blocks/registry";
import { TEMPLATES, TEMPLATE_CATEGORIES, instantiateTemplate } from "@/lib/blog/blocks/templates";
import { slugify } from "@/lib/blog/slug";
import styles from "./TemplateGallery.module.css";

const CATEGORY_LABEL = Object.fromEntries(TEMPLATE_CATEGORIES);
const normalize = (value) => slugify(value).replace(/-/g, " ");

// Paragraf bloğu içeriğine göre liste, tablo ya da kod olarak adlandırılır.
function blockLabel(block) {
  if (block.type === "text") {
    const first = block.props.doc?.content?.[0]?.type;
    if (first === "bulletList" || first === "orderedList") return "Liste";
    if (first === "table") return "Tablo";
    if (first === "codeBlock") return "Kod";
  }
  return BLOCKS[block.type]?.label ?? block.type;
}

// Şablonun kart ve önizlemede gösterilen özeti. Galeri her açıldığında bir kez üretilir.
function describe(template) {
  const blocks = instantiateTemplate(template);
  const headings = blocks
    .filter((block) => block.type === "heading")
    .map((block) => ({ text: block.props.text, level: Number(block.props.level) }));
  const kinds = [...new Set(blocks.map(blockLabel))];
  return {
    ...template,
    blocks,
    headings,
    kinds,
    search: normalize(`${template.label} ${template.description} ${template.useCase} ${kinds.join(" ")}`),
  };
}

export default function TemplateGallery() {
  const items = useMemo(() => TEMPLATES.map(describe), []);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [previewKey, setPreviewKey] = useState(null);
  const dialogRef = useRef(null);

  const term = normalize(query.trim());
  const visible = items.filter((item) => (!category || item.category === category) && (!term || item.search.includes(term)));
  const preview = items.find((item) => item.key === previewKey) ?? null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (preview && !dialog.open) dialog.showModal();
    if (!preview && dialog.open) dialog.close();
  }, [preview]);

  const counts = useMemo(() => {
    const map = new Map();
    for (const item of items) map.set(item.category, (map.get(item.category) ?? 0) + 1);
    return map;
  }, [items]);

  return (
    <>
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={16} aria-hidden="true" />
          <span className={styles.srOnly}>Şablon ara</span>
          <input
            type="search"
            value={query}
            placeholder="Şablon ara: rehber, SSS, karşılaştırma…"
            className={styles.searchInput}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className={styles.chips} role="group" aria-label="Kategori">
          <button type="button" className={styles.chip} aria-pressed={category === ""} onClick={() => setCategory("")}>
            Tümü <span>{items.length}</span>
          </button>
          {TEMPLATE_CATEGORIES.filter(([key]) => counts.has(key)).map(([key, label]) => (
            <button key={key} type="button" className={styles.chip} aria-pressed={category === key} onClick={() => setCategory(category === key ? "" : key)}>
              {label} <span>{counts.get(key)}</span>
            </button>
          ))}
        </div>
      </div>

      <p className={styles.resultCount} aria-live="polite">
        {visible.length === items.length ? `${items.length} şablon` : `${visible.length} / ${items.length} şablon gösteriliyor`}
      </p>

      {visible.length === 0 ? (
        <div className={styles.empty}>
          <h2>Eşleşen şablon yok</h2>
          <p>Aramayı kısaltmayı ya da başka bir kategori seçmeyi deneyin.</p>
          <button type="button" className={styles.secondary} onClick={() => { setQuery(""); setCategory(""); }}>
            Filtreleri temizle
          </button>
        </div>
      ) : (
        <ul className={styles.grid}>
          {visible.map((item) => (
            <li key={item.key} className={styles.card} data-template={item.key}>
              <div className={styles.wire} aria-hidden="true">
                {item.blocks.slice(0, 9).map((block) => (
                  <span key={block.id} data-kind={block.type} data-level={block.props.level} />
                ))}
              </div>
              <div className={styles.cardBody}>
                <span className={styles.badge}>{CATEGORY_LABEL[item.category]}</span>
                <h2 className={styles.cardTitle}>{item.label}</h2>
                <p className={styles.cardText}>{item.description}</p>
                <p className={styles.useCase}>{item.useCase}</p>
                <p className={styles.metaLine}>
                  {item.headings.length} bölüm başlığı · {item.blocks.length} blok
                </p>
              </div>
              <div className={styles.cardActions}>
                <button type="button" className={styles.secondary} onClick={() => setPreviewKey(item.key)} aria-label={`${item.label} şablonunu önizle`}>
                  <Eye size={16} aria-hidden="true" />
                  Önizle
                </button>
                <Link href={`/admin/blog/new?template=${item.key}`} className={styles.primary} aria-label={`${item.label} şablonuyla yeni taslak oluştur`}>
                  <FilePlus2 size={16} aria-hidden="true" />
                  Şablonu kullan
                </Link>
                <Link href={`/admin/blog/new?template=${item.key}&studio=1`} className={styles.studioLink} aria-label={`${item.label} şablonuyla AI Blog Stüdyosu'nu aç`}>
                  <Wand2 size={15} aria-hidden="true" />
                  AI Stüdyosu ile başla
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="template-preview-title"
        onCancel={(event) => {
          event.preventDefault();
          setPreviewKey(null);
        }}
        onClick={(event) => {
          // Arka plana tıklamak önizlemeyi kapatır.
          if (event.target === event.currentTarget) setPreviewKey(null);
        }}
      >
        {preview ? (
          <div className={styles.dialogInner}>
            <header className={styles.dialogHead}>
              <div>
                <span className={styles.badge}>{CATEGORY_LABEL[preview.category]}</span>
                <h2 id="template-preview-title" className={styles.dialogTitle}>{preview.label}</h2>
              </div>
              <button type="button" className={styles.close} aria-label="Önizlemeyi kapat" onClick={() => setPreviewKey(null)}>
                <X size={18} />
              </button>
            </header>

            <div className={styles.dialogBody}>
              <div className={styles.page} aria-label="Şablon önizlemesi">
                <p className={styles.pageNote}>Yazı başlığı (H1) editördeki “Başlık” alanından gelir.</p>
                <h3 className={styles.pageTitle}>Yazınızın başlığı</h3>
                {preview.blocks.map((block) => (
                  <Block
                    key={block.id}
                    block={block}
                    ctx={{ editing: true, headings: contentHeadings({ type: "blocks", version: 1, blocks: preview.blocks }), headingIds: new Map() }}
                  />
                ))}
              </div>

              <aside className={styles.info}>
                <h3>Ne zaman kullanılır?</h3>
                <p>{preview.useCase}</p>
                <h3>Bölümler</h3>
                <ol className={styles.outline}>
                  {preview.headings.map((heading, index) => (
                    <li key={index} data-level={heading.level}>
                      <span>H{heading.level}</span>
                      {heading.text}
                    </li>
                  ))}
                </ol>
                <h3>Kullanılan bloklar</h3>
                <ul className={styles.kinds}>
                  {preview.kinds.map((kind) => (
                    <li key={kind}>{kind}</li>
                  ))}
                </ul>
                <h3>SEO notları</h3>
                <ul className={styles.notes}>
                  <li>Sayfada tek H1 vardır; şablon bölümleri H2 ve H3 kullanır.</li>
                  <li>Örnek metinler yer tutucudur; değiştirilmeden yayınlanamaz.</li>
                  <li>SEO başlığı, açıklaması ve kalıcı bağlantı editörün “Sayfa ayarları” panelinde düzenlenir.</li>
                </ul>
                <Link href={`/admin/blog/new?template=${preview.key}`} className={styles.primary}>
                  <FilePlus2 size={16} aria-hidden="true" />
                  Bu şablonla taslak oluştur
                </Link>
                <Link href={`/admin/blog/new?template=${preview.key}&studio=1`} className={styles.secondary}>
                  <Wand2 size={16} aria-hidden="true" />
                  AI Stüdyosu ile başla
                </Link>
              </aside>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
