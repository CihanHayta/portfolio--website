"use client";

import { useContext, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, ExternalLink, Eye, Link2, Plus, Trash2, X } from "lucide-react";
import { createCategory } from "@/app/admin/blog/actions";
import { BLOCKS, fieldsFor } from "@/lib/blog/blocks/registry";
import { STATE_LABELS, formatDateTime } from "@/lib/blog/format";
import { slugify } from "@/lib/blog/slug";
import { toast } from "../toast";
import { TYPE_ICONS } from "./blockIcons";
import { Field, ImageControl } from "./fields";
import { ImageAiContext } from "../images/imageAiContext";
import styles from "./builder.module.css";

const MAX_TAGS = 10;

function BlockSettings({ block, onChange, onRemove }) {
  const [tab, setTab] = useState("content");
  const fields = fieldsFor(block.type);
  // Görsel alanının "Yapay zekâyla oluştur" penceresi bu bloğun bölümünü bilsin.
  const parentContext = useContext(ImageAiContext);
  const blockContext = useMemo(() => (parentContext ? { ...parentContext, blockId: block.id } : null), [parentContext, block.id]);

  if (!fields) {
    return (
      <div className={styles.panelBody}>
        <p className={styles.muted}>Bu blok türü tanınmıyor; yalnızca silinebilir.</p>
        <button type="button" className={styles.btnSmall} data-danger="true" onClick={() => onRemove(block.id)}>
          <Trash2 size={14} aria-hidden="true" />
          Bloğu sil
        </button>
      </div>
    );
  }

  const Icon = TYPE_ICONS[block.type];
  const content = fields.filter((field) => field.tab !== "design" && !field.inline);
  const design = fields.filter((field) => field.tab === "design");
  const inline = fields.some((field) => field.inline);
  const visible = tab === "design" ? design : content;

  return (
    <div className={styles.panelBody}>
      <div className={styles.blockHead}>
        <h2 className={styles.blockTitle}>
          {Icon ? <Icon size={17} aria-hidden="true" /> : null}
          {BLOCKS[block.type].label}
        </h2>
        <button type="button" className={styles.iconSmall} data-danger="true" aria-label="Bloğu sil" title="Bloğu sil" onClick={() => onRemove(block.id)}>
          <Trash2 size={16} />
        </button>
      </div>

      <div className={styles.subTabs} role="tablist" aria-label="Blok ayarları">
        <button type="button" role="tab" aria-selected={tab === "content"} className={styles.subTab} onClick={() => setTab("content")}>
          İçerik
        </button>
        <button type="button" role="tab" aria-selected={tab === "design"} className={styles.subTab} onClick={() => setTab("design")}>
          Tasarım
        </button>
      </div>

      {tab === "content" && inline ? (
        <p className={styles.muted}>Metni doğrudan tuvaldeki blok üzerinde yazın; biçimlendirme araçları bloğun üstünde görünür.</p>
      ) : null}
      {visible.length === 0 && !(tab === "content" && inline) ? (
        <p className={styles.muted}>Bu sekmede ayar yok.</p>
      ) : null}

      <ImageAiContext.Provider value={blockContext}>
        {visible.map((field) => (
          <Field
            key={field.key}
            field={field}
            value={block.props[field.key]}
            idPrefix={`blk-${block.id}`}
            onChange={(value) => onChange(block.id, { [field.key]: value }, field.key)}
          />
        ))}
      </ImageAiContext.Provider>
    </div>
  );
}

// Arama sonucunda görünen uzunluklar için öneri: başlık ~60, açıklama 120–155
// karakter. Sınırlar zorunlu değildir; yalnızca dışına çıkıldığında uyarır.
function seoHint(length, min, max) {
  if (length === 0) return { text: "Boş", warn: false };
  if (length > max) return { text: `${length} karakter · önerilen en fazla ${max}`, warn: true };
  if (length < min) return { text: `${length} karakter · önerilen en az ${min}`, warn: true };
  return { text: `${length} karakter · uygun`, warn: false };
}

function PageSettings({ form, meta, state, categories, siteHost, postId, onUpdate, onCategoryCreated, schedule, onSchedule, onTrash, busy }) {
  const titleHint = seoHint(form.seoTitle.length, 30, 60);
  const descriptionHint = seoHint(form.seoDescription.length, 120, 155);
  const serpTitle = form.seoTitle.trim() || form.title.trim() || "Yazı başlığı";
  const serpDescription = form.seoDescription.trim() || form.excerpt.trim() || "Meta açıklaması ya da özet burada görünür.";
  const [tagDraft, setTagDraft] = useState("");
  const [newCategory, setNewCategory] = useState(null);

  const addTag = () => {
    const name = tagDraft.trim().replace(/^#/, "").slice(0, 40);
    setTagDraft("");
    if (!name || !slugify(name) || form.tags.length >= MAX_TAGS) return;
    if (form.tags.some((tag) => slugify(tag) === slugify(name))) return;
    onUpdate({ tags: [...form.tags, name] });
  };

  const addCategory = async (event) => {
    event.preventDefault();
    const result = await createCategory(newCategory);
    if (!result.ok) return toast(result.error, "error");
    onCategoryCreated(result.category);
    setNewCategory(null);
    onUpdate({ categoryId: result.category.id });
    toast("Kategori eklendi.");
  };

  return (
    <div className={styles.panelBody}>
      <section className={styles.section} aria-label="Yayın durumu">
        <ul className={styles.statusList}>
          <li>
            <span className={styles.dot} data-state={state} aria-hidden="true" />
            Durum: <strong>{STATE_LABELS[state]}</strong>
          </li>
          {meta.status === "published" ? (
            <li>
              <CalendarClock size={16} aria-hidden="true" />
              {state === "scheduled" ? "Yayın zamanı" : "Yayımlandı"}: <strong>{formatDateTime(meta.published_at)}</strong>
            </li>
          ) : null}
        </ul>
        {meta.status === "draft" ? (
          <div className={styles.field}>
            <label htmlFor="schedule-at" className={styles.label}>
              Planlı yayın (isteğe bağlı)
            </label>
            <input id="schedule-at" type="datetime-local" className={styles.input} value={schedule} onChange={(event) => onSchedule(event.target.value)} />
            <p className={styles.hint}>
              Boş bırakılırsa “Yayınla” yazıyı hemen yayına alır. Tarih seçilirse yazı o zamana kadar ziyaretçilere görünmez.
            </p>
          </div>
        ) : null}
        <div className={styles.linkRow}>
          {postId && state === "published" ? (
            <a href={`/blog/${meta.slug}`} target="_blank" rel="noreferrer" className={styles.textLink}>
              <ExternalLink size={14} aria-hidden="true" />
              Yayındaki yazıyı aç
            </a>
          ) : postId ? (
            <Link href={`/admin/blog/${postId}/preview`} target="_blank" className={styles.textLink}>
              <Eye size={14} aria-hidden="true" />
              Tam sayfa önizleme
            </Link>
          ) : null}
          {postId ? (
            <button type="button" className={styles.textLink} data-danger="true" disabled={busy} onClick={onTrash}>
              <Trash2 size={14} aria-hidden="true" />
              Çöp kutusuna taşı
            </button>
          ) : null}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="set-url">
        <h3 id="set-url" className={styles.sectionTitle}>Kalıcı Bağlantı</h3>
        <div className={styles.slugField}>
          <span className={styles.slugPrefix}>
            <Link2 size={14} aria-hidden="true" />
            {siteHost}/blog/
          </span>
          <input
            id="post-slug"
            type="text"
            className={styles.slugInput}
            value={form.slug}
            maxLength={120}
            placeholder="yazi-adresi"
            aria-label="Kalıcı bağlantı"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(event) => onUpdate({ slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }, { slugTouched: true })}
            onBlur={() => form.slug !== slugify(form.slug) && onUpdate({ slug: slugify(form.slug) })}
          />
        </div>
        <div className={styles.linkRow}>
          <button type="button" className={styles.textLink} onClick={() => onUpdate({ slug: slugify(form.title) }, { slugTouched: true })}>
            Başlıktan oluştur
          </button>
        </div>
        {meta.published_at ? (
          <p className={styles.hint}>Yayımlanmış yazının bağlantısı değişirse eski adres yenisine yönlendirilir.</p>
        ) : null}
      </section>

      <section className={styles.section} aria-labelledby="set-excerpt">
        <h3 id="set-excerpt" className={styles.sectionTitle}>Özet</h3>
        <textarea
          id="post-excerpt"
          className={`${styles.input} ${styles.textarea}`}
          rows={3}
          maxLength={200}
          value={form.excerpt}
          aria-labelledby="set-excerpt"
          placeholder="Blog listesinde ve paylaşımlarda görünen kısa özet…"
          onChange={(event) => onUpdate({ excerpt: event.target.value })}
        />
        <p className={styles.counter}>{form.excerpt.length}/200</p>
      </section>

      <section className={styles.section} aria-labelledby="set-cover">
        <h3 id="set-cover" className={styles.sectionTitle}>Kapak Görseli</h3>
        <ImageControl
          label="Kapak görseli seç"
          purpose="cover"
          withAlt={false}
          value={form.cover ? { ...form.cover, alt: form.coverAlt } : null}
          onChange={(value) => onUpdate({ cover: value, coverAlt: value ? form.coverAlt || value.alt || "" : "" })}
        />
        {form.cover ? (
          <label className={styles.subField}>
            <span>Kapak alt metni</span>
            <input id="cover-alt" type="text" className={styles.input} value={form.coverAlt} maxLength={300} placeholder="Görseli kısaca tarif edin" onChange={(event) => onUpdate({ coverAlt: event.target.value })} />
          </label>
        ) : (
          <p className={styles.hint}>Önerilen boyut 1200 × 630. JPG, PNG, WebP; en fazla 4 MB.</p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="set-category">
        <h3 id="set-category" className={styles.sectionTitle}>Kategori</h3>
        <div className={styles.options} role="radiogroup" aria-labelledby="set-category">
          {[{ id: "", name: "Kategorisiz" }, ...categories].map((category) => (
            <label key={category.id || "none"} className={styles.option}>
              <input type="radio" name="category" checked={form.categoryId === category.id} onChange={() => onUpdate({ categoryId: category.id })} />
              <span>{category.name}</span>
            </label>
          ))}
        </div>
        {newCategory === null ? (
          <button type="button" className={styles.textLink} onClick={() => setNewCategory("")}>
            <Plus size={14} aria-hidden="true" />
            Yeni kategori ekle
          </button>
        ) : (
          <form className={styles.inlineForm} onSubmit={addCategory}>
            <input type="text" className={styles.input} value={newCategory} autoFocus required maxLength={60} placeholder="Kategori adı" aria-label="Yeni kategori adı" onChange={(event) => setNewCategory(event.target.value)} />
            <button type="submit" className={styles.btnSmall}>Ekle</button>
            <button type="button" className={styles.iconSmall} aria-label="Vazgeç" onClick={() => setNewCategory(null)}>
              <X size={15} />
            </button>
          </form>
        )}
      </section>

      <section className={styles.section} aria-labelledby="set-tags">
        <h3 id="set-tags" className={styles.sectionTitle}>Etiketler</h3>
        <input
          type="text"
          className={styles.input}
          value={tagDraft}
          maxLength={40}
          placeholder="Etiket yazıp Enter’a basın…"
          aria-labelledby="set-tags"
          disabled={form.tags.length >= MAX_TAGS}
          enterKeyHint="done"
          onChange={(event) => setTagDraft(event.target.value)}
          onBlur={addTag}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addTag();
            }
          }}
        />
        {form.tags.length > 0 ? (
          <ul className={styles.tags}>
            {form.tags.map((tag) => (
              <li key={tag} className={styles.tag}>
                {tag}
                <button type="button" aria-label={`${tag} etiketini kaldır`} onClick={() => onUpdate({ tags: form.tags.filter((other) => other !== tag) })}>
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <p className={styles.hint}>En fazla {MAX_TAGS} etiket. ({form.tags.length}/{MAX_TAGS})</p>
      </section>

      <section className={styles.section} aria-labelledby="set-seo">
        <h3 id="set-seo" className={styles.sectionTitle}>SEO</h3>
        <div className={styles.field}>
          <label htmlFor="seo-title-input" className={styles.label}>SEO başlığı</label>
          <input id="seo-title-input" type="text" className={styles.input} value={form.seoTitle} maxLength={70} placeholder="Boşsa yazı başlığı kullanılır" onChange={(event) => onUpdate({ seoTitle: event.target.value })} />
          <p className={styles.counter} data-warn={titleHint.warn || undefined} aria-live="polite">{titleHint.text}</p>
        </div>
        <div className={styles.field}>
          <label htmlFor="seo-description-input" className={styles.label}>Meta açıklaması</label>
          <textarea id="seo-description-input" className={`${styles.input} ${styles.textarea}`} rows={3} value={form.seoDescription} maxLength={160} placeholder="Boşsa özet kullanılır" onChange={(event) => onUpdate({ seoDescription: event.target.value })} />
          <p className={styles.counter} data-warn={descriptionHint.warn || undefined} aria-live="polite">{descriptionHint.text}</p>
        </div>
        <figure className={styles.serp} aria-label="Arama sonucu önizlemesi">
          <figcaption>Arama sonucu önizlemesi</figcaption>
          <span className={styles.serpUrl}>{siteHost} › blog › {form.slug || "kalici-baglanti"}</span>
          <span className={styles.serpTitle}>{serpTitle}</span>
          <span className={styles.serpText}>{serpDescription}</span>
        </figure>
        <details className={styles.advanced}>
          <summary>Gelişmiş</summary>
          <div className={styles.field}>
            <label htmlFor="canonical-input" className={styles.label}>Canonical URL</label>
            <input id="canonical-input" type="url" className={styles.input} value={form.canonicalUrl} maxLength={500} placeholder="https://… (boşsa yazının kendi adresi)" onChange={(event) => onUpdate({ canonicalUrl: event.target.value })} />
          </div>
          <label className={styles.toggle}>
            <span>Blog sayfasında “Öne Çıkan Yazılar”da göster</span>
            <input type="checkbox" role="switch" checked={form.isFeatured} onChange={(event) => onUpdate({ isFeatured: event.target.checked })} />
          </label>
        </details>
      </section>
    </div>
  );
}

export default function Inspector({ tab, onTab, block, onBlockChange, onBlockRemove, page }) {
  return (
    <div className={styles.inspector}>
      <div className={styles.tabs} role="tablist" aria-label="Ayarlar">
        <button type="button" role="tab" id="insp-tab-block" aria-controls="insp-panel" aria-selected={tab === "block"} className={styles.tab} onClick={() => onTab("block")}>
          Blok Ayarları
        </button>
        <button type="button" role="tab" id="insp-tab-page" aria-controls="insp-panel" aria-selected={tab === "page"} className={styles.tab} onClick={() => onTab("page")}>
          Sayfa Ayarları
        </button>
      </div>
      <div id="insp-panel" role="tabpanel" aria-labelledby={tab === "block" ? "insp-tab-block" : "insp-tab-page"} className={styles.panelScroll}>
        {tab === "page" ? (
          <PageSettings {...page} />
        ) : block ? (
          // key: blok değişince alt sekme ve açık liste öğesi sıfırlanır.
          <BlockSettings key={block.id} block={block} onChange={onBlockChange} onRemove={onBlockRemove} />
        ) : (
          <div className={styles.panelBody}>
            <p className={styles.muted}>Ayarlarını görmek için tuvalden bir blok seçin. Başlık, kapak, kategori ve SEO için “Sayfa Ayarları” sekmesini kullanın.</p>
          </div>
        )}
      </div>
    </div>
  );
}
