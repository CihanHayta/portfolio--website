"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleAlert, ClipboardPaste, ExternalLink, ImagePlus, Images, LoaderCircle, RefreshCw, Sparkles, Star, Trash2, Upload, X } from "lucide-react";
import { deleteMedia } from "@/app/admin/blog/actions";
import { BRAND_NEGATIVE, CHATGPT_URL, PURPOSE_ASPECT, buildBrandImagePrompt, buildHandoffPrompt } from "@/lib/ai/brandVisual";
import { imageTargets, suggestTarget } from "@/lib/blog/blocks/imageTargets";
import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES, uploadMedia } from "../upload";
import { resizeForAnalysis } from "./resizeImage";
import styles from "./studio.module.css";

// Görsel adımı. Tüm görseller (kaynak, yüklenen, AI, ChatGPT) tek listede durur;
// liste üst bileşende taslağa bağlı olarak Supabase'e kaydedilir. Seçim (`selected`)
// ile durum (`state`: arşivde, yazıya eklendi, kapak…) birbirinden ayrıdır.
// Yazıya ekleme yalnızca kullanıcı bir düğmeye bastığında olur ve sonuç sayısı
// gerçek yerleşime göre bildirilir; hiçbir başarısızlık başarı gibi gösterilmez.

const PROVIDER_LABELS = { pollinations: "Pollinations", cloudflare: "Cloudflare Workers AI", comfyui: "ComfyUI", chatgpt: "ChatGPT" };
const MODE_LABELS = {
  described: "Referans tarif edilip sıfırdan üretildi (kopya değil)",
  reference: "Referans görselden üretildi",
  text: "Konudan üretildi",
  handoff: "ChatGPT’de senin hesabınla üretildi",
};
const STATE_LABELS = { candidate: "Onay bekliyor", archived: "Arşivde", placed: "Yazıda", cover: "Kapak", failed: "Hata" };

const hashId = (text) => {
  let hash = 5381;
  for (const char of String(text)) hash = ((hash << 5) + hash + char.codePointAt(0)) >>> 0;
  return hash.toString(36);
};
export const sourceImageId = (src) => `s-${hashId(src)}`;
const readJson = (response) => response.json().catch(() => ({}));
const offline = (failure) => (failure instanceof TypeError ? "Sunucuya ulaşılamadı. Bağlantını kontrol edip yeniden dene." : failure.message);
const purposeOf = (target) => (target === "cover" ? "cover" : target === "gallery" ? "gallery" : "inline");
const hostOf = (src) => {
  try {
    return new URL(src).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

function originLabel(entry) {
  if (entry.kind === "source") return entry.role === "og" ? "Kaynak · kapak adayı" : "Kaynak görseli";
  if (entry.kind === "upload") return "Yüklendi";
  if (entry.kind === "handoff") return "ChatGPT";
  return `AI · ${PROVIDER_LABELS[entry.provider] ?? entry.provider ?? "ücretsiz servis"}${entry.model ? ` · ${entry.model}` : ""}`;
}

function ImageCard({ entry, targets, selectable = true, broken, onBroken, onToggle, onChange, children }) {
  const src = entry.url || entry.src;
  const valid = targets.some((item) => item.value === entry.target);
  const status = STATE_LABELS[entry.state];
  return (
    <li className={styles.imageCard} data-selected={entry.selected || undefined} data-state={entry.state}>
      {selectable ? (
        <label className={styles.imageThumb}>
          <input type="checkbox" checked={Boolean(entry.selected)} onChange={() => onToggle(entry)} />
          <span className={styles.srOnly}>{`${entry.alt || "Görsel"} — seç`}</span>
          {broken ? (
            <span className={styles.broken}>Önizleme yüklenemedi</span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={onBroken} />
          )}
          {status ? <span className={styles.stateChip} data-state={entry.state}>{status}</span> : null}
        </label>
      ) : (
        <div className={styles.imageThumb}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" loading="lazy" onError={onBroken} />
          {status ? <span className={styles.stateChip} data-state={entry.state}>{status}</span> : null}
        </div>
      )}
      <div className={styles.imageMeta}>
        <span className={styles.badge}>{originLabel(entry)}</span>
        {entry.mode && MODE_LABELS[entry.mode] ? <span className={styles.imageNote}>{MODE_LABELS[entry.mode]}</span> : null}
        {entry.kind === "source" && entry.section ? <span className={styles.imageNote}>Kaynakta: {entry.section}</span> : null}
        {entry.kind === "source" && entry.src ? <span className={styles.imageNote}>{hostOf(entry.src)}</span> : null}
      </div>
      {entry.selected || entry.state === "candidate" ? (
        <div className={styles.imageFields}>
          <label className={styles.imageField}>
            <span>Nereye eklensin?</span>
            <select className={styles.input} value={valid ? entry.target : ""} onChange={(event) => onChange(entry, { target: event.target.value })}>
              <option value="" disabled>Hedef seç…</option>
              {targets.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className={styles.imageField}>
            <span>Alt metin</span>
            <input
              className={styles.input}
              value={entry.alt}
              maxLength={300}
              placeholder="Görseli kısaca tarif et"
              aria-invalid={!entry.alt.trim() || undefined}
              onChange={(event) => onChange(entry, { alt: event.target.value })}
            />
          </label>
        </div>
      ) : null}
      {entry.error ? <span className={styles.warnText}><CircleAlert size={13} aria-hidden="true" /> {entry.error}</span> : null}
      {children}
    </li>
  );
}

export default function ImageStep({ source = null, shotCount = 0, blocks = [], topic = "", images, setImages, onPlace, ensureDraft = async () => null, coverTaken = false, onOpenVisualPlan = null }) {
  const sourceImages = useMemo(() => source?.images ?? [], [source]);
  const targets = useMemo(() => imageTargets(blocks), [blocks]);
  const [tab, setTab] = useState(() => (sourceImages.length ? "source" : "mine"));
  const [license, setLicense] = useState(false);
  const [licenseError, setLicenseError] = useState(false);
  const [busy, setBusy] = useState(null); // place | cover | archive | ai | upload
  const [jobs, setJobs] = useState([]); // AI üretimleri: { id, ref, status, error }
  const [notice, setNotice] = useState(null); // { tone: ok | warn | error, text }
  const [broken, setBroken] = useState(() => new Set());
  const [providers, setProviders] = useState(null);
  const [handoff, setHandoff] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [idea, setIdea] = useState(() => ({ subject: topic.slice(0, 200), target: "cover" }));
  const [dragging, setDragging] = useState(false);
  const busyRef = useRef(false);
  const imagesRef = useRef(images);
  const fileRef = useRef(null);
  const handoffFileRef = useRef(null);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  // Yalnızca yapılandırılmış ücretsiz görsel servisleri (anahtarı olmayanlar listelenmez).
  useEffect(() => {
    let active = true;
    fetch("/api/admin/ai/services", { cache: "no-store" })
      .then(readJson)
      .then((data) => {
        if (!active) return;
        setProviders(
          (data.services ?? [])
            .filter((service) => service.category === "image" && service.configured)
            .map((service) => ({ id: service.provider, label: PROVIDER_LABELS[service.provider] ?? service.label, ready: service.state === "active", imageToImage: service.tasks.includes("referans görselden üretim") }))
        );
      })
      .catch(() => active && setProviders([]));
    return () => {
      active = false;
    };
  }, []);

  const readyProviders = (providers ?? []).filter((item) => item.ready);
  const aiReady = readyProviders.length > 0;
  const canReference = readyProviders.some((item) => item.imageToImage);

  // --- Liste ------------------------------------------------------------------------
  const byId = useMemo(() => new Map(images.map((item) => [item.id, item])), [images]);
  const sourceEntries = useMemo(() => {
    const listed = sourceImages.map((image) => {
      const id = sourceImageId(image.src);
      return { id, kind: "source", state: "idle", selected: false, alt: image.alt ?? "", target: null, src: image.src, section: image.section ?? "", role: image.role === "og" ? "og" : "content", ...byId.get(id) };
    });
    // Kaynak listesi yeniden okunamadıysa daha önce seçilen kaynak görselleri yine görünür.
    const known = new Set(listed.map((item) => item.id));
    return [...listed, ...images.filter((item) => item.kind === "source" && !known.has(item.id))];
  }, [sourceImages, byId, images]);
  const candidates = images.filter((item) => item.kind !== "source" && item.state === "candidate");
  const ownEntries = images.filter((item) => item.kind !== "source" && item.state !== "candidate" && item.state !== "rejected");
  const selected = [...sourceEntries, ...ownEntries].filter((item) => item.selected);
  const needsLicense = selected.some((item) => item.kind === "source" && !item.mediaId);
  const validTarget = (target) => targets.some((item) => item.value === target);

  // Kaynak görselleri listede sanal durur; ilk etkileşimde kalıcı listeye girer.
  const change = (entry, value) =>
    setImages((list) => (list.some((item) => item.id === entry.id) ? list.map((item) => (item.id === entry.id ? { ...item, ...value } : item)) : [...list, { ...entry, ...value }]));
  const patch = (id, value) => setImages((list) => list.map((item) => (item.id === id ? { ...item, ...value } : item)));
  const suggest = (entry) =>
    suggestTarget(blocks, { section: entry.section, role: entry.role }, {
      coverTaken: coverTaken || imagesRef.current.some((item) => item.state === "cover" || (item.selected && item.target === "cover")),
      used: new Set(imagesRef.current.filter((item) => item.selected && item.target).map((item) => item.target)),
    });
  const toggle = (entry) => {
    if (entry.selected) return change(entry, { selected: false });
    change(entry, {
      selected: true,
      target: validTarget(entry.target) ? entry.target : suggest(entry),
      alt: entry.alt || [topic, entry.section].filter(Boolean).join(" — ").slice(0, 300),
      error: "",
    });
  };
  const clearSelection = () => setImages((list) => list.map((item) => (item.selected ? { ...item, selected: false } : item)));
  const sectionName = (entry) => {
    const found = targets.find((item) => item.value === entry.target);
    return found && entry.target.startsWith("block:") ? found.label.replace(/^(H\d|Boş görsel alanı) · /, "") : entry.section ?? "";
  };

  // --- Kalıcı medya -----------------------------------------------------------------
  const importSource = async (entry, draftId) => {
    const response = await fetch("/api/admin/ai/import-image", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ src: entry.src, alt: entry.alt, licenseConfirmed: true, ...(draftId ? { postId: draftId } : {}) }),
    });
    const data = await readJson(response);
    if (!response.ok || !data.media) throw new Error(data.error || "Görsel aktarılamadı.");
    return data.media;
  };

  // Seçilenlerle işlem: bloga ekle, kapak yap, arşive kaydet.
  const act = async (action, list = selected) => {
    if (busyRef.current || !list.length) return;
    if (action === "cover" && list.length !== 1) return;
    if (action !== "archive" && list.some((item) => !String(item.alt ?? "").trim())) {
      setNotice({ tone: "error", text: "Alt metni boş görsel var. Görme engelli okurlar ve arama motorları için her görseli kısaca tarif et." });
      return;
    }
    if (action === "place" && list.some((item) => !validTarget(item.target))) {
      setNotice({ tone: "error", text: "Hedef bölümü seçilmemiş görsel var. Her görsel için “Nereye eklensin?” alanını seç." });
      return;
    }
    if (list.some((item) => item.kind === "source" && !item.mediaId) && !license) {
      setLicenseError(true);
      setNotice({ tone: "error", text: "Kaynak sitedeki görselleri kullanmadan önce kullanım hakkın olduğunu onayla." });
      return;
    }
    busyRef.current = true;
    setBusy(action);
    setNotice(null);
    try {
      const draftId = await ensureDraft().catch(() => null);
      const ready = [];
      const failed = [];
      for (const item of list) {
        if (item.mediaId && item.url) {
          ready.push(item);
          continue;
        }
        if (item.kind !== "source") {
          failed.push({ item, error: "Görsel dosyası bulunamadı." });
          continue;
        }
        try {
          const media = await importSource(item, draftId);
          const value = { mediaId: media.id, url: media.url, width: media.width ?? null, height: media.height ?? null, state: ["idle", "failed"].includes(item.state) ? "archived" : item.state, error: "" };
          patch(item.id, value);
          ready.push({ ...item, ...value });
        } catch (failure) {
          const error = offline(failure);
          patch(item.id, { state: "failed", error });
          failed.push({ item, error });
        }
      }

      const parts = [];
      let success = 0;
      let problems = failed.length;
      if (action === "archive") {
        success = ready.length;
        for (const item of ready) patch(item.id, { selected: false, state: ["idle", "candidate", "failed"].includes(item.state) ? "archived" : item.state });
        if (success) parts.push(`${success} görsel arşive (medya kütüphanesine) kaydedildi.`);
      } else if (ready.length) {
        const outcome = onPlace(
          ready.map((item) => ({ url: item.url, mediaId: item.mediaId, alt: item.alt.trim(), width: item.width ?? null, height: item.height ?? null, target: action === "cover" ? "cover" : item.target }))
        );
        const unplaced = new Set((outcome?.unplaced ?? []).map((item) => item.mediaId));
        const coverId = outcome?.cover?.media?.id ?? null;
        if (coverId) setImages((items) => items.map((item) => (item.state === "cover" && item.mediaId !== coverId ? { ...item, state: "archived" } : item)));
        for (const item of ready) {
          if (item.mediaId === coverId) patch(item.id, { state: "cover", selected: false, target: "cover", error: "" });
          else if (unplaced.has(item.mediaId)) patch(item.id, { error: "Hedef bölüm yazıda bulunamadı; başka bir hedef seç." });
          else patch(item.id, { state: "placed", selected: false, error: "" });
        }
        success = (outcome?.placed ?? 0) + (coverId ? 1 : 0);
        if (outcome?.placed) parts.push(`${outcome.placed} görsel bloga eklendi.`);
        if (coverId) parts.push("Kapak görseli ayarlandı.");
        if (unplaced.size) parts.push(`${unplaced.size} görselin hedef bölümü bulunamadı.`);
        problems += unplaced.size;
      }
      if (failed.length) parts.push(`${failed.length} görsel işlenemedi: ${failed[0].error}`);
      setNotice(
        success
          ? { tone: problems ? "warn" : "ok", text: parts.join(" ") }
          : { tone: "error", text: `Hiçbir görsel ${action === "archive" ? "kaydedilemedi" : "eklenemedi"}. ${parts.join(" ")}`.trim() }
      );
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  // --- AI ile yeniden oluşturma ------------------------------------------------------
  // Referans: kaynak görseli (tarif edilir) ya da kütüphanedeki görsel. Gerçek
  // görselden-görsele yalnızca bunu destekleyen ücretsiz servis hazırsa kullanılır.
  const generateOne = async (ref, { provider = null, draftId = null } = {}) => {
    const opId = crypto.randomUUID();
    const reference = ref.mediaId && ref.url ? { kind: "media", url: ref.url } : ref.kind === "source" && ref.src ? { kind: "source", src: ref.src, licenseConfirmed: license } : null;
    const realReference = canReference && reference && (reference.kind === "media" || license);
    const purpose = purposeOf(ref.target);
    const section = sectionName(ref);
    setJobs((items) => [...items.filter((job) => job.ref.id !== ref.id), { id: opId, ref, status: "loading", error: "" }]);
    try {
      const response = await fetch("/api/admin/ai/visual-image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          opId,
          ...(draftId ? { postId: draftId } : {}),
          persist: true,
          ...(provider ? { provider } : {}),
          mode: reference ? (realReference ? "reference" : "describe") : "text",
          ...(reference ? { reference } : {}),
          options: ["inspire"],
          format: purpose === "cover" ? "cover" : "inline",
          item: {
            alt: ref.alt,
            topic,
            section,
            purpose,
            aspect: PURPOSE_ASPECT[purpose],
            negative: BRAND_NEGATIVE,
            prompt: buildBrandImagePrompt({ description: { subject: ref.alt || topic }, topic, section, purpose, reference: Boolean(reference) }),
          },
        }),
      });
      const data = await readJson(response);
      if (!response.ok || !data.candidate?.media) throw new Error(data.error || "Görsel üretilemedi.");
      const candidate = data.candidate;
      setImages((list) => [
        ...list,
        {
          id: `ai-${candidate.media.id.slice(0, 13)}`,
          kind: "ai",
          state: "candidate",
          selected: false,
          mediaId: candidate.media.id,
          url: candidate.media.url,
          width: candidate.media.width ?? candidate.width ?? null,
          height: candidate.media.height ?? candidate.height ?? null,
          provider: candidate.provider,
          model: candidate.modelLabel || candidate.model || "",
          mode: ["described", "reference"].includes(candidate.mode) ? candidate.mode : "text",
          referenceId: ref.id,
          alt: ref.alt,
          target: ref.target,
          section: ref.section ?? "",
        },
      ]);
      setJobs((items) => items.filter((job) => job.id !== opId));
      return { ok: true };
    } catch (failure) {
      const error = offline(failure);
      setJobs((items) => items.map((job) => (job.id === opId ? { ...job, status: "error", error } : job)));
      return { ok: false, error };
    }
  };

  const regenerate = async (list, options = {}) => {
    if (busyRef.current || !list.length) return;
    if (!aiReady) {
      setNotice({ tone: "error", text: "Şu an hazır ücretsiz görsel servisi yok. “ChatGPT ile üret” ile kendi hesabından üretebilir ya da görsel yükleyebilirsin." });
      return;
    }
    busyRef.current = true;
    setBusy("ai");
    setNotice(null);
    setTab("mine");
    try {
      const draftId = await ensureDraft().catch(() => null);
      let made = 0;
      const errors = [];
      for (const ref of list) {
        const result = await generateOne(ref, { ...options, draftId });
        if (result.ok) made += 1;
        else errors.push(result.error);
      }
      setNotice(
        made
          ? { tone: errors.length ? "warn" : "ok", text: `${made} yeni görsel üretildi; onayını bekliyor.${errors.length ? ` ${errors.length} görsel üretilemedi: ${errors[0]}` : ""}` }
          : { tone: "error", text: `Görsel üretilemedi: ${errors[0] ?? "bilinmeyen hata"}. Taslağın ve seçimlerin korunuyor.` }
      );
      if (made) clearSelection();
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const referenceOf = (item) =>
    sourceEntries.find((entry) => entry.id === item.referenceId) ??
    images.find((entry) => entry.id === item.referenceId) ?? { id: item.referenceId || `t-${hashId(item.alt)}`, kind: "text", alt: item.alt, target: item.target, section: item.section };
  const otherProvider = (item) => readyProviders.find((provider) => provider.id !== item.provider)?.id ?? null;

  const accept = (item) => patch(item.id, { state: "archived", selected: true, target: validTarget(item.target) ? item.target : suggest(item) });
  const reject = async (item) => {
    if (busyRef.current) return;
    const result = item.mediaId ? await deleteMedia(item.mediaId).catch(() => ({ ok: false, error: "Sunucuya ulaşılamadı." })) : { ok: true };
    if (!result?.ok) return setNotice({ tone: "error", text: `Görsel kaldırılamadı: ${result?.error ?? "bilinmeyen hata"}` });
    setImages((list) => list.filter((entry) => entry.id !== item.id));
    setNotice({ tone: "ok", text: "Görsel reddedildi ve medya kütüphanesinden silindi." });
  };

  // --- Yükleme (kendi görselin ya da ChatGPT sonucu) --------------------------------
  const uploadFiles = async (files, meta = {}) => {
    const list = [...files].filter(Boolean).slice(0, 12);
    if (!list.length || busyRef.current) return;
    busyRef.current = true;
    setBusy("upload");
    setNotice(null);
    let made = 0;
    const errors = [];
    try {
      const draftId = await ensureDraft().catch(() => null);
      for (const original of list) {
        const id = crypto.randomUUID();
        setUploads((items) => [...items, { id, name: original.name, progress: 0 }]);
        try {
          // ChatGPT görselleri büyük PNG olabilir: sınırı aşan görsel tarayıcıda küçültülür.
          const file = ACCEPTED_TYPES.includes(original.type) && original.size > MAX_UPLOAD_BYTES ? await resizeForAnalysis(original, { maxEdge: 2048, quality: 0.9 }) : original;
          const media = await uploadMedia(file, (progress) => setUploads((items) => items.map((item) => (item.id === id ? { ...item, progress } : item))), {
            alt: meta.alt,
            origin: meta.kind === "handoff" ? "handoff" : "upload",
            provider: meta.kind === "handoff" ? "chatgpt" : undefined,
            model: meta.kind === "handoff" ? "kullanıcı hesabı" : undefined,
            draftPostId: draftId,
          });
          const entry = {
            id: `${meta.kind === "handoff" ? "h" : "u"}-${media.id.slice(0, 13)}`,
            kind: meta.kind === "handoff" ? "handoff" : "upload",
            state: meta.kind === "handoff" ? "candidate" : "archived",
            selected: meta.kind !== "handoff",
            mediaId: media.id,
            url: media.url,
            width: media.width ?? null,
            height: media.height ?? null,
            alt: meta.alt ?? "",
            ...(meta.kind === "handoff" ? { provider: "chatgpt", mode: "handoff", referenceId: meta.referenceId ?? undefined } : {}),
          };
          entry.target = meta.target && validTarget(meta.target) ? meta.target : suggest(entry);
          setImages((items) => [...items, entry]);
          made += 1;
        } catch (failure) {
          errors.push(`${original.name}: ${offline(failure)}`);
        } finally {
          setUploads((items) => items.filter((item) => item.id !== id));
        }
      }
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
    if (meta.kind === "handoff" && made) setHandoff(null);
    setTab("mine");
    setNotice(
      made
        ? { tone: errors.length ? "warn" : "ok", text: `${made} görsel kütüphaneye kaydedildi${meta.kind === "handoff" ? "; onaylayıp yazıya ekleyebilirsin" : " ve seçildi"}.${errors.length ? ` Yüklenemeyen: ${errors.join("; ")}` : ""}` }
        : { tone: "error", text: `Görsel yüklenemedi. ${errors.join("; ")}` }
    );
  };

  // --- ChatGPT ile elle üretim ------------------------------------------------------
  const startHandoff = (ref = null) => {
    const target = ref?.target ?? idea.target;
    const prompt = buildHandoffPrompt({ topic, section: ref ? sectionName(ref) : "", purpose: purposeOf(target), alt: ref?.alt ?? idea.subject, hasReference: Boolean(ref) });
    setHandoff({ referenceId: ref?.id ?? null, referenceUrl: ref?.url || ref?.src || "", target, alt: (ref?.alt ?? idea.subject).slice(0, 300), prompt, opened: false, copied: false });
  };
  const openChatGpt = () => {
    // Referans varsa istem otomatik gönderilmesin diye yalnızca ChatGPT açılır; istem panodadır.
    const url = handoff.referenceUrl ? CHATGPT_URL : `${CHATGPT_URL}?q=${encodeURIComponent(handoff.prompt)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    const copy = navigator.clipboard?.writeText ? navigator.clipboard.writeText(handoff.prompt) : Promise.reject();
    copy.then(
      () => setHandoff((value) => value && { ...value, opened: true, copied: true }),
      () => setHandoff((value) => value && { ...value, opened: true, copied: false })
    );
  };
  const handoffMeta = handoff ? { kind: "handoff", target: handoff.target, alt: handoff.alt, referenceId: handoff.referenceId } : null;
  const pasteFromClipboard = async () => {
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((value) => ACCEPTED_TYPES.includes(value));
        if (type) return uploadFiles([new File([await item.getType(type)], `chatgpt.${type.split("/")[1]}`, { type })], handoffMeta);
      }
      setNotice({ tone: "error", text: "Panoda görsel bulunamadı. ChatGPT’de görseli kopyala ya da indirip “Dosya seç” ile ekle." });
    } catch {
      setNotice({ tone: "error", text: "Panoya erişilemedi. Görseli indirip “Dosya seç” ile ekle." });
    }
  };
  const canReadClipboard = typeof navigator !== "undefined" && Boolean(navigator.clipboard?.read);

  const busyText = { place: "Bloga ekleniyor…", cover: "Kapak ayarlanıyor…", archive: "Kaydediliyor…", ai: "Görsel üretiliyor…", upload: "Yükleniyor…" }[busy];
  const single = selected.length === 1;

  return (
    <div className={styles.imageStep}>
      <div className={styles.imageTabs} role="tablist" aria-label="Görsel kaynağı">
        {[
          ["source", `Kaynak (${sourceEntries.length})`, Images],
          ["mine", `Görsellerim (${ownEntries.length + candidates.length})`, ImagePlus],
          ["create", "Yeni üret", Sparkles],
        ].map(([key, label, Icon]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={styles.imageTab} onClick={() => setTab(key)}>
            <Icon size={16} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      {notice ? (
        <p className={notice.tone === "error" ? styles.errorBox : notice.tone === "warn" ? styles.notice : styles.okBox} role="status">
          {notice.text}
        </p>
      ) : null}

      {handoff ? (
        <section
          className={styles.handoff}
          aria-labelledby="handoff-title"
          onPaste={(event) => {
            const files = [...(event.clipboardData?.files ?? [])].filter((file) => ACCEPTED_TYPES.includes(file.type));
            if (files.length) {
              event.preventDefault();
              uploadFiles(files.slice(0, 1), handoffMeta);
            }
          }}
        >
          <div className={styles.handoffHead}>
            <h3 id="handoff-title" className={styles.panelTitle}>ChatGPT ile üret (kendi ücretsiz hesabınla)</h3>
            <button type="button" className={styles.iconButton} aria-label="ChatGPT panelini kapat" onClick={() => setHandoff(null)}>
              <X size={18} />
            </button>
          </div>
          <ol className={styles.handoffSteps}>
            <li>
              <strong>İstemi kopyala ve ChatGPT’yi aç</strong>
              <textarea className={`${styles.input} ${styles.textarea}`} readOnly rows={5} value={handoff.prompt} aria-label="ChatGPT istemi" />
              <button type="button" className={styles.primary} onClick={openChatGpt}>
                <ExternalLink size={16} aria-hidden="true" /> İstemi kopyala ve ChatGPT’yi aç
              </button>
              {handoff.opened ? (
                <span className={handoff.copied ? styles.okText : styles.warnText}>
                  {handoff.copied ? "İstem panoya kopyalandı; ChatGPT’de yapıştır." : "İstem kopyalanamadı; yukarıdaki metni seçip kopyala."}
                </span>
              ) : null}
            </li>
            {handoff.referenceUrl ? (
              <li>
                <strong>Referans görseli ChatGPT’ye ekle</strong>
                <span className={styles.hint}>Görseli aç, kaydet ya da kopyala; ChatGPT’de ataç simgesiyle ekle ve istemi yapıştır.</span>
                <a className={styles.secondary} href={handoff.referenceUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={15} aria-hidden="true" /> Referans görseli aç
                </a>
              </li>
            ) : null}
            <li>
              <strong>Ürettiğin görseli buraya ekle</strong>
              <span className={styles.hint}>ChatGPT’de görseli kopyala ya da indir; buraya yapıştır veya dosya olarak seç. Onayından sonra yazıya eklenir.</span>
              <div className={styles.inlineWrap}>
                {canReadClipboard ? (
                  <button type="button" className={styles.secondary} disabled={Boolean(busy)} onClick={pasteFromClipboard}>
                    <ClipboardPaste size={15} aria-hidden="true" /> Panodan yapıştır
                  </button>
                ) : null}
                <button type="button" className={styles.secondary} disabled={Boolean(busy)} onClick={() => handoffFileRef.current?.click()}>
                  <Upload size={15} aria-hidden="true" /> Dosya seç
                </button>
                <input
                  ref={handoffFileRef}
                  type="file"
                  accept={ACCEPTED_TYPES.join(",")}
                  className={styles.srOnly}
                  tabIndex={-1}
                  onChange={(event) => {
                    uploadFiles(event.target.files, handoffMeta);
                    event.target.value = "";
                  }}
                />
              </div>
            </li>
          </ol>
        </section>
      ) : null}

      {tab === "source" ? (
        <section className={styles.imageSection} aria-label="Kaynak görselleri">
          {shotCount ? (
            <p className={styles.notice}>
              Ekran görüntülerinde {shotCount} görsel görüldü. Orijinal dosyaları elimizde olmadığı için kullanmak istersen kendi kopyanı yükle ya da benzerini üret.
            </p>
          ) : null}
          {sourceEntries.length ? (
            <>
              <p className={styles.hint}>Görsele dokunarak seç; her biri için yazıda nereye ekleneceğini belirle. Kaynak görsellerin telif hakkı genellikle o siteye aittir.</p>
              <ul className={styles.imageGrid}>
                {sourceEntries.map((entry) => (
                  <ImageCard
                    key={entry.id}
                    entry={entry}
                    targets={targets}
                    broken={broken.has(entry.id)}
                    onBroken={() => setBroken((set) => new Set(set).add(entry.id))}
                    onToggle={toggle}
                    onChange={change}
                  />
                ))}
              </ul>
            </>
          ) : (
            <div className={styles.emptyState}>
              <p>Kaynak sayfada kullanılabilir görsel bulunamadı.</p>
              <div className={styles.inlineWrap}>
                <button type="button" className={styles.secondary} onClick={() => setTab("mine")}><Upload size={15} aria-hidden="true" /> Görsel yükle</button>
                <button type="button" className={styles.secondary} onClick={() => setTab("create")}><Sparkles size={15} aria-hidden="true" /> Yeni üret</button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {tab === "mine" ? (
        <section className={styles.imageSection} aria-label="Görsellerim">
          {jobs.length ? (
            <ul className={styles.jobs} aria-live="polite">
              {jobs.map((job) => (
                <li key={job.id} data-status={job.status}>
                  {job.status === "loading" ? <LoaderCircle size={16} className={styles.spin} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}
                  <span className={styles.jobText}>
                    <strong>{job.ref.alt || "Görsel"}</strong>
                    <span>{job.status === "loading" ? (job.ref.src || job.ref.url ? "Referans tarif ediliyor, yeni görsel üretiliyor… (20–60 sn)" : "Görsel üretiliyor… (10–40 sn)") : job.error}</span>
                  </span>
                  {job.status === "error" ? (
                    <span className={styles.inlineWrap}>
                      <button type="button" className={styles.linkButton} disabled={Boolean(busy)} onClick={() => regenerate([job.ref])}>Tekrar dene</button>
                      <button type="button" className={styles.linkButton} onClick={() => startHandoff(job.ref)}>ChatGPT ile üret</button>
                      <button type="button" className={styles.iconButton} aria-label="Kapat" onClick={() => setJobs((items) => items.filter((other) => other.id !== job.id))}><X size={15} /></button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {candidates.length ? (
            <>
              <h3 className={styles.imageHeading}>Onayını bekleyenler ({candidates.length})</h3>
              {!canReference && candidates.some((item) => item.mode === "described") ? (
                <p className={styles.hint}>
                  Ücretsiz servislerde gerçek görselden-görsele üretim yapılandırılmadığı için referans önce tarif edildi; yeni görsel bu tariften Persona stiliyle sıfırdan üretildi.
                </p>
              ) : null}
              <ul className={styles.imageGrid}>
                {candidates.map((item) => (
                  <ImageCard key={item.id} entry={item} targets={targets} selectable={false} broken={broken.has(item.id)} onBroken={() => setBroken((set) => new Set(set).add(item.id))} onToggle={toggle} onChange={change}>
                    <div className={styles.cardActions}>
                      <button type="button" className={styles.primary} disabled={Boolean(busy)} onClick={() => act("place", [{ ...item }])}>Bloga ekle</button>
                      <button type="button" className={styles.secondary} disabled={Boolean(busy)} onClick={() => act("cover", [{ ...item }])}><Star size={14} aria-hidden="true" /> Kapak yap</button>
                      <button type="button" className={styles.secondary} disabled={Boolean(busy)} onClick={() => accept(item)}><Check size={14} aria-hidden="true" /> Kabul et</button>
                      <button type="button" className={styles.secondary} disabled={Boolean(busy)} onClick={() => reject(item)}><Trash2 size={14} aria-hidden="true" /> Reddet</button>
                      {item.kind === "ai" ? (
                        <button type="button" className={styles.secondary} disabled={Boolean(busy)} onClick={() => regenerate([referenceOf(item)])}><RefreshCw size={14} aria-hidden="true" /> Yeniden üret</button>
                      ) : null}
                      {item.kind === "ai" && otherProvider(item) ? (
                        <button type="button" className={styles.secondary} disabled={Boolean(busy)} onClick={() => regenerate([referenceOf(item)], { provider: otherProvider(item) })}>Başka ücretsiz modelle</button>
                      ) : null}
                    </div>
                  </ImageCard>
                ))}
              </ul>
            </>
          ) : null}

          <h3 className={styles.imageHeading}>Görsellerin ({ownEntries.length})</h3>
          {ownEntries.length ? (
            <ul className={styles.imageGrid}>
              {ownEntries.map((item) => (
                <ImageCard key={item.id} entry={item} targets={targets} broken={broken.has(item.id)} onBroken={() => setBroken((set) => new Set(set).add(item.id))} onToggle={toggle} onChange={change} />
              ))}
            </ul>
          ) : (
            <p className={styles.hint}>Yüklediğin ve onayladığın görseller burada durur; sayfa yenilense de kaybolmaz.</p>
          )}

          <label
            className={styles.dropzone}
            data-dragging={dragging || undefined}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              uploadFiles(event.dataTransfer.files);
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              multiple
              className={styles.srOnly}
              onChange={(event) => {
                uploadFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <span><Upload size={16} aria-hidden="true" /> Kendi görselini yükle</span>
            <span className={styles.hint}>JPG, PNG, WebP · en fazla 4 MB · WebP’ye çevrilip medya kütüphanesine kaydedilir</span>
          </label>
          {uploads.length ? (
            <ul className={styles.uploads}>
              {uploads.map((item) => (
                <li key={item.id}>
                  <span>{item.name}</span>
                  <progress max={100} value={item.progress} aria-label={`${item.name} yükleniyor`} />
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {tab === "create" ? (
        <section className={styles.imageSection} aria-label="Yeni görsel üret">
          <div className={styles.createGrid}>
            <label className={styles.imageField}>
              <span>Görsel neyi anlatsın?</span>
              <input className={styles.input} value={idea.subject} maxLength={200} onChange={(event) => setIdea((value) => ({ ...value, subject: event.target.value }))} />
            </label>
            <label className={styles.imageField}>
              <span>Nereye eklensin?</span>
              <select className={styles.input} value={validTarget(idea.target) ? idea.target : "cover"} onChange={(event) => setIdea((value) => ({ ...value, target: event.target.value }))}>
                {targets.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className={styles.inlineWrap}>
            <button
              type="button"
              className={styles.primary}
              disabled={Boolean(busy) || !aiReady || idea.subject.trim().length < 3}
              onClick={() => regenerate([{ id: `t-${hashId(`${idea.subject}|${idea.target}`)}`, kind: "text", alt: idea.subject.trim(), target: idea.target, section: "" }])}
            >
              <Sparkles size={16} aria-hidden="true" /> Ücretsiz AI ile üret
            </button>
            <button type="button" className={styles.secondary} disabled={idea.subject.trim().length < 3} onClick={() => startHandoff(null)}>
              <ExternalLink size={15} aria-hidden="true" /> ChatGPT ile üret
            </button>
          </div>
          <p className={styles.hint}>
            {providers === null
              ? "Görsel servisleri kontrol ediliyor…"
              : aiReady
                ? `Hazır ücretsiz servis: ${readyProviders.map((item) => item.label).join(", ")}. Persona renkleri ve sade, yazısız bir kompozisyon istenir; sonuç onayına sunulur.`
                : "Şu an hazır ücretsiz görsel servisi yok. ChatGPT ile kendi hesabından üretebilir ya da görsel yükleyebilirsin."}
          </p>
          {onOpenVisualPlan ? (
            <button type="button" className={styles.linkButton} onClick={onOpenVisualPlan}>
              Bölüm bölüm AI görsel planı hazırla (AI Görselleri)
            </button>
          ) : null}
        </section>
      ) : null}

      {selected.length ? (
        <div className={styles.imageBar} role="region" aria-label="Seçilen görsellerle işlem">
          <div className={styles.imageBarHead}>
            <strong>{selected.length} görsel seçili</strong>
            {busy ? <span className={styles.hint}><LoaderCircle size={14} className={styles.spin} aria-hidden="true" /> {busyText}</span> : null}
            <button type="button" className={styles.linkButton} disabled={Boolean(busy)} onClick={clearSelection}>Seçimi temizle</button>
          </div>
          {needsLicense ? (
            <label className={styles.check} data-error={licenseError || undefined}>
              <input
                type="checkbox"
                checked={license}
                onChange={(event) => {
                  setLicense(event.target.checked);
                  setLicenseError(false);
                }}
              />
              Seçtiğim kaynak görsellerini kullanma hakkım var (kendi içeriğim, lisanslı ya da izinli).
            </label>
          ) : null}
          <div className={styles.imageBarActions}>
            <button type="button" className={styles.primary} disabled={Boolean(busy)} onClick={() => act("place")}>
              <ImagePlus size={16} aria-hidden="true" /> {single ? "Blogda kullan" : `Seçilen görselleri bloga ekle (${selected.length})`}
            </button>
            <button type="button" className={styles.secondary} disabled={Boolean(busy) || !aiReady} onClick={() => regenerate(selected)} title={aiReady ? undefined : "Hazır ücretsiz görsel servisi yok"}>
              <Sparkles size={15} aria-hidden="true" /> {single ? "AI ile benzer yeni görsel oluştur" : `Persona için AI ile yeniden oluştur (${selected.length})`}
            </button>
            {single ? (
              <button type="button" className={styles.secondary} disabled={Boolean(busy)} onClick={() => act("cover")}>
                <Star size={15} aria-hidden="true" /> Kapak görseli yap
              </button>
            ) : null}
            <button type="button" className={styles.secondary} disabled={Boolean(busy) || selected.every((item) => item.mediaId)} onClick={() => act("archive")}>
              {single ? "Görseli arşive kaydet" : `Arşive kaydet (${selected.length})`}
            </button>
            {single ? (
              <button type="button" className={styles.secondary} disabled={Boolean(busy)} onClick={() => startHandoff(selected[0])}>
                <ExternalLink size={15} aria-hidden="true" /> ChatGPT ile benzerini üret
              </button>
            ) : null}
          </div>
          {!canReference ? (
            <p className={styles.hint}>
              AI ile yeniden oluşturma: seçtiğin görsel önce tarif edilir, yeni görsel bu tariften Persona renkleriyle sıfırdan üretilir; referansın kopyası değildir.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
