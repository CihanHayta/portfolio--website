"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  Eye,
  Globe,
  ImagePlus,
  Link2,
  LoaderCircle,
  Plus,
  RotateCw,
  Send,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import {
  createCategory,
  publishPost,
  savePost,
  trashPost,
  unpublishPost,
} from "@/app/admin/blog/actions";
import { STATE_LABELS, formatDateTime, postState } from "@/lib/blog/format";
import { slugify } from "@/lib/blog/slug";
import ConfirmDialog from "./ConfirmDialog";
import MediaPickerDialog from "./MediaPickerDialog";
import RichTextEditor from "./RichTextEditor";
import { toast } from "./toast";
import { uploadMedia } from "./upload";
import styles from "./PostEditor.module.css";

const AUTOSAVE_DELAY = 2500;
const MAX_TAGS = 10;
const isAutoSlug = (slug) => /^taslak-[0-9a-f]{8}$/.test(slug);

// datetime-local alanı yerel saatle çalışır; ISO'ya çevirirken tarayıcının
// saat dilimi kullanılır.
function toLocalInput(iso) {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function PostEditor({ post, categories: initialCategories, siteHost }) {
  const router = useRouter();

  const [form, setForm] = useState({
    title: post.title,
    slug: isAutoSlug(post.slug) ? "" : post.slug,
    excerpt: post.excerpt,
    categoryId: post.category_id ?? "",
    tags: post.tags.map((tag) => tag.name),
    cover: post.cover,
    coverAlt: post.cover_alt,
    isFeatured: post.is_featured,
    seoTitle: post.seo_title,
    seoDescription: post.seo_description,
    canonicalUrl: post.canonical_url,
  });
  const [meta, setMeta] = useState({
    status: post.status,
    published_at: post.published_at,
    updated_at: post.updated_at,
    slug: post.slug,
  });
  // saved | dirty | saving | error | conflict
  const [saveState, setSaveState] = useState({ kind: "saved", error: "" });
  const [categories, setCategories] = useState(initialCategories);
  const [newCategory, setNewCategory] = useState(null);
  const [tagDraft, setTagDraft] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(Boolean(post.canonical_url || post.is_featured));
  const [busy, setBusy] = useState(null); // "publish" | "unpublish" | "trash" | "manual" | null
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [coverProgress, setCoverProgress] = useState(null);
  const [coverDragging, setCoverDragging] = useState(false);
  const [coverPicker, setCoverPicker] = useState(false);

  const formRef = useRef(form);
  const contentRef = useRef(post.content);
  const revisionRef = useRef(post.revision);
  const savedSlugRef = useRef(post.slug);
  const slugTouchedRef = useRef(!isAutoSlug(post.slug));
  const dirtyRef = useRef(false);
  const savingRef = useRef(null);
  const conflictRef = useRef(false);
  const timerRef = useRef(null);
  const statusRef = useRef(post.status);
  const coverInput = useRef(null);

  const state = postState(meta);
  // Yayındaki yazıda otomatik kayıt kapalıdır: yarım kalmış bir düzenleme
  // ziyaretçiye görünmesin diye değişiklikler yalnızca "Güncelle" ile yayına girer.
  const autosaves = meta.status === "draft";

  const flush = useCallback(async () => {
    clearTimeout(timerRef.current);
    if (conflictRef.current) return { ok: false };
    while (savingRef.current) await savingRef.current;
    if (!dirtyRef.current) return { ok: true };

    dirtyRef.current = false;
    setSaveState({ kind: "saving", error: "" });

    const current = formRef.current;
    const request = savePost(post.id, revisionRef.current, {
      title: current.title,
      slug: slugify(current.slug) || savedSlugRef.current,
      excerpt: current.excerpt,
      // ProseMirror öznitelik nesneleri prototipsizdir; sunucu işlemine düz
      // JSON olarak gitmeleri için kopyalanır.
      content: JSON.parse(JSON.stringify(contentRef.current)),
      categoryId: current.categoryId || null,
      tags: current.tags,
      coverMediaId: current.cover?.id ?? null,
      coverAlt: current.coverAlt,
      isFeatured: current.isFeatured,
      seoTitle: current.seoTitle,
      seoDescription: current.seoDescription,
      canonicalUrl: current.canonicalUrl,
    }).catch(() => ({
      ok: false,
      error: "Sunucuya ulaşılamadı. Bağlantını kontrol edip yeniden dene.",
    }));

    savingRef.current = request;
    const result = await request;
    savingRef.current = null;

    if (result.ok) {
      revisionRef.current = result.post.revision;
      savedSlugRef.current = result.post.slug;
      setMeta((value) => ({ ...value, updated_at: result.post.updated_at, slug: result.post.slug }));
      setSaveState({ kind: dirtyRef.current ? "dirty" : "saved", error: "" });
    } else {
      dirtyRef.current = true;
      conflictRef.current = Boolean(result.conflict);
      setSaveState({ kind: result.conflict ? "conflict" : "error", error: result.error });
    }
    return result;
  }, [post.id]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    if (conflictRef.current) return;
    setSaveState((value) => (value.kind === "saving" ? value : { kind: "dirty", error: "" }));
    clearTimeout(timerRef.current);
    if (statusRef.current === "draft") timerRef.current = setTimeout(flush, AUTOSAVE_DELAY);
  }, [flush]);

  const update = (changes) => {
    const next = { ...formRef.current, ...changes };
    formRef.current = next;
    setForm(next);
    markDirty();
  };

  const onContentChange = useCallback(
    (doc) => {
      contentRef.current = doc;
      markDirty();
    },
    [markDirty]
  );

  useEffect(() => {
    statusRef.current = meta.status;
  }, [meta.status]);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (dirtyRef.current || savingRef.current) event.preventDefault();
    };
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        flush().then((result) => {
          if (result.ok) toast("Değişiklikler kaydedildi.");
          else if (result.error) toast(result.error, "error");
        });
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(timerRef.current);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [flush]);

  // --- Kaydetme / yayınlama --------------------------------------------------

  const applyPost = (updated) => {
    revisionRef.current = updated.revision;
    statusRef.current = updated.status;
    setMeta({
      status: updated.status,
      published_at: updated.published_at,
      updated_at: updated.updated_at,
      slug: updated.slug,
    });
    router.refresh();
  };

  const saveManually = async (message) => {
    setBusy("manual");
    dirtyRef.current = true;
    const result = await flush();
    setBusy(null);
    if (result.ok) toast(message);
    else if (result.error) toast(result.error, "error");
  };

  const publish = async () => {
    setBusy("publish");
    const saved = await flush();
    if (!saved.ok) {
      setBusy(null);
      return saved.error && toast(saved.error, "error");
    }
    const publishAt = showSchedule && scheduleAt ? new Date(scheduleAt).toISOString() : null;
    const result = await publishPost(post.id, revisionRef.current, publishAt);
    setBusy(null);
    if (!result.ok) return toast(result.error, "error");

    applyPost(result.post);
    setShowSchedule(false);
    const scheduled = new Date(result.post.published_at) > new Date();
    toast(scheduled ? `Yazı ${formatDateTime(result.post.published_at)} için planlandı.` : "Yazı yayında.");
  };

  const unpublish = async () => {
    setBusy("unpublish");
    while (savingRef.current) await savingRef.current;
    const result = await unpublishPost(post.id, revisionRef.current);
    setBusy(null);
    if (!result.ok) return toast(result.error, "error");
    applyPost(result.post);
    toast("Yazı yayından kaldırıldı ve taslağa alındı.");
  };

  const moveToTrash = async () => {
    setBusy("trash");
    const result = await trashPost(post.id);
    if (!result.ok) {
      setBusy(null);
      setConfirmTrash(false);
      return toast(result.error, "error");
    }
    dirtyRef.current = false;
    toast("Yazı çöp kutusuna taşındı.");
    router.push("/admin/blog");
  };

  // --- Alan yardımcıları ------------------------------------------------------

  const onTitleChange = (title) => {
    update(slugTouchedRef.current ? { title } : { title, slug: slugify(title) });
  };

  const addTag = () => {
    const name = tagDraft.trim().replace(/^#/, "").slice(0, 40);
    setTagDraft("");
    if (!name) return;
    const exists = form.tags.some((tag) => slugify(tag) === slugify(name));
    if (exists || form.tags.length >= MAX_TAGS || !slugify(name)) return;
    update({ tags: [...form.tags, name] });
  };

  const addCategory = async (event) => {
    event.preventDefault();
    const result = await createCategory(newCategory);
    if (!result.ok) return toast(result.error, "error");
    setCategories((current) => [...current, result.category]);
    setNewCategory(null);
    update({ categoryId: result.category.id });
    toast("Kategori eklendi.");
  };

  const setCover = (media) => {
    update({ cover: media, coverAlt: formRef.current.coverAlt || media.alt_text || "" });
    setCoverPicker(false);
  };

  const uploadCover = async (file) => {
    if (!file) return;
    setCoverProgress(0);
    try {
      setCover(await uploadMedia(file, setCoverProgress));
      toast("Kapak görseli yüklendi.");
    } catch (error) {
      toast(error.message, "error");
    }
    setCoverProgress(null);
  };

  const isBusy = busy !== null;
  const neverPublished = !post.published_at && meta.status === "draft" && !meta.published_at;

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <section className={styles.card} aria-labelledby="editor-title">
          <div className={styles.head}>
            <h1 id="editor-title" className={styles.heading}>
              {neverPublished ? "Yeni Blog Yazısı" : "Yazıyı Düzenle"}
            </h1>
            <SaveStatus state={saveState} autosaves={autosaves} updatedAt={meta.updated_at} onRetry={flush} />
          </div>

          <label className={styles.srOnly} htmlFor="post-title">
            Başlık
          </label>
          <input
            id="post-title"
            type="text"
            value={form.title}
            maxLength={160}
            placeholder="Blog yazınızın başlığını yazın…"
            className={`${styles.input} ${styles.titleInput}`}
            onChange={(event) => onTitleChange(event.target.value)}
          />

          <div className={styles.field}>
            <label htmlFor="post-slug" className={styles.label}>
              Kalıcı Bağlantı (URL)
            </label>
            <div className={styles.slugRow}>
              <div className={styles.slugField}>
                <span className={styles.slugPrefix}>
                  <Link2 size={16} aria-hidden="true" />
                  {siteHost}/blog/
                </span>
                <input
                  id="post-slug"
                  type="text"
                  value={form.slug}
                  maxLength={120}
                  placeholder="yazi-slugunuzu-yazin"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-describedby="post-slug-hint"
                  className={styles.slugInput}
                  onChange={(event) => {
                    slugTouchedRef.current = true;
                    update({ slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") });
                  }}
                  onBlur={() => form.slug !== slugify(form.slug) && update({ slug: slugify(form.slug) })}
                />
              </div>
              <button
                type="button"
                className={styles.btnMuted}
                onClick={() => {
                  slugTouchedRef.current = true;
                  update({ slug: slugify(form.title) });
                }}
              >
                Oluştur
              </button>
            </div>
            <p id="post-slug-hint" className={styles.hint}>
              Küçük harf, rakam ve kısa çizgi (-) kullanın.
              {post.published_at ? " Yayımlanmış bir yazının bağlantısı değişirse eski adres yenisine yönlendirilir." : ""}
            </p>
          </div>

          <div className={styles.field}>
            <label htmlFor="post-excerpt" className={styles.label}>
              Özet
            </label>
            <textarea
              id="post-excerpt"
              value={form.excerpt}
              maxLength={200}
              rows={3}
              placeholder="Kısa bir özet yazın. Bu metin blog listesinde ve sosyal medya paylaşımlarında görünecek…"
              className={`${styles.input} ${styles.textarea}`}
              onChange={(event) => update({ excerpt: event.target.value })}
            />
            <p className={styles.counter}>{form.excerpt.length}/200</p>
          </div>

          <RichTextEditor initialContent={post.content} onChange={onContentChange} />
        </section>

        <section className={styles.card} aria-labelledby="media-title">
          <h2 id="media-title" className={styles.sectionTitle}>
            Görsel ve Medya
          </h2>
          <div className={styles.mediaGrid}>
            <div
              className={styles.dropzone}
              data-dragging={coverDragging}
              onDragOver={(event) => {
                event.preventDefault();
                setCoverDragging(true);
              }}
              onDragLeave={() => setCoverDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setCoverDragging(false);
                uploadCover(event.dataTransfer.files[0]);
              }}
            >
              <input
                ref={coverInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(event) => {
                  uploadCover(event.target.files[0]);
                  event.target.value = "";
                }}
              />
              {coverProgress === null ? (
                <>
                  <ImagePlus size={30} strokeWidth={1.6} className={styles.dropIcon} aria-hidden="true" />
                  <button type="button" className={styles.dropButton} onClick={() => coverInput.current.click()}>
                    Kapak görseli yükle
                  </button>
                  <span className={styles.dropSub}>veya sürükleyip bırakın</span>
                  <span className={styles.dropHint}>
                    JPG, PNG, WebP (maks. 4MB) • Önerilen boyut: 1200 × 630
                  </span>
                  <button type="button" className={styles.linkButton} onClick={() => setCoverPicker(true)}>
                    Kütüphaneden seç
                  </button>
                </>
              ) : (
                <div className={styles.progress} role="status">
                  <LoaderCircle size={20} className={styles.spin} aria-hidden="true" />
                  <span>Yükleniyor… %{coverProgress}</span>
                  <progress value={coverProgress} max={100} aria-label="Yükleme ilerlemesi" />
                </div>
              )}
            </div>

            <div className={styles.coverPane}>
              <p className={styles.hint}>Görsel Önizleme</p>
              {form.cover ? (
                <>
                  <div className={styles.coverPreview}>
                    <Image src={form.cover.url} alt={form.coverAlt} fill sizes="320px" />
                  </div>
                  <label className={styles.label} htmlFor="cover-alt">
                    Kapak alt metni
                  </label>
                  <input
                    id="cover-alt"
                    type="text"
                    value={form.coverAlt}
                    maxLength={300}
                    placeholder="Görseli kısaca tarif edin"
                    className={styles.input}
                    onChange={(event) => update({ coverAlt: event.target.value })}
                  />
                  <button type="button" className={styles.linkButton} data-danger="true" onClick={() => update({ cover: null, coverAlt: "" })}>
                    Kapak görselini kaldır
                  </button>
                </>
              ) : (
                <div className={styles.coverEmpty}>
                  <ImagePlus size={26} strokeWidth={1.5} aria-hidden="true" />
                  <span>Kapak görseli henüz yüklenmedi.</span>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <aside className={styles.side} aria-label="Yazı ayarları">
        <section className={styles.card} aria-labelledby="publish-title">
          <h2 id="publish-title" className={styles.sectionTitle}>
            Yayınla
          </h2>

          {saveState.kind === "conflict" ? (
            <div className={styles.conflict} role="alert">
              <CircleAlert size={17} aria-hidden="true" />
              <div>
                <p>{saveState.error}</p>
                <button type="button" className={styles.linkButton} onClick={() => window.location.reload()}>
                  Sayfayı yenile
                </button>
              </div>
            </div>
          ) : null}

          <div className={styles.publishButtons}>
            {meta.status === "draft" ? (
              <>
                <button
                  type="button"
                  className={styles.btnOutline}
                  disabled={isBusy}
                  onClick={() => saveManually("Taslak kaydedildi.")}
                >
                  Taslak olarak kaydet
                </button>
                <button type="button" className={styles.btnPrimary} disabled={isBusy} onClick={publish}>
                  {busy === "publish" ? (
                    <LoaderCircle size={17} className={styles.spin} aria-hidden="true" />
                  ) : (
                    <Send size={17} aria-hidden="true" />
                  )}
                  {showSchedule && scheduleAt ? "Planla" : "Yayınla"}
                </button>
              </>
            ) : (
              <>
                <button type="button" className={styles.btnOutline} disabled={isBusy} onClick={unpublish}>
                  Yayından kaldır
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={isBusy}
                  onClick={() => saveManually(state === "published" ? "Yayındaki yazı güncellendi." : "Değişiklikler kaydedildi.")}
                >
                  {busy === "manual" ? (
                    <LoaderCircle size={17} className={styles.spin} aria-hidden="true" />
                  ) : (
                    <Send size={17} aria-hidden="true" />
                  )}
                  Güncelle
                </button>
              </>
            )}
          </div>

          <ul className={styles.statusList}>
            <li>
              <span className={styles.dot} data-state={state} aria-hidden="true" />
              Durum: <strong>{STATE_LABELS[state]}</strong>
            </li>
            <li>
              <Globe size={17} aria-hidden="true" />
              Görünürlük: <strong>{state === "published" ? "Herkese açık" : "Yalnızca yöneticiler"}</strong>
            </li>
            <li>
              <CalendarClock size={17} aria-hidden="true" />
              {meta.status === "published" ? (
                <>
                  {state === "scheduled" ? "Yayın zamanı" : "Yayımlandı"}:{" "}
                  <strong>{formatDateTime(meta.published_at)}</strong>
                </>
              ) : (
                <>
                  Yayınla: <strong>{showSchedule && scheduleAt ? formatDateTime(new Date(scheduleAt)) : "Hemen"}</strong>
                  <button
                    type="button"
                    className={styles.linkButton}
                    aria-expanded={showSchedule}
                    onClick={() => {
                      setShowSchedule((value) => !value);
                      if (!scheduleAt) setScheduleAt(toLocalInput(new Date(Date.now() + 3600000).toISOString()));
                    }}
                  >
                    {showSchedule ? "Vazgeç" : "Planla"}
                  </button>
                </>
              )}
            </li>
          </ul>

          {showSchedule && meta.status === "draft" ? (
            <div className={styles.field}>
              <label htmlFor="schedule-at" className={styles.label}>
                Yayın tarihi ve saati
              </label>
              <input
                id="schedule-at"
                type="datetime-local"
                value={scheduleAt}
                min={toLocalInput(new Date().toISOString())}
                className={styles.input}
                onChange={(event) => setScheduleAt(event.target.value)}
              />
              <p className={styles.hint}>Yazı bu zamana kadar ziyaretçilere görünmez.</p>
            </div>
          ) : null}

          <div className={styles.publishLinks}>
            {state === "published" ? (
              <a href={`/blog/${meta.slug}`} target="_blank" rel="noreferrer" className={styles.linkButton}>
                <ExternalLink size={15} aria-hidden="true" />
                Yayındaki yazıyı aç
              </a>
            ) : (
              <Link href={`/admin/blog/${post.id}/preview`} target="_blank" className={styles.linkButton}>
                <Eye size={15} aria-hidden="true" />
                Tam sayfa önizleme
              </Link>
            )}
            <button type="button" className={styles.linkButton} data-danger="true" disabled={isBusy} onClick={() => setConfirmTrash(true)}>
              <Trash2 size={15} aria-hidden="true" />
              Çöp kutusuna taşı
            </button>
          </div>
        </section>

        <section className={styles.card} aria-labelledby="categories-title">
          <h2 id="categories-title" className={styles.sectionTitle}>
            Kategoriler
          </h2>
          <div className={styles.optionList} role="radiogroup" aria-labelledby="categories-title">
            {[{ id: "", name: "Kategorisiz" }, ...categories].map((category) => (
              <label key={category.id || "none"} className={styles.option}>
                <input
                  type="radio"
                  name="category"
                  value={category.id}
                  checked={form.categoryId === category.id}
                  onChange={() => update({ categoryId: category.id })}
                />
                <span>{category.name}</span>
              </label>
            ))}
          </div>
          {newCategory === null ? (
            <button type="button" className={styles.addLink} onClick={() => setNewCategory("")}>
              <Plus size={16} aria-hidden="true" />
              Yeni kategori ekle
            </button>
          ) : (
            <form className={styles.inlineForm} onSubmit={addCategory}>
              <input
                type="text"
                value={newCategory}
                autoFocus
                required
                maxLength={60}
                placeholder="Kategori adı"
                aria-label="Yeni kategori adı"
                className={styles.input}
                onChange={(event) => setNewCategory(event.target.value)}
              />
              <button type="submit" className={styles.btnMuted}>
                Ekle
              </button>
              <button type="button" className={styles.iconButton} aria-label="Vazgeç" onClick={() => setNewCategory(null)}>
                <X size={16} />
              </button>
            </form>
          )}
        </section>

        <section className={styles.card} aria-labelledby="tags-title">
          <h2 id="tags-title" className={styles.sectionTitle}>
            Etiketler
          </h2>
          <input
            type="text"
            value={tagDraft}
            maxLength={40}
            placeholder="Etiket ekleyin ve Enter’a basın…"
            aria-labelledby="tags-title"
            aria-describedby="tags-hint"
            enterKeyHint="done"
            disabled={form.tags.length >= MAX_TAGS}
            className={styles.input}
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
                  <button
                    type="button"
                    aria-label={`${tag} etiketini kaldır`}
                    onClick={() => update({ tags: form.tags.filter((other) => other !== tag) })}
                  >
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p id="tags-hint" className={styles.hint}>
            En fazla {MAX_TAGS} etiket ekleyebilirsiniz. ({form.tags.length}/{MAX_TAGS})
          </p>
        </section>

        <section className={styles.card} aria-labelledby="seo-title">
          <h2 id="seo-title" className={styles.sectionTitle}>
            SEO Ayarları
          </h2>
          <div className={styles.field}>
            <label htmlFor="seo-title-input" className={styles.label}>
              SEO Başlık
            </label>
            <input
              id="seo-title-input"
              type="text"
              value={form.seoTitle}
              maxLength={70}
              placeholder="SEO için özel başlık (opsiyonel)…"
              className={styles.input}
              onChange={(event) => update({ seoTitle: event.target.value })}
            />
            <p className={styles.counter}>{form.seoTitle.length}/70</p>
          </div>
          <div className={styles.field}>
            <label htmlFor="seo-description-input" className={styles.label}>
              SEO Açıklama
            </label>
            <textarea
              id="seo-description-input"
              value={form.seoDescription}
              maxLength={160}
              rows={3}
              placeholder="Arama motorları için açıklama (opsiyonel)…"
              className={`${styles.input} ${styles.textarea}`}
              onChange={(event) => update({ seoDescription: event.target.value })}
            />
            <p className={styles.counter}>{form.seoDescription.length}/160</p>
          </div>

          <button
            type="button"
            className={styles.advancedToggle}
            aria-expanded={showAdvanced}
            aria-controls="advanced-settings"
            onClick={() => setShowAdvanced((value) => !value)}
          >
            <Settings size={17} aria-hidden="true" />
            Gelişmiş Ayarlar
            <ChevronDown size={17} aria-hidden="true" data-open={showAdvanced} />
          </button>
          <div id="advanced-settings" hidden={!showAdvanced} className={styles.advanced}>
            <div className={styles.field}>
              <label htmlFor="canonical-input" className={styles.label}>
                Canonical URL
              </label>
              <input
                id="canonical-input"
                type="url"
                value={form.canonicalUrl}
                maxLength={500}
                placeholder="https://… (boşsa yazının kendi adresi)"
                className={styles.input}
                onChange={(event) => update({ canonicalUrl: event.target.value })}
              />
            </div>
            <label className={styles.option}>
              <input
                type="checkbox"
                checked={form.isFeatured}
                onChange={(event) => update({ isFeatured: event.target.checked })}
              />
              <span>Blog sayfasında “Öne Çıkan Yazılar”da göster</span>
            </label>
          </div>
        </section>
      </aside>

      <MediaPickerDialog
        open={coverPicker}
        title="Kapak görseli seç"
        onSelect={setCover}
        onClose={() => setCoverPicker(false)}
      />

      <ConfirmDialog
        open={confirmTrash}
        title="Yazı çöp kutusuna taşınsın mı?"
        confirmLabel="Çöp kutusuna taşı"
        danger
        busy={busy === "trash"}
        onCancel={() => setConfirmTrash(false)}
        onConfirm={moveToTrash}
      >
        {state === "published" ? "Yazı yayından kalkar ve adresi “bulunamadı” döndürür. " : ""}
        Kaydedilmemiş son değişiklikler kaybolur. Yazıyı çöp kutusundan geri yükleyebilirsin.
      </ConfirmDialog>
    </div>
  );
}

function SaveStatus({ state, autosaves, updatedAt, onRetry }) {
  if (state.kind === "saving") {
    return (
      <p className={styles.saveStatus} role="status">
        <LoaderCircle size={15} className={styles.spin} aria-hidden="true" />
        Kaydediliyor…
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <p className={styles.saveStatus} data-kind="error" role="alert">
        <CircleAlert size={15} aria-hidden="true" />
        Kaydedilemedi: {state.error}
        <button type="button" className={styles.linkButton} onClick={onRetry}>
          <RotateCw size={14} aria-hidden="true" />
          Yeniden dene
        </button>
      </p>
    );
  }
  if (state.kind === "conflict") {
    return (
      <p className={styles.saveStatus} data-kind="error" role="status">
        <CircleAlert size={15} aria-hidden="true" />
        Kayıt durduruldu
      </p>
    );
  }
  if (state.kind === "dirty") {
    return (
      <p className={styles.saveStatus} data-kind="dirty" role="status">
        {autosaves ? "Kaydedilmemiş değişiklikler…" : "Yayınlanmamış değişiklikler var — “Güncelle” ile kaydet"}
      </p>
    );
  }
  return (
    <p className={styles.saveStatus} role="status">
      Son kayıt: <time dateTime={updatedAt}>{formatDateTime(updatedAt)}</time>
    </p>
  );
}
