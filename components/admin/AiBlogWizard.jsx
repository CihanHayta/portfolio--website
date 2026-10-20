"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Check,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  Info,
  LoaderCircle,
  Monitor,
  RotateCw,
  Send,
  Smartphone,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { deleteMedia } from "@/app/admin/blog/actions";
import { GRAPHIC_MOTIFS } from "@/lib/ai/graphics";
import { runQualityChecks } from "@/lib/ai/quality";
import { docImages, setImageAlt, withSourceCredit } from "@/lib/ai/tiptap";
import { sanitizeContent } from "@/lib/blog/blocks/model";
import { countWords, docText, readingMinutes } from "@/lib/blog/content";
import { slugify } from "@/lib/blog/slug";
import { PREVIEW_DATA, PREVIEW_READY } from "./AiPreviewClient";
import ConfirmDialog from "./ConfirmDialog";
import { uploadMedia } from "./upload";
import styles from "./AiBlogWizard.module.css";

const STEPS = ["Kaynak analizi", "Görsel planı", "Görseller", "Makale", "Önizleme ve yayın"];
const PHASE_STEP = { analyzing: 0, plan: 1, images: 2, writing: 3, review: 4, publishing: 4, done: 4 };

const MOTIF_LABELS = {
  chart: "Grafik",
  network: "Ağ / bağlantılar",
  layers: "Katmanlar",
  flow: "Akış / adımlar",
  grid: "Izgara / veri",
  target: "Hedef",
  code: "Kod penceresi",
  device: "Ekranlar",
  document: "Belge",
  spark: "Fikir / ışık",
};

const KIND_LABELS = {
  brand: "Marka grafiği · AI görseli değil",
  ai: "AI ile üretildi · Pollinations",
  upload: "Kendi yüklediğin görsel",
};

const DESKTOP_WIDTH = 1280;
const MOBILE_WIDTH = 390;

async function postJson(path, body, signal) {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, error: data?.error ?? "İstek başarısız oldu. Yeniden dene." };
    return { ok: true, data };
  } catch (error) {
    if (error?.name === "AbortError") return { ok: false, aborted: true };
    return { ok: false, error: "Sunucuya ulaşılamadı. Bağlantını kontrol edip yeniden dene." };
  }
}

export default function AiBlogWizard({
  url,
  postId,
  categories,
  siteHost,
  replacesContent,
  onClose,
  onApplyDraft,
  onPublish,
}) {
  const dialogRef = useRef(null);
  const abortRef = useRef(null);
  const createdMediaRef = useRef(new Set());

  const [phase, setPhase] = useState("analyzing");
  const [error, setError] = useState("");
  const [source, setSource] = useState(null);
  const [plan, setPlan] = useState(null);
  const [provider, setProvider] = useState("brand");
  const [slots, setSlots] = useState({}); // id → { status, media, kind, error, seed }
  const [fields, setFields] = useState(null);
  const [doc, setDoc] = useState(null);
  const [meta, setMeta] = useState(null); // { model, primaryKeyword, secondaryKeywords }
  const [credit, setCredit] = useState(true);
  const [device, setDevice] = useState("desktop");
  const [published, setPublished] = useState(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();
  }, []);

  const request = useCallback((path, body) => {
    const controller = new AbortController();
    abortRef.current = controller;
    return postJson(path, body, controller.signal);
  }, []);

  // --- 1. Kaynak analizi + görsel planı ---------------------------------------

  const analyze = useCallback(async () => {
    setPhase("analyzing");
    setError("");
    const result = await request("/api/admin/ai/analyze", { url });
    if (result.aborted) return;
    if (!result.ok) return setError(result.error);
    setSource(result.data.source);
    setPlan(result.data.plan);
    setPhase("plan");
  }, [request, url]);

  useEffect(() => {
    // Bir sonraki turda başlatılır: geliştirme modunda etki iki kez çalıştığında
    // ilki iptal olur ve kotadan yalnızca tek istek düşer.
    const timer = setTimeout(analyze, 0);
    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [analyze]);

  const updateImage = (id, changes) =>
    setPlan((current) => ({
      ...current,
      images: current.images.map((image) => (image.id === id ? { ...image, ...changes } : image)),
    }));

  const removeImage = (id) =>
    setPlan((current) => ({ ...current, images: current.images.filter((image) => image.id !== id) }));

  // --- 2. Görseller -------------------------------------------------------------

  const setSlot = (id, changes) =>
    setSlots((current) => ({ ...current, [id]: { ...current[id], ...changes } }));

  // Değiştirilen görsel kütüphanede sahipsiz kalmasın; hata olursa akış durmaz.
  const discardMedia = useCallback((media) => {
    if (!media || !createdMediaRef.current.has(media.id)) return;
    createdMediaRef.current.delete(media.id);
    deleteMedia(media.id).catch(() => {});
  }, []);

  const generateImage = useCallback(
    async (image, { useProvider, previous, seed }) => {
      setSlot(image.id, { status: "working", error: "" });
      const result = await request("/api/admin/ai/images", { image, provider: useProvider, seed });
      if (result.aborted) return false;
      if (!result.ok) {
        setSlot(image.id, { status: previous?.media ? "ready" : "error", error: result.error });
        return false;
      }
      createdMediaRef.current.add(result.data.media.id);
      discardMedia(previous?.media);
      setSlot(image.id, { status: "ready", media: result.data.media, kind: result.data.kind, seed, error: "" });
      return true;
    },
    [request, discardMedia]
  );

  const approvePlan = async () => {
    setPhase("images");
    setError("");
    // Sırayla üretilir: ücretsiz görsel servisinin istek sınırına takılmaz.
    for (const image of plan.images) {
      const slot = slots[image.id];
      if (slot?.status === "ready") continue;
      await generateImage(image, { useProvider: provider, previous: slot, seed: slot?.seed ?? 1 });
    }
  };

  const regenerate = (image, useProvider = provider) => {
    const slot = slots[image.id];
    return generateImage(image, { useProvider, previous: slot, seed: (slot?.seed ?? 1) + 1 });
  };

  const uploadOwn = async (image, file) => {
    if (!file) return;
    const previous = slots[image.id];
    setSlot(image.id, { status: "working", error: "" });
    try {
      const media = await uploadMedia(file);
      createdMediaRef.current.add(media.id);
      discardMedia(previous?.media);
      setSlot(image.id, { status: "ready", media, kind: "upload", error: "" });
    } catch (uploadError) {
      setSlot(image.id, { status: previous?.media ? "ready" : "error", error: uploadError.message });
    }
  };

  const imagesReady = plan?.images.every((image) => slots[image.id]?.status === "ready" && slots[image.id].media);
  const imagesWorking = plan?.images.some((image) => slots[image.id]?.status === "working");

  // --- 3. Makale ----------------------------------------------------------------

  const writeArticle = async () => {
    setPhase("writing");
    setError("");
    const result = await request("/api/admin/ai/article", {
      postId,
      source: {
        title: source.title,
        text: source.text,
        truncated: source.truncated,
        wordCount: source.wordCount,
      },
      plan: { summary: plan.summary, keyPoints: plan.keyPoints },
      images: plan.images.map((image) => ({
        role: image.role,
        concept: image.concept,
        alt: image.alt,
        placement: image.placement,
        mediaId: slots[image.id].media.id,
      })),
    });
    if (result.aborted) return;
    if (!result.ok) {
      setError(result.error);
      return setPhase(doc ? "review" : "images");
    }

    const { article } = result.data;
    const cover = plan.images.find((image) => image.role === "cover");
    setFields({
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt,
      seoTitle: article.seoTitle,
      seoDescription: article.seoDescription,
      tags: article.tags.join(", "),
      categoryId: article.categoryId,
      coverAlt: cover.alt,
    });
    setDoc(result.data.doc);
    setMeta({
      model: result.data.model,
      primaryKeyword: article.primaryKeyword,
      secondaryKeywords: article.secondaryKeywords,
    });
    setPhase("review");
  };

  // --- 4. Önizleme, denetim ve yayın ------------------------------------------

  const coverMedia = plan ? slots[plan.images.find((image) => image.role === "cover")?.id]?.media : null;
  const finalDoc = useMemo(
    () => (doc && credit && source ? withSourceCredit(doc, source.url, source.siteName || source.title) : doc),
    [doc, credit, source]
  );
  const tagText = fields?.tags ?? "";
  const tagList = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const raw of tagText.split(",")) {
      const name = raw.trim().replace(/^#/, "").slice(0, 40);
      const key = slugify(name, 40);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    return out.slice(0, 10);
  }, [tagText]);

  const quality = useMemo(() => {
    if (!fields || !finalDoc) return null;
    return runQualityChecks({
      fields: { ...fields, primaryKeyword: meta?.primaryKeyword },
      doc: finalDoc,
      sourceText: source.text,
      cover: coverMedia,
      plannedInlineCount: plan.images.filter((image) => image.role === "inline").length,
    });
  }, [fields, finalDoc, meta, source, coverMedia, plan]);

  // Editörün blok biçimi: önizleme de kayıt da aynı dönüştürülmüş içeriği kullanır.
  const content = useMemo(() => (finalDoc ? sanitizeContent(finalDoc) : null), [finalDoc]);

  const previewPost = useMemo(() => {
    if (!fields || !content) return null;
    const category = categories.find((item) => item.id === fields.categoryId);
    return {
      title: fields.title,
      excerpt: fields.excerpt,
      content,
      published_at: new Date().toISOString(),
      reading_minutes: readingMinutes(docText(finalDoc)),
      cover: coverMedia ? { url: coverMedia.url, width: coverMedia.width, height: coverMedia.height } : null,
      cover_alt: fields.coverAlt,
      category: category ? { name: category.name, slug: category.slug } : null,
      tags: tagList.map((name) => ({ name })),
    };
  }, [fields, finalDoc, content, coverMedia, categories, tagList]);

  const payload = () => ({
    fields: {
      title: fields.title.trim(),
      slug: slugify(fields.slug),
      excerpt: fields.excerpt.trim(),
      seoTitle: fields.seoTitle.trim(),
      seoDescription: fields.seoDescription.trim(),
      tags: tagList,
      categoryId: fields.categoryId,
      cover: coverMedia,
      coverAlt: fields.coverAlt.trim(),
    },
    content,
  });

  const applyDraft = () => {
    createdMediaRef.current.clear();
    onApplyDraft(payload());
  };

  const publish = async () => {
    setPhase("publishing");
    setError("");
    const result = await onPublish(payload());
    if (result.ok) {
      createdMediaRef.current.clear();
      setPublished(result.post);
      return setPhase("done");
    }
    if (result.unverified) createdMediaRef.current.clear();
    setError(result.error ?? "Yayınlama başarısız oldu. Yeniden dene.");
    setPhase("review");
  };

  // --- Kapatma -----------------------------------------------------------------

  const requestClose = () => {
    if (phase === "publishing" || closing) return;
    if (phase === "done" || createdMediaRef.current.size === 0) return onClose();
    setConfirmClose(true);
  };

  const discardAndClose = async () => {
    setClosing(true);
    abortRef.current?.abort();
    // Yazıya bağlanmamış görseller kütüphaneden temizlenir (kullanılan görseli sunucu zaten silmez).
    await Promise.allSettled([...createdMediaRef.current].map((id) => deleteMedia(id)));
    onClose();
  };

  const step = PHASE_STEP[phase];
  const busyLabel =
    phase === "analyzing"
      ? "Kaynak sayfa okunuyor ve görsel planı hazırlanıyor…"
      : phase === "writing"
        ? "SEO planı ve özgün makale yazılıyor… Bu adım bir dakikaya yakın sürebilir."
        : "";

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="ai-wizard-title"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
    >
      <header className={styles.head}>
        <h2 id="ai-wizard-title" className={styles.title}>
          <Sparkles size={18} aria-hidden="true" />
          AI ile Blog Oluştur
        </h2>
        <ol className={styles.steps} aria-label="Adımlar">
          {STEPS.map((label, index) => (
            <li
              key={label}
              className={styles.step}
              data-state={index < step || phase === "done" ? "done" : index === step ? "current" : "todo"}
              aria-current={index === step ? "step" : undefined}
            >
              <span className={styles.stepMark} aria-hidden="true">
                {index < step || phase === "done" ? <Check size={13} strokeWidth={3} /> : index + 1}
              </span>
              <span className={styles.stepLabel}>{label}</span>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className={styles.close}
          onClick={requestClose}
          disabled={phase === "publishing"}
          aria-label="Kapat"
        >
          <X size={18} />
        </button>
      </header>

      <div className={styles.body} data-phase={phase}>
        {/* Bekleme durumları */}
        {(phase === "analyzing" || phase === "writing") && !error ? (
          <div className={styles.waiting} role="status">
            <LoaderCircle size={28} className={styles.spin} aria-hidden="true" />
            <p>{busyLabel}</p>
            <p className={styles.muted}>{phase === "analyzing" ? url : "Görseller hazır; yazıya yerleştiriliyor."}</p>
          </div>
        ) : null}

        {phase === "analyzing" && error ? (
          <div className={styles.failure} role="alert">
            <CircleAlert size={26} aria-hidden="true" />
            <p className={styles.failureTitle}>Kaynak analiz edilemedi</p>
            <p>{error}</p>
            <p className={styles.muted}>Hiçbir içerik üretilmedi ve hiçbir şey kaydedilmedi.</p>
            <div className={styles.row}>
              <button type="button" className={styles.btnOutline} onClick={onClose}>
                Kapat
              </button>
              <button type="button" className={styles.btnPrimary} onClick={analyze}>
                <RotateCw size={16} aria-hidden="true" />
                Yeniden dene
              </button>
            </div>
          </div>
        ) : null}

        {/* Görsel planı */}
        {phase === "plan" ? (
          <div className={styles.columns}>
            <section className={styles.panel} aria-labelledby="ai-source-title">
              <h3 id="ai-source-title" className={styles.panelTitle}>
                Kaynak
              </h3>
              <p className={styles.sourceTitle}>{source.title || source.metaTitle}</p>
              <a href={source.url} target="_blank" rel="noreferrer" className={styles.link}>
                {source.siteName}
                <ExternalLink size={13} aria-hidden="true" />
              </a>
              <dl className={styles.facts}>
                <div>
                  <dt>Uzunluk</dt>
                  <dd>{source.wordCount.toLocaleString("tr-TR")} sözcük</dd>
                </div>
                <div>
                  <dt>Başlık</dt>
                  <dd>{source.headings.length}</dd>
                </div>
                <div>
                  <dt>Görsel</dt>
                  <dd>{source.images.length}</dd>
                </div>
                <div>
                  <dt>Dil</dt>
                  <dd>{source.language ? source.language.slice(0, 2).toUpperCase() : "—"}</dd>
                </div>
              </dl>
              {source.truncated ? (
                <p className={styles.note} data-tone="warn">
                  <TriangleAlert size={15} aria-hidden="true" />
                  Kaynak çok uzun; analizde ve makalede yalnızca ilk bölümü kullanılacak.
                </p>
              ) : null}
              <h4 className={styles.subTitle}>Özet</h4>
              <p className={styles.text}>{plan.summary}</p>
              <h4 className={styles.subTitle}>Temel fikirler</h4>
              <ul className={styles.bullets}>
                {plan.keyPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              {source.metaDescription ? (
                <>
                  <h4 className={styles.subTitle}>Kaynağın meta açıklaması</h4>
                  <p className={styles.text}>{source.metaDescription}</p>
                </>
              ) : null}
            </section>

            <section className={styles.panel} aria-labelledby="ai-plan-title">
              <h3 id="ai-plan-title" className={styles.panelTitle}>
                Görsel planı
              </h3>
              <p className={styles.note}>
                <Info size={15} aria-hidden="true" />
                Bunlar henüz konsepttir; görseller sen onayladıktan sonra hazırlanır. Makale, görseller hazır
                olmadan yazılmaz.
              </p>

              <fieldset className={styles.providers}>
                <legend className={styles.subTitle}>Görseller nasıl hazırlansın?</legend>
                <label className={styles.provider} data-checked={provider === "brand"}>
                  <input
                    type="radio"
                    name="ai-provider"
                    checked={provider === "brand"}
                    onChange={() => setProvider("brand")}
                  />
                  <span>
                    <strong>Marka grafiği</strong> — önerilen
                    <small>
                      Sitenin renkleriyle, seçilen motiften sunucuda çizilir. Ücretsizdir, sınırı yoktur. Yapay
                      zekâ görseli değildir.
                    </small>
                  </span>
                </label>
                <label className={styles.provider} data-checked={provider === "pollinations"}>
                  <input
                    type="radio"
                    name="ai-provider"
                    checked={provider === "pollinations"}
                    onChange={() => setProvider("pollinations")}
                  />
                  <span>
                    <strong>AI görseli (Pollinations)</strong>
                    <small>
                      Ücretsiz ve anahtarsız bir üçüncü taraf servis. Düşük çözünürlüklüdür ve görsele kendi
                      filigranını ekler; betimleme metni bu servise gönderilir.
                    </small>
                  </span>
                </label>
              </fieldset>

              <ol className={styles.planList}>
                {plan.images.map((image) => (
                  <li key={image.id} className={styles.planItem}>
                    <div className={styles.planHead}>
                      <span className={styles.badge} data-tone={image.role === "cover" ? "accent" : "plain"}>
                        {image.role === "cover" ? "Kapak görseli" : "Yazı içi görsel"}
                      </span>
                      <span className={styles.badge} data-tone="muted">
                        Konsept — henüz üretilmedi
                      </span>
                      {image.role === "inline" ? (
                        <button
                          type="button"
                          className={styles.iconButton}
                          onClick={() => removeImage(image.id)}
                          aria-label={`${image.concept} görselini plandan çıkar`}
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : null}
                    </div>
                    <label className={styles.field}>
                      <span className={styles.label}>Konsept</span>
                      <input
                        type="text"
                        className={styles.input}
                        value={image.concept}
                        maxLength={90}
                        onChange={(event) => updateImage(image.id, { concept: event.target.value })}
                      />
                    </label>
                    {image.description ? <p className={styles.text}>{image.description}</p> : null}
                    <label className={styles.field}>
                      <span className={styles.label}>Alt metin</span>
                      <input
                        type="text"
                        className={styles.input}
                        value={image.alt}
                        maxLength={160}
                        onChange={(event) => updateImage(image.id, { alt: event.target.value })}
                      />
                    </label>
                    <div className={styles.fieldRow}>
                      <label className={styles.field}>
                        <span className={styles.label}>Yazıdaki konumu</span>
                        <input
                          type="text"
                          className={styles.input}
                          value={image.placement}
                          maxLength={200}
                          disabled={image.role === "cover"}
                          onChange={(event) => updateImage(image.id, { placement: event.target.value })}
                        />
                      </label>
                      {provider === "brand" ? (
                        <label className={styles.field}>
                          <span className={styles.label}>Motif</span>
                          <select
                            className={styles.input}
                            value={image.motif}
                            onChange={(event) => updateImage(image.id, { motif: event.target.value })}
                          >
                            {GRAPHIC_MOTIFS.map((motif) => (
                              <option key={motif} value={motif}>
                                {MOTIF_LABELS[motif]}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </div>
                    {provider === "pollinations" ? (
                      <label className={styles.field}>
                        <span className={styles.label}>AI betimlemesi (İngilizce)</span>
                        <textarea
                          className={`${styles.input} ${styles.textarea}`}
                          value={image.prompt}
                          maxLength={500}
                          rows={2}
                          onChange={(event) => updateImage(image.id, { prompt: event.target.value })}
                        />
                      </label>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        ) : null}

        {/* Görseller */}
        {phase === "images" ? (
          <section className={styles.single} aria-labelledby="ai-images-title">
            <h3 id="ai-images-title" className={styles.panelTitle}>
              Görseller
            </h3>
            <p className={styles.text}>
              Hazırlanan her görsel medya kütüphanene kaydedilir. Beğenmediğini yeniden üretebilir ya da kendi
              görselinle değiştirebilirsin; makale ancak bütün görseller hazır olunca yazılır.
            </p>
            {error ? (
              <p className={styles.note} data-tone="error" role="alert">
                <CircleAlert size={15} aria-hidden="true" />
                {error}
              </p>
            ) : null}
            <ul className={styles.imageGrid}>
              {plan.images.map((image) => {
                const slot = slots[image.id] ?? { status: "idle" };
                const working = slot.status === "working";
                return (
                  <li key={image.id} className={styles.imageCard}>
                    <div className={styles.imageFrame}>
                      {slot.media ? (
                        <Image src={slot.media.url} alt={image.alt} fill sizes="(max-width: 900px) 92vw, 420px" />
                      ) : null}
                      {working || slot.status === "idle" ? (
                        <div className={styles.imageOverlay} role="status">
                          <LoaderCircle size={22} className={styles.spin} aria-hidden="true" />
                          {working ? "Hazırlanıyor…" : "Sırada"}
                        </div>
                      ) : null}
                      {slot.status === "error" ? (
                        <div className={styles.imageOverlay} data-tone="error">
                          <CircleAlert size={22} aria-hidden="true" />
                          Hazırlanamadı
                        </div>
                      ) : null}
                    </div>
                    <div className={styles.imageMeta}>
                      <div className={styles.planHead}>
                        <span className={styles.badge} data-tone={image.role === "cover" ? "accent" : "plain"}>
                          {image.role === "cover" ? "Kapak" : "Yazı içi"}
                        </span>
                        {slot.media ? (
                          <span className={styles.badge} data-tone={slot.kind === "ai" ? "ai" : "muted"}>
                            {KIND_LABELS[slot.kind]}
                          </span>
                        ) : null}
                      </div>
                      <p className={styles.imageConcept}>{image.concept}</p>
                      <p className={styles.muted}>Alt metin: {image.alt}</p>
                      {slot.error ? (
                        <p className={styles.fieldError} role="alert">
                          {slot.error}
                        </p>
                      ) : null}
                      <div className={styles.row}>
                        <button
                          type="button"
                          className={styles.btnSmall}
                          disabled={working || imagesWorking}
                          onClick={() => regenerate(image)}
                        >
                          <RotateCw size={14} aria-hidden="true" />
                          {slot.media ? "Yeniden üret" : "Yeniden dene"}
                        </button>
                        {provider === "pollinations" && slot.status === "error" ? (
                          <button
                            type="button"
                            className={styles.btnSmall}
                            disabled={imagesWorking}
                            onClick={() => regenerate(image, "brand")}
                          >
                            Marka grafiği kullan
                          </button>
                        ) : null}
                        <label className={styles.btnSmall} data-disabled={working || imagesWorking}>
                          <Upload size={14} aria-hidden="true" />
                          Kendi görselimi yükle
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            hidden
                            disabled={working || imagesWorking}
                            onChange={(event) => {
                              uploadOwn(image, event.target.files[0]);
                              event.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {/* Önizleme ve denetim */}
        {(phase === "review" || phase === "publishing") && fields ? (
          <div className={styles.review}>
            <section className={styles.reviewSide} aria-label="Yazı alanları ve kalite denetimi">
              {error ? (
                <p className={styles.note} data-tone="error" role="alert">
                  <CircleAlert size={15} aria-hidden="true" />
                  {error}
                </p>
              ) : null}
              {replacesContent ? (
                <p className={styles.note} data-tone="warn">
                  <TriangleAlert size={15} aria-hidden="true" />
                  Bu taslaktaki mevcut başlık, içerik ve SEO alanları oluşturulan yazıyla değiştirilecek.
                </p>
              ) : null}

              <h3 className={styles.panelTitle}>Alanlar</h3>
              <ReviewField label="H1 başlığı" value={fields.title} max={160} onChange={(title) => setFields({ ...fields, title })} />
              <ReviewField label="SEO başlığı" value={fields.seoTitle} max={70} onChange={(seoTitle) => setFields({ ...fields, seoTitle })} />
              <ReviewField
                label="Meta açıklaması"
                value={fields.seoDescription}
                max={160}
                multiline
                onChange={(seoDescription) => setFields({ ...fields, seoDescription })}
              />
              <label className={styles.field}>
                <span className={styles.label}>Kalıcı bağlantı (slug)</span>
                <span className={styles.slugField}>
                  <span className={styles.slugPrefix}>{siteHost}/blog/</span>
                  <input
                    type="text"
                    value={fields.slug}
                    maxLength={120}
                    autoCapitalize="none"
                    spellCheck={false}
                    onChange={(event) =>
                      setFields({ ...fields, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })
                    }
                    onBlur={() => setFields({ ...fields, slug: slugify(fields.slug) })}
                  />
                </span>
              </label>
              <ReviewField
                label="Özet"
                value={fields.excerpt}
                max={200}
                multiline
                onChange={(excerpt) => setFields({ ...fields, excerpt })}
              />
              <label className={styles.field}>
                <span className={styles.label}>Etiketler (virgülle ayır)</span>
                <input
                  type="text"
                  className={styles.input}
                  value={fields.tags}
                  onChange={(event) => setFields({ ...fields, tags: event.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Kategori</span>
                <select
                  className={styles.input}
                  value={fields.categoryId}
                  onChange={(event) => setFields({ ...fields, categoryId: event.target.value })}
                >
                  <option value="">Kategorisiz</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <h3 className={styles.panelTitle}>Anahtar kelimeler</h3>
              <ul className={styles.chips}>
                {meta.primaryKeyword ? (
                  <li className={styles.badge} data-tone="accent">
                    Ana: {meta.primaryKeyword}
                  </li>
                ) : null}
                {meta.secondaryKeywords.map((keyword) => (
                  <li key={keyword} className={styles.badge} data-tone="plain">
                    {keyword}
                  </li>
                ))}
              </ul>

              <h3 className={styles.panelTitle}>Görsel alt metinleri</h3>
              <ReviewField
                label="Kapak görseli"
                value={fields.coverAlt}
                max={300}
                onChange={(coverAlt) => setFields({ ...fields, coverAlt })}
              />
              {docImages(doc).map((node, index) => (
                <ReviewField
                  key={node.attrs.src}
                  label={`Yazı içi görsel ${index + 1}`}
                  value={node.attrs.alt}
                  max={300}
                  onChange={(alt) => setDoc(setImageAlt(doc, node.attrs.src, alt))}
                />
              ))}

              <label className={styles.check}>
                <input type="checkbox" checked={credit} onChange={(event) => setCredit(event.target.checked)} />
                <span>Yazının sonuna kaynak bağlantısı ekle ({source.siteName})</span>
              </label>

              <h3 className={styles.panelTitle}>
                Kalite denetimi
                <span className={styles.qualitySummary}>
                  {quality.hasErrors
                    ? "Yayına engel sorun var"
                    : quality.warnings
                      ? `${quality.warnings} uyarı`
                      : "Sorun bulunmadı"}
                </span>
              </h3>
              <ul className={styles.checks}>
                {quality.checks.map((check) => (
                  <li key={check.id} className={styles.checkItem} data-level={check.level}>
                    {check.level === "ok" ? (
                      <CircleCheck size={16} aria-hidden="true" />
                    ) : check.level === "info" ? (
                      <Info size={16} aria-hidden="true" />
                    ) : check.level === "warn" ? (
                      <TriangleAlert size={16} aria-hidden="true" />
                    ) : (
                      <CircleAlert size={16} aria-hidden="true" />
                    )}
                    <span>
                      <span className={styles.srOnly}>
                        {check.level === "ok" ? "Uygun: " : check.level === "warn" ? "Uyarı: " : check.level === "error" ? "Hata: " : "Bilgi: "}
                      </span>
                      {check.label}
                      {check.detail ? <small>{check.detail}</small> : null}
                    </span>
                  </li>
                ))}
              </ul>
              <p className={styles.muted}>
                Model: {meta.model} · {countWords(docText(finalDoc)).toLocaleString("tr-TR")} sözcük. Metni satır
                satır düzenlemek için yazıyı taslak olarak editöre aktarabilirsin.
              </p>
            </section>

            <section className={styles.previewPane} aria-label="Önizleme">
              <div className={styles.previewBar}>
                <span className={styles.previewLabel}>Sitedeki görünüm</span>
                <div className={styles.segmented} role="group" aria-label="Önizleme genişliği">
                  <button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>
                    <Monitor size={15} aria-hidden="true" />
                    Masaüstü
                  </button>
                  <button type="button" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}>
                    <Smartphone size={15} aria-hidden="true" />
                    Mobil
                  </button>
                </div>
              </div>
              <PreviewFrame post={previewPost} device={device} />
            </section>
          </div>
        ) : null}

        {/* Yayınlandı */}
        {phase === "done" && published ? (
          <div className={styles.success} role="status">
            <CircleCheck size={34} aria-hidden="true" />
            <p className={styles.failureTitle}>Yazı yayında</p>
            <p>
              “{fields.title}” yayınlandı ve herkese açık olduğu doğrulandı. Başlık, içerik, kapak, yazı içi
              görseller, alt metinler ve SEO alanları blog sistemine kaydedildi.
            </p>
            <div className={styles.row}>
              <a href={`/blog/${published.slug}`} target="_blank" rel="noreferrer" className={styles.btnPrimary}>
                <ExternalLink size={16} aria-hidden="true" />
                Yayındaki yazıyı aç
              </a>
              <button type="button" className={styles.btnOutline} onClick={onClose}>
                Editöre dön
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Adım eylemleri */}
      {phase === "plan" ? (
        <footer className={styles.foot}>
          <p className={styles.muted}>
            {plan.images.length} görsel planlandı · {provider === "brand" ? "marka grafiği" : "Pollinations AI görseli"}
          </p>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={plan.images.some((image) => !image.concept.trim() || !image.alt.trim())}
            onClick={approvePlan}
          >
            <Check size={16} aria-hidden="true" />
            Görsel planını onayla ve görselleri hazırla
          </button>
        </footer>
      ) : null}

      {phase === "images" ? (
        <footer className={styles.foot}>
          <button type="button" className={styles.btnOutline} disabled={imagesWorking} onClick={() => setPhase("plan")}>
            Plana dön
          </button>
          <button type="button" className={styles.btnPrimary} disabled={!imagesReady || imagesWorking} onClick={writeArticle}>
            <Sparkles size={16} aria-hidden="true" />
            {doc ? "Makaleyi yeniden oluştur" : "Görseller hazır — makaleyi oluştur"}
          </button>
        </footer>
      ) : null}

      {phase === "review" || phase === "publishing" ? (
        <footer className={styles.foot}>
          <div className={styles.row}>
            <button type="button" className={styles.btnOutline} disabled={phase === "publishing"} onClick={() => setPhase("images")}>
              Görsellere dön
            </button>
            <button type="button" className={styles.btnOutline} disabled={phase === "publishing"} onClick={writeArticle}>
              <RotateCw size={15} aria-hidden="true" />
              Makaleyi yeniden yaz
            </button>
          </div>
          <div className={styles.row}>
            <button
              type="button"
              className={styles.btnOutline}
              disabled={phase === "publishing" || !fields.title.trim()}
              onClick={applyDraft}
            >
              Editöre taslak olarak aktar
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={phase === "publishing" || quality.hasErrors}
              title={quality.hasErrors ? "Önce kalite denetimindeki hataları gider" : undefined}
              onClick={publish}
            >
              {phase === "publishing" ? (
                <LoaderCircle size={16} className={styles.spin} aria-hidden="true" />
              ) : (
                <Send size={16} aria-hidden="true" />
              )}
              Onayla ve Blogumu Yayınla
            </button>
          </div>
        </footer>
      ) : null}

      <ConfirmDialog
        open={confirmClose}
        title="AI ile oluşturma kapatılsın mı?"
        confirmLabel="Kapat ve görselleri sil"
        danger
        busy={closing}
        onCancel={() => setConfirmClose(false)}
        onConfirm={discardAndClose}
      >
        Bu oturumda hazırlanan görseller medya kütüphanesinden silinir ve üretilen içerik kaybolur. Yazına hiçbir
        değişiklik uygulanmaz.
      </ConfirmDialog>
    </dialog>
  );
}

function ReviewField({ label, value, max, multiline = false, onChange }) {
  const Tag = multiline ? "textarea" : "input";
  return (
    <label className={styles.field}>
      <span className={styles.label}>
        {label}
        <span className={styles.counter} data-over={value.length > max}>
          {value.length}/{max}
        </span>
      </span>
      <Tag
        {...(multiline ? { rows: 3 } : { type: "text" })}
        className={`${styles.input} ${multiline ? styles.textarea : ""}`}
        value={value}
        maxLength={max}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

// Henüz kaydedilmemiş yazıyı, yayındaki blog sayfasının bileşenleriyle gösteren
// çerçeve. Gerçek bir pencere olduğu için mobil genişlikte sitenin kendi medya
// sorguları devreye girer.
function PreviewFrame({ post, device }) {
  const wrapRef = useRef(null);
  const frameRef = useRef(null);
  const postRef = useRef(post);
  const [box, setBox] = useState({ width: 0, height: 0 });

  const send = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage({ type: PREVIEW_DATA, post: postRef.current }, window.location.origin);
  }, []);

  useEffect(() => {
    postRef.current = post;
    const timer = setTimeout(send, 200);
    return () => clearTimeout(timer);
  }, [post, send]);

  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type === PREVIEW_READY) send();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [send]);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setBox({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, []);

  const width = device === "mobile" ? MOBILE_WIDTH : DESKTOP_WIDTH;
  const scale = box.width ? Math.min(1, box.width / width) : 1;

  return (
    <div ref={wrapRef} className={styles.frameWrap} data-device={device}>
      <iframe
        ref={frameRef}
        src="/admin/ai-preview"
        title={device === "mobile" ? "Mobil önizleme" : "Masaüstü önizleme"}
        className={styles.frame}
        style={{
          width,
          height: box.height ? box.height / scale : "100%",
          transform: `scale(${scale})`,
          left: Math.max(0, (box.width - width * scale) / 2),
        }}
      />
    </div>
  );
}
