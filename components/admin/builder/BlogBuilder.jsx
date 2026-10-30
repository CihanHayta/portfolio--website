"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Blocks as BlocksIcon,
  ChevronDown,
  CircleAlert,
  CloudOff,
  Check,
  Ellipsis,
  Eye,
  EyeOff,
  ImagePlus,
  Images,
  LoaderCircle,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Redo2,
  RotateCw,
  Save,
  Send,
  Settings2,
  Smartphone,
  Tablet,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
import {
  createPost,
  publishGeneratedPost,
  publishPost,
  savePost,
  trashPost,
  unpublishPost,
} from "@/app/admin/blog/actions";
import { contentHeadings, createBlock, toBlocks } from "@/lib/blog/blocks/model";
import { instantiateTemplate } from "@/lib/blog/blocks/templates";
import { placeAtTargets } from "@/lib/blog/blocks/imageTargets";
import { dropBlocks } from "@/lib/blog/blocks/arrange";
import { insertVisuals } from "@/lib/blog/blocks/insertVisuals";
import { adoptNewContext, loadVisualState } from "@/lib/blog/sourceContext";
import { PALETTE_ITEMS } from "@/lib/blog/blocks/palette";
import { STATE_LABELS, formatDateTime, postState } from "@/lib/blog/format";
import { slugify } from "@/lib/blog/slug";
import { mergeSources, readMeta, sourcesReady } from "@/lib/blog/meta";
import ConfirmDialog from "../ConfirmDialog";
import Toaster from "../Toaster";
import { toast } from "../toast";
import AiLauncher from "./AiLauncher";
import UpdateSuggestions from "./UpdateSuggestions";
import DraftNotes from "./DraftNotes";
import BlockLibrary from "./BlockLibrary";
import Canvas from "./Canvas";
import { usePointerDrag } from "./usePointerDrag";
import Inspector from "./Inspector";
import { useBlocks } from "./useBlocks";
import styles from "./builder.module.css";
import { useModalDialog } from "../useModalDialog";

// Taslak aktarıldıktan sonra "Görsel ekle" ile açılan stüdyo (yalnızca gerektiğinde yüklenir).
const StudioDialog = dynamic(() => import("../studio/StudioDialog"), { ssr: false });
const VisualStudio = dynamic(() => import("../visual/VisualStudio"), { ssr: false });

// Görsel planında olup henüz taslağa eklenmemiş öneriler: { başlık kimliği: [amaç] }.
function visualMarksFor(postId) {
  const state = loadVisualState(postId);
  if (!state?.plan?.items) return null;
  const marks = {};
  for (const item of state.plan.items) {
    const card = state.cards?.[item.id];
    const target = card?.target ?? item.target;
    if (target === "cover" || card?.inserted) continue;
    (marks[target] ??= []).push(item.purpose || "görsel");
  }
  return Object.keys(marks).length ? marks : null;
}

const AUTOSAVE_DELAY = 2500;
const isAutoSlug = (slug) => /^taslak-[0-9a-f]{8}$/.test(slug);
const DEVICES = [
  ["desktop", "Masaüstü görünümü", Monitor],
  ["tablet", "Tablet görünümü", Tablet],
  ["mobile", "Mobil görünümü", Smartphone],
];

const isTyping = (target) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

function SaveStatus({ state, autosaves, updatedAt, saved, onRetry }) {
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
      <p className={styles.saveStatus} data-kind="error" role="alert" title={state.error}>
        <CloudOff size={15} aria-hidden="true" />
        Kaydetme başarısız
        <button type="button" className={styles.textLink} onClick={onRetry}>
          <RotateCw size={13} aria-hidden="true" />
          Yeniden dene
        </button>
      </p>
    );
  }
  if (state.kind === "conflict") {
    return (
      <p className={styles.saveStatus} data-kind="error" role="alert" title={state.error}>
        <CircleAlert size={15} aria-hidden="true" />
        Başka sekmede değişti
        <button type="button" className={styles.textLink} onClick={() => window.location.reload()}>
          Sayfayı yenile
        </button>
      </p>
    );
  }
  if (state.kind === "dirty") {
    return (
      <p className={styles.saveStatus} data-kind="dirty" role="status">
        {autosaves ? "Değişiklikler kaydedilmedi" : "Yayınlanmamış değişiklikler"}
      </p>
    );
  }
  if (!saved) {
    return (
      <p className={styles.saveStatus} role="status">
        Henüz kaydedilmedi
      </p>
    );
  }
  return (
    <p className={styles.saveStatus} data-kind="saved" role="status">
      <Check size={15} aria-hidden="true" />
      Son kaydedilme: <time dateTime={updatedAt}>{formatDateTime(updatedAt).split(" ").at(-1)}</time>
    </p>
  );
}

// `initialTemplate` ({ key, blocks }): şablon galerisinden açılan yeni taslak.
// Bloklar sunucuda üretilir; istemcide yeniden üretilmez ki kimlikler eşleşsin.
export default function BlogBuilder({ post, categories: initialCategories, siteHost, initialTemplate = null, openStudio = false }) {
  const router = useRouter();
  const initialBlocks = useMemo(
    () => (post ? toBlocks(post.content) : (initialTemplate?.blocks ?? [])),
    [post, initialTemplate]
  );
  const { blocks, actions, canUndo, canRedo } = useBlocks(initialBlocks);

  const [form, setForm] = useState(() => ({
    title: post?.title ?? "",
    slug: post && !isAutoSlug(post.slug) ? post.slug : "",
    excerpt: post?.excerpt ?? "",
    categoryId: post?.category_id ?? "",
    tags: post?.tags.map((tag) => tag.name) ?? [],
    cover: post?.cover ?? null,
    coverAlt: post?.cover_alt ?? "",
    isFeatured: post?.is_featured ?? false,
    seoTitle: post?.seo_title ?? "",
    seoDescription: post?.seo_description ?? "",
    canonicalUrl: post?.canonical_url ?? "",
    // content.meta: tema ve kaynakça yazıyla birlikte Supabase'de kalıcıdır.
    theme: readMeta(post?.content).theme ?? "light",
    sources: readMeta(post?.content).sources ?? [],
    sourcesWaived: readMeta(post?.content).sourcesWaived === true,
  }));
  const [meta, setMeta] = useState({
    status: post?.status ?? "draft",
    published_at: post?.published_at ?? null,
    updated_at: post?.updated_at ?? null,
    slug: post?.slug ?? "",
  });
  const [postId, setPostId] = useState(post?.id ?? null);
  // saved | dirty | saving | error | conflict
  const [saveState, setSaveState] = useState({ kind: "saved", error: "" });
  const [categories, setCategories] = useState(initialCategories);
  const [selectedId, setSelectedId] = useState(null);
  const [rightTab, setRightTab] = useState("block");
  const [device, setDevice] = useState("desktop");
  const [preview, setPreview] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [insertAt, setInsertAt] = useState(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [drawer, setDrawer] = useState(null); // "left" | "right" | null (dar ekran)
  const [schedule, setSchedule] = useState("");
  const [busy, setBusy] = useState(null); // "publish" | "unpublish" | "manual" | "trash"
  const [menuOpen, setMenuOpen] = useState(null); // "top" | "bottom" | null
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState(null);
  // Son uygulanan şablon: "Yapay Zekâ ile Bu Şablonu Doldur" yapı yönergesini buradan alır.
  const [activeTemplate, setActiveTemplate] = useState(initialTemplate?.key ?? null);
  const [confirmTrash, setConfirmTrash] = useState(false);

  const blocksRef = useRef(blocks);
  const formRef = useRef(form);
  const idRef = useRef(post?.id ?? null);
  const revisionRef = useRef(post?.revision ?? 0);
  const savedSlugRef = useRef(post?.slug ?? "");
  const slugTouchedRef = useRef(Boolean(post) && !isAutoSlug(post.slug));
  const statusRef = useRef(post?.status ?? "draft");
  const dirtyRef = useRef(false);
  const savingRef = useRef(null);
  const conflictRef = useRef(false);
  const timerRef = useRef(null);
  const dragRef = useRef(null);
  const selectedRef = useRef(null);
  const insertRef = useRef(null);
  const templateDialog = useRef(null);
  const builderRef = useRef(null);
  const publishingRef = useRef(false);

  useEffect(() => {
    selectedRef.current = selectedId;
    insertRef.current = insertAt;
  });

  const state = postState(meta);
  const autosaves = meta.status === "draft";
  const headings = useMemo(() => contentHeadings({ type: "blocks", blocks }), [blocks]);
  const selectedBlock = blocks.find((block) => block.id === selectedId) ?? null;

  // --- Kaydetme ---------------------------------------------------------------

  // Kaydetmeler sıraya girer: aynı anda yalnızca bir istek uçar ve her istek
  // gönderildiği andaki en güncel içeriği taşır. Sürüm numarası sayesinde eski
  // bir istek yeni içeriğin üzerine yazamaz.
  const flush = useCallback(async () => {
    clearTimeout(timerRef.current);
    if (conflictRef.current) return { ok: false };
    while (savingRef.current) await savingRef.current;
    if (!dirtyRef.current) return { ok: true };

    dirtyRef.current = false;
    setSaveState({ kind: "saving", error: "" });

    const current = formRef.current;
    const input = {
      title: current.title,
      slug: slugify(current.slug) || savedSlugRef.current,
      excerpt: current.excerpt,
      content: {
        type: "blocks",
        version: 1,
        blocks: blocksRef.current,
        meta: { theme: current.theme, sources: current.sources, sourcesWaived: current.sourcesWaived },
      },
      categoryId: current.categoryId || null,
      tags: current.tags,
      coverMediaId: current.cover?.id ?? null,
      coverAlt: current.coverAlt,
      isFeatured: current.isFeatured,
      seoTitle: current.seoTitle,
      seoDescription: current.seoDescription,
      canonicalUrl: current.canonicalUrl,
    };

    const creating = idRef.current === null;
    const request = (creating ? createPost(input) : savePost(idRef.current, revisionRef.current, input)).catch(
      () => ({ ok: false, error: "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip yeniden deneyin." })
    );

    savingRef.current = request;
    const result = await request;
    savingRef.current = null;

    if (result.ok) {
      revisionRef.current = result.post.revision;
      savedSlugRef.current = result.post.slug;
      if (creating) {
        // Yazı ilk kez kaydedildi: adres çubuğu sayfa yenilenmeden güncellenir.
        idRef.current = result.post.id;
        setPostId(result.post.id);
        adoptNewContext(result.post.id); // kaynak bağlamı ve görsel planı yazıya bağlanır
        window.history.replaceState(null, "", `/admin/blog/${result.post.id}`);
      }
      setMeta((value) => ({ ...value, updated_at: result.post.updated_at, slug: result.post.slug }));
      setSaveState({ kind: dirtyRef.current ? "dirty" : "saved", error: "" });
    } else {
      dirtyRef.current = true;
      conflictRef.current = Boolean(result.conflict);
      setSaveState({ kind: result.conflict ? "conflict" : "error", error: result.error });
    }
    return result;
  }, []);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    if (conflictRef.current) return;
    setSaveState((value) => (value.kind === "saving" ? value : { kind: "dirty", error: "" }));
    clearTimeout(timerRef.current);
    // Boş bir yeni yazı için kendiliğinden kayıt açılmaz.
    const hasContent = formRef.current.title.trim() !== "" || blocksRef.current.length > 0;
    if (statusRef.current === "draft" && (idRef.current !== null || hasContent)) {
      timerRef.current = setTimeout(flush, AUTOSAVE_DELAY);
    }
  }, [flush]);

  // Blok listesi her değiştiğinde (ekleme, taşıma, geri alma…) kirli sayılır.
  useEffect(() => {
    if (blocksRef.current === blocks) return;
    blocksRef.current = blocks;
    markDirty();
  }, [blocks, markDirty]);

  const updateForm = useCallback(
    (changes, options = {}) => {
      if (options.slugTouched) slugTouchedRef.current = true;
      const next = { ...formRef.current, ...changes };
      formRef.current = next;
      setForm(next);
      markDirty();
    },
    [markDirty]
  );

  const onTitleChange = useCallback(
    (title) => updateForm(slugTouchedRef.current ? { title } : { title, slug: slugify(title) }),
    [updateForm]
  );

  const applyPost = (updated) => {
    revisionRef.current = updated.revision;
    statusRef.current = updated.status;
    setMeta({ status: updated.status, published_at: updated.published_at, updated_at: updated.updated_at, slug: updated.slug });
  };

  const saveManually = async (message) => {
    setBusy("manual");
    dirtyRef.current = true;
    const result = await flush();
    setBusy(null);
    if (result.ok) toast(message);
    else if (result.error) toast(result.error, "error");
  };

  // "Taslak Kaydet": kayıt GERÇEKTEN tamamlanınca yazı listesine dönülür. Kayıt
  // başarısızsa editörde kalınır ve hata gösterilir (içerik kaybolmaz).
  // Otomatik kayıt ve ⌘S editörde kalır.
  const saveAndReturn = async () => {
    setBusy("manual");
    dirtyRef.current = true;
    const result = await flush();
    if (!result.ok || !idRef.current) {
      setBusy(null);
      if (result.error) toast(result.error, "error");
      return;
    }
    dirtyRef.current = false;
    router.push(`/admin/blog?kaydedildi=${idRef.current}`);
  };

  // Stüdyo kalıcı bir şey kaydetmeden önce (görsel, ekran görüntüsü, kaynak metni)
  // yazının Supabase'de bir kimliği olur: yeni yazı başlıksız taslak olarak açılır.
  const ensureDraft = useCallback(async () => {
    if (idRef.current) return idRef.current;
    dirtyRef.current = true;
    const result = await flush();
    return result.ok ? idRef.current : null;
  }, [flush]);

  // Yayın onay penceresinden çağrılır. Çift dokunma koruması: istek sürerken
  // ikinci bir yayın isteği gönderilmez (düğme durumu güncellenmeden önce de).
  const publish = async () => {
    if (publishingRef.current) return;
    publishingRef.current = true;
    setBusy("publish");
    try {
      dirtyRef.current = true;
      const saved = await flush();
      if (!saved.ok) return saved.error && toast(saved.error, "error");
      const publishAt = schedule ? new Date(schedule).toISOString() : null;
      const result = await publishPost(idRef.current, revisionRef.current, publishAt);
      if (!result.ok) return toast(result.error, "error");
      applyPost(result.post);
      setSchedule("");
      const scheduled = new Date(result.post.published_at) > new Date();
      toast(scheduled ? `Yazı ${formatDateTime(result.post.published_at)} için planlandı.` : "Yazı yayında.");
    } finally {
      publishingRef.current = false;
      setBusy(null);
      setConfirmPublish(false);
    }
  };

  const unpublish = async () => {
    setBusy("unpublish");
    while (savingRef.current) await savingRef.current;
    const result = await unpublishPost(idRef.current, revisionRef.current);
    setBusy(null);
    if (!result.ok) return toast(result.error, "error");
    applyPost(result.post);
    toast("Yazı yayından kaldırıldı ve taslağa alındı.");
  };

  const moveToTrash = async () => {
    setBusy("trash");
    const result = await trashPost(idRef.current);
    if (!result.ok) {
      setBusy(null);
      setConfirmTrash(false);
      return toast(result.error, "error");
    }
    dirtyRef.current = false;
    router.push("/admin/blog");
  };

  // --- AI ile blog oluşturma --------------------------------------------------

  const aiHasContent = useCallback(
    () => formRef.current.title.trim() !== "" || blocksRef.current.length > 0,
    []
  );

  // Stüdyonun taslağı onay sormadan aktarabileceği durum: başlık boş ve editör
  // ya boş ya da galeriden seçilen şablonun dokunulmamış hâlinde. Aksi hâlde
  // stüdyo önce taslağı gösterip açık onay ister. (Aktarım her zaman "Geri al" ile döner.)
  const [untouchedTemplate] = useState(() => (post ? null : JSON.stringify(initialTemplate?.blocks ?? [])));
  const canReplaceSilently = useCallback(
    () => formRef.current.title.trim() === "" && (blocksRef.current.length === 0 || JSON.stringify(blocksRef.current) === untouchedTemplate),
    [untouchedTemplate]
  );
  const [draftNotes, setDraftNotes] = useState(null);
  const [imagesOpen, setImagesOpen] = useState(false);
  const [visualOpen, setVisualOpen] = useState(false);
  const [visualMarks, setVisualMarks] = useState(null);
  // Plan işaretleri yalnızca tarayıcıda saklıdır; sunucu çiziminden sonra okunur.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisualMarks(visualMarksFor(postId));
  }, [postId]);

  // AI Görsel Stüdyosu'nda seçilen görseller: tek geri alınabilir adımda doğru
  // bölümlere eklenir; kapak görseli kapak alanına gider. Yayın durumu değişmez.
  const insertVisualPicks = (picks) => {
    const result = insertVisuals(blocksRef.current, picks);
    const coverChange = result.cover
      ? { before: { cover: formRef.current.cover, coverAlt: formRef.current.coverAlt }, after: { cover: result.cover.media, coverAlt: result.cover.alt } }
      : null;
    // Bloklar ve kapak tek geri alınabilir adımda değişir ("Geri al" kapağı da geri getirir).
    if (result.placed > 0 || coverChange) actions.replaceAll(result.placed > 0 ? result.blocks : [...blocksRef.current], coverChange);
    if (coverChange) updateForm(coverChange.after);
    const count = result.placed + (result.cover ? 1 : 0);
    if (count) toast(`${count} görsel taslağa eklendi. “Geri al” ile kaldırabilirsin; hiçbir şey yayımlanmadı.`);
    return result;
  };
  // Geri al / ileri al: geçişe iliştirilmiş form değişikliği (kapak) da uygulanır.
  const undo = useCallback(() => {
    const restore = actions.undo();
    if (restore) updateForm(restore);
  }, [actions, updateForm]);
  const redo = useCallback(() => {
    const restore = actions.redo();
    if (restore) updateForm(restore);
  }, [actions, updateForm]);
  // Stüdyoyu açma isteği: AiLauncher işleyince sıfırlanır (tek seferlik).
  const [studioRequest, setStudioRequest] = useState(openStudio ? 1 : 0);
  const studioHandled = useCallback(() => setStudioRequest(0), []);

  // Görsel adımında "Bloga ekle" / "Kapak görseli yap": her görsel kullanıcının
  // seçtiği hedefe (başlığın altı, boş görsel alanı, giriş, galeri, son) tek geri
  // alınabilir adımda yerleşir. Bildirilen sayı gerçek yerleşimdir; 0 ise başarı denmez.
  const placeStudioImages = (items) => {
    const out = placeAtTargets(blocksRef.current, items);
    const coverChange = out.cover
      ? { before: { cover: formRef.current.cover, coverAlt: formRef.current.coverAlt }, after: { cover: out.cover.media, coverAlt: out.cover.alt } }
      : null;
    if (out.placed > 0 || coverChange) actions.replaceAll(out.placed > 0 ? out.blocks : [...blocksRef.current], coverChange);
    if (coverChange) updateForm(coverChange.after);
    const parts = [out.placed ? `${out.placed} görsel bloga eklendi` : "", coverChange ? "kapak görseli ayarlandı" : ""].filter(Boolean);
    if (parts.length) toast(`${parts.join(", ").replace(/^./, (char) => char.toLocaleUpperCase("tr-TR"))}. “Geri al” ile kaldırabilirsin.`);
    return out;
  };

  const aiFormFields = ({ fields }) => ({
    title: fields.title,
    slug: fields.slug,
    excerpt: fields.excerpt,
    categoryId: fields.categoryId || "",
    tags: fields.tags,
    cover: fields.cover,
    coverAlt: fields.coverAlt,
    seoTitle: fields.seoTitle,
    seoDescription: fields.seoDescription,
  });

  // Oluşturulan yazıyı taslağa aktarır: bloklar geri alınabilir tek bir adımla
  // değişir, kayıt editörün olağan otomatik kaydıyla yapılır.
  const applyAiDraft = (generated) => {
    actions.replaceAll(generated.content.blocks);
    updateForm(aiFormFields(generated), { slugTouched: true });
    setSelectedId(null);
    setDrawer(null);
    toast("Oluşturulan yazı taslağa aktarıldı. Yayınlamadan önce düzenleyebilirsiniz.");
  };

  // Yapay zekânın doldurduğu şablonu taslağa aktarır. Bloklar tek bir geri
  // alınabilir adımla değişir; yayın durumu değişmez, kayıt olağan otomatik kayıtla olur.
  const applyTemplateFill = (filled) => {
    actions.replaceAll(filled.blocks);
    const { fields } = filled;
    updateForm(
      {
        title: fields.title,
        slug: fields.slug,
        excerpt: fields.excerpt,
        seoTitle: fields.seoTitle,
        seoDescription: fields.seoDescription,
        tags: fields.tags,
        ...(fields.categoryId ? { categoryId: fields.categoryId } : {}),
        // Kapak yalnızca stüdyoda seçildiyse değişir; mevcut kapak korunur.
        ...(filled.cover ? { cover: filled.cover.media, coverAlt: filled.cover.alt } : {}),
        // Okunan kaynaklar kaynakçaya eklenir (var olanlar korunur, tekrar yazılmaz).
        ...(filled.bibliography?.length ? { sources: mergeSources(formRef.current.sources, filled.bibliography), sourcesWaived: false } : {}),
      },
      { slugTouched: true }
    );
    if (filled.templateKey) setActiveTemplate(filled.templateKey);
    if (filled.notes) setDraftNotes(filled.notes);
    setSelectedId(null);
    setDrawer(null);
    toast("Taslak editöre aktarıldı. Önceki içeriğe “Geri al” ile dönebilirsiniz; hiçbir şey yayımlanmadı.");
  };

  // Önizlemede onaylanan yazıyı kaydedip yayınlar. Editör yalnızca sunucu kaydı
  // yaptıktan sonra güncellenir; hata olursa tuvaldeki içerik değişmez.
  const publishAi = async (generated) => {
    const offline = () => ({ ok: false, error: "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip yeniden deneyin." });
    setBusy("publish");
    clearTimeout(timerRef.current);
    while (savingRef.current) await savingRef.current;
    if (conflictRef.current) {
      setBusy(null);
      return { ok: false, error: "Bu yazı başka bir sekmede değiştirildi. Sayfayı yenileyip yeniden deneyin." };
    }

    const fields = aiFormFields(generated);
    const input = {
      title: fields.title,
      slug: fields.slug,
      excerpt: fields.excerpt,
      content: generated.content,
      categoryId: fields.categoryId || null,
      tags: fields.tags,
      coverMediaId: fields.cover?.id ?? null,
      coverAlt: fields.coverAlt,
      isFeatured: formRef.current.isFeatured,
      seoTitle: fields.seoTitle,
      seoDescription: fields.seoDescription,
      canonicalUrl: formRef.current.canonicalUrl,
    };

    // Henüz kaydedilmemiş yeni yazı önce taslak olarak oluşturulur.
    let saved = false;
    if (idRef.current === null) {
      const created = await createPost(input).catch(offline);
      if (!created.ok) {
        setBusy(null);
        return created;
      }
      saved = true;
      idRef.current = created.post.id;
      revisionRef.current = created.post.revision;
      savedSlugRef.current = created.post.slug;
      setPostId(created.post.id);
      adoptNewContext(created.post.id);
      window.history.replaceState(null, "", `/admin/blog/${created.post.id}`);
      setMeta((value) => ({ ...value, updated_at: created.post.updated_at, slug: created.post.slug }));
    }

    const result = await publishGeneratedPost(idRef.current, revisionRef.current, input).catch(offline);
    setBusy(null);

    if (result.post || saved) {
      // İçerik sunucuda bu haliyle kayıtlı: editör eşitlenir ve "kaydedildi" sayılır.
      blocksRef.current = generated.content.blocks;
      actions.replaceAll(generated.content.blocks);
      const next = { ...formRef.current, ...fields };
      formRef.current = next;
      setForm(next);
      slugTouchedRef.current = true;
      dirtyRef.current = false;
      setSelectedId(null);
      setSaveState({ kind: "saved", error: "" });
      if (result.post) {
        savedSlugRef.current = result.post.slug;
        applyPost(result.post);
      }
    } else if (result.conflict) {
      conflictRef.current = true;
      setSaveState({ kind: "conflict", error: result.error });
    }
    return result;
  };

  // --- Blok işlemleri (sabit kimlikli geri çağrılar) --------------------------

  const select = useCallback((id) => {
    setSelectedId(id);
    if (id) setRightTab("block");
  }, []);

  const addFromPalette = useCallback(
    (key, index) => {
      const item = PALETTE_ITEMS[key];
      const block = createBlock(item.type, item.props ? structuredClone(item.props) : {});
      const current = blocksRef.current;
      const selectedIndex = current.findIndex((b) => b.id === selectedRef.current);
      const at = index ?? insertRef.current ?? (selectedIndex === -1 ? current.length : selectedIndex + 1);
      actions.insert(current, Math.min(at, current.length), [block]);
      setInsertAt(null);
      select(block.id);
      setDrawer(null);
    },
    [actions, select]
  );

  const changeProps = useCallback(
    (id, patch, field) => actions.updateProps(blocksRef.current, id, patch, field),
    [actions]
  );
  const moveBlock = useCallback((id, toIndex) => actions.move(blocksRef.current, id, toIndex), [actions]);
  const duplicateBlock = useCallback(
    (id) => {
      const copyId = actions.duplicate(blocksRef.current, id);
      if (copyId) select(copyId);
    },
    [actions, select]
  );
  const removeBlock = useCallback(
    (id) => {
      actions.remove(blocksRef.current, id);
      setSelectedId((value) => (value === id ? null : value));
    },
    [actions]
  );
  const openSettings = useCallback((id) => {
    setSelectedId(id);
    setRightTab("block");
    setDrawer("right");
  }, []);
  const openPageSettings = useCallback(() => {
    setRightTab("page");
    setDrawer("right");
  }, []);

  const startDrag = useCallback((payload) => {
    dragRef.current = payload;
    // Sürükleme başladıktan sonra bırakma alanlarını aç; aynı karede açmak
    // tarayıcının sürüklemeyi iptal etmesine yol açabiliyor.
    requestAnimationFrame(() => setDragging(true));
  }, []);
  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);
  const dropAt = useCallback(
    (index) => {
      const payload = dragRef.current;
      endDrag();
      if (!payload) return;
      if (payload.kind === "new") addFromPalette(payload.key, index);
      else moveBlock(payload.id, index);
    },
    [addFromPalette, endDrag, moveBlock]
  );

  // Fare/dokunmatik sürükleme (Pointer Events): bloklar arası ya da bir metin
  // bloğunun iki paragrafı arası. Her bırakma tek geri alınabilir adımdır ve
  // otomatik kayıtla Supabase'e (content.blocks sırası) gider.
  const paperRef = useRef(null);
  const getPaper = useCallback(() => paperRef.current, []);
  const pointerDrop = useCallback(
    (payload, target) => {
      let source = payload;
      if (payload.kind === "new") {
        const item = PALETTE_ITEMS[payload.key];
        if (!item) return;
        source = { kind: "new", block: createBlock(item.type, item.props ? structuredClone(item.props) : {}) };
      }
      const next = dropBlocks(blocksRef.current, source, target);
      if (!next) return;
      actions.replaceAll(next);
      setInsertAt(null);
      setDrawer(null);
      select(source.kind === "new" ? source.block.id : source.id);
      if (target.blockId) toast("Blok iki paragrafın arasına yerleşti; metin iki parçaya bölündü. “Geri al” ile geri dönebilirsin.");
    },
    [actions, select]
  );
  const { active: dragActive, begin: beginDrag, ghostRef, lineRef } = usePointerDrag({ getContainer: getPaper, onDrop: pointerDrop });

  const applyTemplate = (mode) => {
    const fresh = instantiateTemplate(pendingTemplate);
    if (mode === "replace") setActiveTemplate(pendingTemplate.key);
    if (mode === "replace") actions.replaceAll(fresh);
    else actions.insert(blocksRef.current, blocksRef.current.length, fresh);
    setPendingTemplate(null);
    setSelectedId(null);
    setDrawer(null);
    toast(mode === "replace" ? "Şablon uygulandı; önceki içerik “Geri al” ile dönebilir." : "Şablon içeriğin sonuna eklendi.");
  };
  const chooseTemplate = (template) => {
    if (blocksRef.current.length === 0) {
      actions.replaceAll(instantiateTemplate(template));
      setActiveTemplate(template.key);
      setDrawer(null);
      return toast("Şablon eklendi.");
    }
    setPendingTemplate(template);
  };

  // Metin düzenleyicisi ilk çizimi bekletmez; editör açıldıktan sonra boşta
  // önceden indirilir ki ilk paragraf eklendiğinde hazır olsun.
  useEffect(() => {
    const preload = () => import("./RichTextField");
    const handle = window.requestIdleCallback
      ? window.requestIdleCallback(preload, { timeout: 1500 })
      : setTimeout(preload, 300);
    return () => (window.cancelIdleCallback ? window.cancelIdleCallback(handle) : clearTimeout(handle));
  }, []);

  useModalDialog(templateDialog, Boolean(pendingTemplate));

  // Telefon klavyesi açıkken alt işlem çubuğu gizlenir: yazı alanı daralmaz;
  // kayıt durumu üst çubukta görünür kalır. Yakınlaştırma klavye sayılmaz.
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = builderRef.current;
    if (!viewport || !root) return;
    const update = () => {
      root.dataset.keyboard = viewport.scale <= 1.01 && window.innerHeight - viewport.height > 150 ? "open" : "closed";
    };
    update();
    viewport.addEventListener("resize", update);
    return () => viewport.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (dirtyRef.current || savingRef.current) event.preventDefault();
    };
    const onKeyDown = (event) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === "s") {
        event.preventDefault();
        dirtyRef.current = true;
        flush().then((result) => {
          if (result.ok) toast("Değişiklikler kaydedildi.");
          else if (result.error) toast(result.error, "error");
        });
      } else if (mod && key === "z" && !isTyping(event.target)) {
        // Metin alanlarında tarayıcının/editörün kendi geri alması çalışır.
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (event.key === "Escape") {
        setMenuOpen(null);
        setDrawer(null);
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(timerRef.current);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [actions, flush, undo, redo]);

  const isBusy = busy !== null;
  const togglePreview = () => {
    setPreview((value) => !value);
    setSelectedId(null);
    setMenuOpen(null);
  };
  const publishLabel = schedule ? "Planla" : "Yayınla";
  const publishSlug = slugify(form.slug) || meta.slug;
  const updateLabel = state === "published" ? "Yayındaki yazı güncellendi." : "Değişiklikler kaydedildi.";
  const publishMenu = (
    <div className={styles.menu} role="menu">
      {meta.status === "draft" ? (
        <button type="button" role="menuitem" onClick={() => { setMenuOpen(null); openPageSettings(); setTimeout(() => document.getElementById("schedule-at")?.focus(), 50); }}>
          İleri bir tarihe planla…
        </button>
      ) : (
        <button type="button" role="menuitem" disabled={isBusy} onClick={() => { setMenuOpen(null); unpublish(); }}>
          Yayından kaldır
        </button>
      )}
      <button type="button" role="menuitem" onClick={() => { setMenuOpen(null); openPageSettings(); }}>
        Sayfa ayarları
      </button>
    </div>
  );
  const insertHint =
    insertAt !== null ? `Seçtiğiniz blok ${insertAt + 1}. sıraya eklenecek.` : null;

  return (
    <div ref={builderRef} className={styles.builder} data-preview={preview} data-left={leftOpen} data-drawer={drawer ?? "none"}>
      <header className={styles.topbar}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Yazı listesine dön"
          title="Yazı listesine dön"
          onClick={() => {
            const unsaved = dirtyRef.current || savingRef.current;
            if (unsaved && !window.confirm("Kaydedilmemiş değişiklikler var. Yine de çıkılsın mı?")) return;
            dirtyRef.current = false;
            router.push("/admin/blog");
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className={styles.topTitle}>{postId && meta.published_at ? "Yazıyı Düzenle" : "Yeni Blog Yazısı"}</h1>
        <span className={styles.statusBadge} data-state={state}>
          {STATE_LABELS[state]}
        </span>

        <div className={styles.topSpacer} />

        <SaveStatus state={saveState} autosaves={autosaves} updatedAt={meta.updated_at} saved={postId !== null} onRetry={flush} />

        <div className={styles.topGroup} role="group" aria-label="Geçmiş">
          <button type="button" className={styles.iconButton} aria-label="Geri al" title="Geri al (⌘Z)" disabled={!canUndo} onClick={undo}>
            <Undo2 size={17} />
          </button>
          <button type="button" className={styles.iconButton} aria-label="İleri al" title="İleri al (⌘⇧Z)" disabled={!canRedo} onClick={redo}>
            <Redo2 size={17} />
          </button>
        </div>

        <div className={styles.topGroup} role="group" aria-label="Önizleme genişliği">
          {DEVICES.map(([value, label, Icon]) => (
            <button key={value} type="button" className={styles.iconButton} aria-label={label} title={label} aria-pressed={device === value} onClick={() => setDevice(value)}>
              <Icon size={17} />
            </button>
          ))}
        </div>

        {!preview ? (
          <button type="button" className={`${styles.topButton} ${styles.desktopOnly}`} aria-label="Görseller" onClick={() => setImagesOpen(true)}>
            <Images size={16} aria-hidden="true" />
            <span>Görseller</span>
          </button>
        ) : null}
        {!preview ? (
          <button type="button" className={`${styles.topButton} ${styles.desktopOnly}`} aria-label="AI Görselleri" onClick={() => setVisualOpen(true)}>
            <ImagePlus size={16} aria-hidden="true" />
            <span>AI Görselleri</span>
          </button>
        ) : null}

        <button type="button" className={styles.topButton} aria-label={preview ? "Düzenle" : "Önizle"} aria-pressed={preview} onClick={togglePreview}>
          {preview ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
          <span>{preview ? "Düzenle" : "Önizle"}</span>
        </button>

        {meta.status === "draft" ? (
          <button type="button" className={styles.topButton} data-kind="outline" aria-label="Taslak Kaydet" disabled={isBusy} onClick={saveAndReturn}>
            {busy === "manual" ? <LoaderCircle size={16} className={styles.spin} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
            <span>Taslak Kaydet</span>
          </button>
        ) : null}

        <div className={styles.publishGroup}>
          {meta.status === "draft" ? (
            <button type="button" className={styles.publishButton} aria-label={publishLabel} disabled={isBusy} onClick={() => setConfirmPublish(true)}>
              {busy === "publish" ? <LoaderCircle size={16} className={styles.spin} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
              <span>{publishLabel}</span>
            </button>
          ) : (
            <button type="button" className={styles.publishButton} aria-label="Güncelle" disabled={isBusy} onClick={() => saveManually(updateLabel)}>
              {busy === "manual" ? <LoaderCircle size={16} className={styles.spin} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
              <span>Güncelle</span>
            </button>
          )}
          <button type="button" className={styles.publishMore} aria-label="Diğer yayın seçenekleri" aria-haspopup="menu" aria-expanded={menuOpen === "top"} onClick={() => setMenuOpen((value) => (value === "top" ? null : "top"))}>
            <ChevronDown size={16} />
          </button>
          {menuOpen === "top" ? publishMenu : null}
        </div>
      </header>

      {preview ? null : (
        <div className={styles.mobileBar}>
          <button type="button" className={styles.topButton} data-kind="outline" aria-expanded={drawer === "left"} onClick={() => setDrawer(drawer === "left" ? null : "left")}>
            <BlocksIcon size={16} aria-hidden="true" />
            Bloklar
          </button>
          <button type="button" className={styles.topButton} data-kind="outline" aria-expanded={drawer === "right"} onClick={() => setDrawer(drawer === "right" ? null : "right")}>
            <Settings2 size={16} aria-hidden="true" />
            Ayarlar
          </button>
          {meta.status === "draft" ? (
            <button type="button" className={styles.topButton} data-kind="ai" disabled={isBusy} onClick={() => { setDrawer(null); setStudioRequest((value) => value + 1); }}>
              <Wand2 size={16} aria-hidden="true" />
              AI ile Yaz
            </button>
          ) : null}
          {/* Telefonda tek görsel girişi: kaynak, yükleme, AI ve ChatGPT; bölüm planı (AI Görselleri) oradan açılır. */}
          <button type="button" className={styles.topButton} data-kind="outline" onClick={() => { setDrawer(null); setImagesOpen(true); }}>
            <Images size={16} aria-hidden="true" />
            Görseller
          </button>
          {saveState.kind === "error" || saveState.kind === "conflict" ? (
            <p className={styles.mobileSave} role="alert">
              <CloudOff size={16} aria-hidden="true" />
              <span>{saveState.kind === "conflict" ? "Bu yazı başka bir sekmede değişti." : "Değişiklikler kaydedilemedi."}</span>
              {saveState.kind === "conflict" ? (
                <button type="button" onClick={() => window.location.reload()}>Sayfayı yenile</button>
              ) : (
                <button type="button" onClick={flush}>
                  <RotateCw size={14} aria-hidden="true" /> Yeniden dene
                </button>
              )}
            </p>
          ) : null}
        </div>
      )}

      {preview ? null : (
        <aside className={styles.left} aria-label="Blok kütüphanesi">
          <button type="button" className={styles.collapse} aria-label={leftOpen ? "Kütüphaneyi daralt" : "Kütüphaneyi aç"} title={leftOpen ? "Kütüphaneyi daralt" : "Kütüphaneyi aç"} aria-expanded={leftOpen} onClick={() => setLeftOpen((value) => !value)}>
            {leftOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </button>
          <button type="button" className={styles.drawerClose} aria-label="Kütüphaneyi kapat" onClick={() => setDrawer(null)}>
            <X size={18} />
          </button>
          <div className={styles.leftInner}>
            <BlockLibrary onAdd={addFromPalette} onDragStart={startDrag} onDragEnd={endDrag} onPointerDrag={beginDrag} onTemplate={chooseTemplate} insertHint={insertHint} />
            <AiLauncher
              postId={postId}
              ensureDraft={ensureDraft}
              categories={categories}
              siteHost={siteHost}
              disabled={meta.status !== "draft" || isBusy}
              hasContent={aiHasContent}
              onApplyDraft={applyAiDraft}
              onPublish={publishAi}
              templateKey={activeTemplate}
              getBlocks={() => blocksRef.current}
              onApplyTemplateFill={applyTemplateFill}
              canReplaceSilently={canReplaceSilently}
              openSignal={studioRequest}
              onOpenHandled={studioHandled}
            />
          </div>
        </aside>
      )}

      <main className={styles.stage}>
        <Canvas
          blocks={blocks}
          headings={headings}
          title={form.title}
          excerpt={form.excerpt}
          cover={form.cover}
          coverAlt={form.coverAlt}
          device={device}
          preview={preview}
          selectedId={selectedId}
          dragging={dragging}
          insertAt={insertAt}
          onTitleChange={onTitleChange}
          onSelect={select}
          onChangeProps={changeProps}
          onMove={moveBlock}
          onDuplicate={duplicateBlock}
          onRemove={removeBlock}
          onOpenSettings={openSettings}
          onOpenPageSettings={openPageSettings}
          onDropAt={dropAt}
          onPickInsert={setInsertAt}
          onQuickAdd={addFromPalette}
          onPointerDrag={beginDrag}
          paperRef={paperRef}
          visualMarks={visualMarks}
          onOpenVisuals={() => setVisualOpen(true)}
        />
      </main>

      {/* Sürükleme hayaleti ve bırakma çizgisi: sabit konumlu, yerleşimi kaydırmaz. */}
      <div ref={ghostRef} className={styles.dragGhost} hidden={!dragActive} aria-hidden="true">
        {dragActive?.label}
      </div>
      <div ref={lineRef} className={styles.dropLine} hidden aria-hidden="true" />
      <p className={styles.srOnly} aria-live="polite">
        {dragActive ? `${dragActive.label} taşınıyor. Bırakmak için parmağını kaldır; iptal için Esc.` : ""}
      </p>

      {/* Telefonda ana işlemler başparmak erişiminde: Önizle · Kaydet · Yayınla.
          Taslak kaydı ile yayın ayrı düğmelerdir; yayın kısa bir onay ister. */}
      <nav className={styles.actionBar} aria-label="Yazı işlemleri">
        <button type="button" className={styles.actionButton} aria-pressed={preview} onClick={togglePreview}>
          {preview ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          <span>{preview ? "Düzenle" : "Önizle"}</span>
        </button>
        {meta.status === "draft" ? (
          <button type="button" className={styles.actionButton} aria-label="Taslak Kaydet" disabled={isBusy} onClick={saveAndReturn}>
            {busy === "manual" ? <LoaderCircle size={18} className={styles.spin} aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}
            <span>Kaydet</span>
          </button>
        ) : null}
        {meta.status === "draft" ? (
          <button type="button" className={styles.actionPrimary} disabled={isBusy} onClick={() => setConfirmPublish(true)}>
            {busy === "publish" ? <LoaderCircle size={18} className={styles.spin} aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
            <span>{publishLabel}</span>
          </button>
        ) : (
          <button type="button" className={styles.actionPrimary} disabled={isBusy} onClick={() => saveManually(updateLabel)}>
            {busy === "manual" ? <LoaderCircle size={18} className={styles.spin} aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
            <span>Güncelle</span>
          </button>
        )}
        <div className={styles.actionMore}>
          <button type="button" className={styles.actionButton} aria-label="Diğer yayın seçenekleri" aria-haspopup="menu" aria-expanded={menuOpen === "bottom"} onClick={() => setMenuOpen((value) => (value === "bottom" ? null : "bottom"))}>
            <Ellipsis size={20} aria-hidden="true" />
          </button>
          {menuOpen === "bottom" ? publishMenu : null}
        </div>
      </nav>

      {preview ? null : (
        <aside className={styles.right} aria-label="Ayarlar">
          <button type="button" className={styles.drawerClose} aria-label="Ayarları kapat" onClick={() => setDrawer(null)}>
            <X size={18} />
          </button>
          <Inspector
            tab={rightTab}
            onTab={setRightTab}
            block={selectedBlock}
            onBlockChange={changeProps}
            onBlockRemove={removeBlock}
            page={{
              form,
              meta,
              state,
              categories,
              siteHost,
              postId,
              schedule,
              busy: isBusy,
              onUpdate: updateForm,
              onSchedule: setSchedule,
              onCategoryCreated: (category) => setCategories((current) => [...current, category]),
              onTrash: () => setConfirmTrash(true),
            }}
          />
        </aside>
      )}

      {drawer ? <button type="button" className={styles.backdrop} aria-label="Paneli kapat" onClick={() => setDrawer(null)} /> : null}

      {draftNotes && !preview ? (
        <DraftNotes notes={draftNotes} onAddImages={meta.status === "draft" ? () => setImagesOpen(true) : null} onClose={() => setDraftNotes(null)} />
      ) : null}
      {visualOpen ? (
        <VisualStudio
          postId={postId}
          ensureDraft={ensureDraft}
          title={form.title}
          getBlocks={() => blocksRef.current}
          onInsert={insertVisualPicks}
          onClose={() => {
            setVisualOpen(false);
            setVisualMarks(visualMarksFor(postId));
          }}
        />
      ) : null}
      {imagesOpen ? (
        <StudioDialog
          initialPhase="images"
          title={form.title}
          imageSource={draftNotes?.imageSource ?? null}
          postId={postId}
          ensureDraft={ensureDraft}
          templateKey={activeTemplate}
          getBlocks={() => blocksRef.current}
          onApply={() => {}}
          onPlaceImages={placeStudioImages}
          coverTaken={Boolean(form.cover)}
          onOpenVisualPlan={() => {
            setImagesOpen(false);
            setVisualOpen(true);
          }}
          onClose={() => setImagesOpen(false)}
        />
      ) : null}

      <UpdateSuggestions
        postId={postId}
        status={meta.status}
        getBlocks={() => blocksRef.current}
        onApply={(next, label) => {
          actions.replaceAll(next);
          setSelectedId(null);
          toast(`Öneri eklendi (${label}). “Geri al” ile kaldırabilirsiniz.`);
        }}
      />

      <dialog ref={templateDialog} className={styles.dialog} aria-labelledby="template-dialog-title" onCancel={(event) => { event.preventDefault(); setPendingTemplate(null); }}>
        <h2 id="template-dialog-title" className={styles.dialogTitle}>
          “{pendingTemplate?.label}” şablonu nasıl eklensin?
        </h2>
        <p className={styles.muted}>
          Tuvalde {blocks.length} blok var. Şablonu mevcut içeriğin sonuna ekleyebilir ya da içeriğin yerine koyabilirsiniz.
        </p>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.btnSmall} onClick={() => setPendingTemplate(null)}>
            Vazgeç
          </button>
          <button type="button" className={styles.btnSmall} data-danger="true" onClick={() => applyTemplate("replace")}>
            Mevcut içeriği değiştir
          </button>
          <button type="button" className={styles.btnSmall} data-primary="true" onClick={() => applyTemplate("append")}>
            Sona ekle
          </button>
        </div>
      </dialog>

      <ConfirmDialog
        open={confirmPublish}
        title={schedule ? "Yazı planlansın mı?" : "Yazı yayınlansın mı?"}
        confirmLabel={publishLabel}
        busy={busy === "publish"}
        onCancel={() => setConfirmPublish(false)}
        onConfirm={publish}
      >
        {schedule
          ? `Yazı ${formatDateTime(new Date(schedule).toISOString())} tarihinde herkese açık olur.`
          : `Yazı herkese açık olur: ${siteHost}/blog/${publishSlug || "…"}.`}{" "}
        Gerekirse daha sonra “Yayından kaldır” ile taslağa alabilirsin.
      </ConfirmDialog>

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
        Kaydedilmemiş son değişiklikler kaybolur. Yazıyı çöp kutusundan geri yükleyebilirsiniz.
      </ConfirmDialog>

      <Toaster />
    </div>
  );
}
