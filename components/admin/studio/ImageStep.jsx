"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Check, CircleAlert, ImagePlus, Images, LoaderCircle, Replace, Sparkles, Star, Trash2, Upload, Wand2 } from "lucide-react";
import { deleteMedia } from "@/app/admin/blog/actions";
import { buildCoverPrompt, buildHandoffPrompt } from "@/lib/ai/brandVisual";
import { imageSections } from "@/lib/blog/blocks/imageSections";
import HandoffPanel from "../images/HandoffPanel";
import MascotRefs from "../images/MascotRefs";
import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES, uploadMedia } from "../upload";
import { resizeForAnalysis } from "./resizeImage";
import studio from "./studio.module.css";
import styles from "../images/images.module.css";

const MediaPickerDialog = dynamic(() => import("../MediaPickerDialog"), { ssr: false });

// Görseller ekranı: makalenin GERÇEK bölüm sırasıyla.
//   Kapak → (Giriş) → Bölüm 1..n → eşleşmesi doğrulanamayan kaynak görselleri → kütüphanen
// - Her bölümde yalnızca o bölümde gerçekten duran görseller ve kaynakta o bölüme
//   ait olduğu doğrulanan kaynak görselleri görünür; görseli olmayan bölüm boş görünür.
// - Seçimle yapılan üç işlem birbirinden ayrıdır: "Blogda kullan" (gerçek görsel
//   bloğu oluşturur), "Arşive kaydet" (yalnızca medya kütüphanesine), "Referans
//   olarak kullan" (ChatGPT'de yeni görsel için örnek; bloga hiçbir şey eklemez).
// - Otomatik görsel üretimi yok: "yeni görsel" her zaman ChatGPT ile elle üretimdir.
// - Görseller taslağa bağlı olarak Supabase'e kaydedilir (üst bileşen); sayılar gerçektir.

const STATE_LABELS = { candidate: "Onay bekliyor", archived: "Arşivde", placed: "Yazıda", cover: "Kapak", failed: "Hata" };
const REASON_LABELS = { map: "Kaynakta aynı bölüm", words: "Başlık kelimeleri eşleşti" };

const hashId = (text) => {
  let hash = 5381;
  for (const char of String(text)) hash = ((hash << 5) + hash + char.codePointAt(0)) >>> 0;
  return hash.toString(36);
};
export const sourceImageId = (src) => `s-${hashId(src)}`;
const readJson = (response) => response.json().catch(() => ({}));
const offline = (failure) => (failure instanceof TypeError ? "Sunucuya ulaşılamadı. Bağlantını kontrol edip yeniden dene." : failure.message);
const hostOf = (src) => {
  try {
    return new URL(src).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
const plural = (count, word) => `${count} ${word}`;

function Thumb({ src, alt = "", chip, chipTone, note, selected, selectable, onToggle, broken, onBroken, children, label, variant }) {
  const image = broken ? (
    <span className={studio.broken}>Önizleme yüklenemedi</span>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={onBroken} />
  );
  return (
    <li className={styles.thumb} data-selected={selected || undefined} data-variant={variant}>
      {selectable ? (
        <label className={styles.thumbImage}>
          {image}
          <span className={styles.pick}>
            <input type="checkbox" checked={Boolean(selected)} onChange={onToggle} aria-label={`${label || alt || "Görsel"} — seç`} />
          </span>
          {chip ? <span className={styles.chip} data-tone={chipTone}>{chip}</span> : null}
        </label>
      ) : (
        <span className={styles.thumbImage}>
          {image}
          {chip ? <span className={styles.chip} data-tone={chipTone}>{chip}</span> : null}
        </span>
      )}
      {note ? <span className={styles.thumbNote}>{note}</span> : null}
      {children}
    </li>
  );
}

export default function ImageStep({
  source = null,
  shotCount = 0,
  blocks = [],
  topic = "",
  images,
  setImages,
  sectionMap = {},
  cover = null, // { url, alt } — yazının şu anki kapağı
  postId = null,
  coverContext = {}, // { title, excerpt, audience } — kapak istemi için
  onPlace,
  ensureDraft = async () => null,
  focusSection = null,
}) {
  const sourceImages = useMemo(() => source?.images ?? [], [source]);
  const [license, setLicense] = useState(false);
  const [licenseError, setLicenseError] = useState(false);
  const [busy, setBusy] = useState(null); // place | cover | archive | upload | handoff
  const [notice, setNotice] = useState(null); // { tone: ok | warn | error, text }
  const [broken, setBroken] = useState(() => new Set());
  const [handoff, setHandoff] = useState(null);
  const [picker, setPicker] = useState(null); // { target, replace?, slot?, title }
  const [uploads, setUploads] = useState([]);
  const [mascotRefs, setMascotRefs] = useState([]);
  const busyRef = useRef(false);
  const imagesRef = useRef(images);
  const fileRef = useRef(null);
  const uploadTargetRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  // --- Veri ---------------------------------------------------------------------
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
  const sourceById = useMemo(() => new Map(sourceEntries.map((item) => [item.id, item])), [sourceEntries]);

  const layout = useMemo(
    () => imageSections(blocks, { sources: sourceEntries.map((item) => ({ id: item.id, section: item.section, role: item.role })), sectionMap }),
    [blocks, sourceEntries, sectionMap]
  );

  // Hedef seçenekleri: gerçek bölüm adlarıyla (teknik etiket yok).
  const targetOptions = useMemo(() => {
    const options = [{ value: "cover", label: "Kapak görseli" }];
    if (layout.intro) options.push({ value: "intro", label: "Giriş (ilk bölümden önce)" });
    for (const section of layout.sections) {
      options.push({ value: section.target, label: `Bölüm ${section.number}: ${section.title.slice(0, 70)}` });
      for (const slot of section.emptySlots) options.push({ value: slot.target, label: `Bölüm ${section.number}: boş görsel alanı` });
      for (const sub of section.subheadings) options.push({ value: sub.target, label: `— ${sub.title.slice(0, 66)}` });
    }
    options.push({ value: "end", label: "Yazının sonu" });
    return options;
  }, [layout]);
  const validTarget = (target) => targetOptions.some((item) => item.value === target) || /^block:/.test(String(target ?? "")) && blocks.some((block) => `block:${block.id}` === target);
  const targetName = (target) => targetOptions.find((item) => item.value === target)?.label ?? "Seçilen bölüm";
  // Bölümde şablondan kalan boş görsel alanı varsa önce o doldurulur.
  const sectionTarget = (section) => section.emptySlots?.[0]?.target ?? section.target;
  const sectionOfTarget = (target) => layout.sections.find((section) => section.target === target || section.emptySlots.some((slot) => slot.target === target) || section.subheadings.some((sub) => sub.target === target));

  const own = images.filter((item) => item.kind !== "source");
  const candidates = own.filter((item) => item.state === "candidate");
  const library = own.filter((item) => ["archived", "idle", "failed"].includes(item.state));
  const selected = [...sourceEntries, ...library].filter((item) => item.selected);
  const needsLicense = selected.some((item) => item.kind === "source" && !item.mediaId);

  // Kaynak görselleri listede sanal durur; ilk etkileşimde kalıcı listeye girer.
  const change = (entry, value) =>
    setImages((list) => (list.some((item) => item.id === entry.id) ? list.map((item) => (item.id === entry.id ? { ...item, ...value } : item)) : [...list, { ...entry, ...value }]));
  const patch = (id, value) => setImages((list) => list.map((item) => (item.id === id ? { ...item, ...value } : item)));
  const toggle = (entry, defaultTarget = null) => {
    if (entry.selected) return change(entry, { selected: false });
    const target = validTarget(entry.target) ? entry.target : defaultTarget;
    const section = sectionOfTarget(target);
    change(entry, {
      selected: true,
      target,
      alt: entry.alt || [topic, section?.title ?? entry.section].filter(Boolean).join(" — ").slice(0, 300),
      error: "",
    });
  };
  const clearSelection = () => setImages((list) => list.map((item) => (item.selected ? { ...item, selected: false } : item)));

  // Bölüm kartına odak (editördeki başlıktan "Görsel ekle" ile gelindiyse).
  useEffect(() => {
    if (!focusSection) return;
    const card = listRef.current?.querySelector(`[data-section="${CSS.escape(focusSection)}"]`);
    card?.scrollIntoView({ block: "start" });
  }, [focusSection]);

  // --- Kalıcı medya ---------------------------------------------------------------
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

  const run = async (kind, task) => {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(kind);
    setNotice(null);
    try {
      return await task();
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  // Seçilenlerle işlem: blogda kullan, kapak yap, arşive kaydet.
  const act = (action, list = selected) => {
    if (busyRef.current || !list.length) return;
    if (action === "cover" && list.length !== 1) return;
    if (action !== "archive" && list.some((item) => !String(item.alt ?? "").trim())) {
      setNotice({ tone: "error", text: "Alt metni boş görsel var. Görme engelli okurlar ve arama motorları için her görseli kısaca tarif et." });
      return;
    }
    if (action === "place" && list.some((item) => !validTarget(item.target) || item.target === "cover")) {
      setNotice({ tone: "error", text: "Bölümü seçilmemiş görsel var. “Hangi bölüme?” alanından her görselin bölümünü seç." });
      return;
    }
    if (list.some((item) => item.kind === "source" && !item.mediaId) && !license) {
      setLicenseError(true);
      setNotice({ tone: "error", text: "Kaynak sitedeki görselleri kullanmadan önce kullanım hakkın olduğunu onayla." });
      return;
    }
    return run(action, async () => {
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
          change(item, value);
          ready.push({ ...item, ...value });
        } catch (failure) {
          const error = offline(failure);
          change(item, { state: "failed", error });
          failed.push({ item, error });
        }
      }

      const parts = [];
      let success = 0;
      let problems = failed.length;
      if (action === "archive") {
        success = ready.length;
        for (const item of ready) change(item, { selected: false, state: ["idle", "candidate", "failed"].includes(item.state) ? "archived" : item.state });
        if (success) parts.push(`${plural(success, "görsel")} arşive (medya kütüphanesine) kaydedildi; yazıya eklenmedi.`);
      } else if (ready.length) {
        const outcome = onPlace(
          ready.map((item) => ({ url: item.url, mediaId: item.mediaId, alt: item.alt.trim(), width: item.width ?? null, height: item.height ?? null, target: action === "cover" ? "cover" : item.target }))
        );
        const unplaced = new Set((outcome?.unplaced ?? []).map((item) => item.mediaId));
        const coverId = outcome?.cover?.media?.id ?? null;
        if (coverId) setImages((items) => items.map((item) => (item.state === "cover" && item.mediaId !== coverId ? { ...item, state: "archived" } : item)));
        for (const item of ready) {
          if (item.mediaId === coverId) change(item, { state: "cover", selected: false, target: "cover", error: "" });
          else if (unplaced.has(item.mediaId)) change(item, { error: "Seçilen bölüm yazıda bulunamadı; başka bir bölüm seç." });
          else change(item, { state: "placed", selected: false, error: "" });
        }
        success = (outcome?.placed ?? 0) + (coverId ? 1 : 0);
        if (outcome?.placed) parts.push(`${plural(outcome.placed, "görsel")} yazıya eklendi.`);
        if (coverId) parts.push("Kapak görseli ayarlandı.");
        if (unplaced.size) parts.push(`${plural(unplaced.size, "görselin")} bölümü bulunamadı.`);
        problems += unplaced.size;
      }
      if (failed.length) parts.push(`${plural(failed.length, "görsel")} işlenemedi: ${failed[0].error}`);
      setNotice(
        success
          ? { tone: problems ? "warn" : "ok", text: parts.join(" ") }
          : { tone: "error", text: `Hiçbir görsel ${action === "archive" ? "kaydedilemedi" : "eklenemedi"}. ${parts.join(" ")}`.trim() }
      );
    });
  };

  // Tek bir medyayı hedefe koyar (yükleme, kütüphaneden seçim, ChatGPT sonucu).
  const placeMedia = (media, { target, alt, replace = false, slot = null, kind = "upload" }) => {
    const item = { url: media.url, mediaId: media.id, alt, width: media.width ?? null, height: media.height ?? null, target, ...(replace ? { replace: true, slot } : {}) };
    const outcome = onPlace([item]);
    const isCover = target === "cover" && outcome?.cover;
    const ok = isCover || (outcome?.placed ?? 0) > 0;
    const entry = {
      id: `${kind === "handoff" ? "h" : "u"}-${media.id.slice(0, 13)}`,
      kind,
      state: ok ? (isCover ? "cover" : "placed") : "archived",
      selected: false,
      mediaId: media.id,
      url: media.url,
      width: media.width ?? null,
      height: media.height ?? null,
      alt,
      target,
      ...(kind === "handoff" ? { provider: "chatgpt", mode: "handoff" } : {}),
    };
    setImages((list) => [...list.filter((other) => other.id !== entry.id).map((other) => (isCover && other.state === "cover" ? { ...other, state: "archived" } : other)), entry]);
    return ok;
  };

  const uploadOne = async (original, meta, draftId) => {
    // Büyük PNG (ör. ChatGPT) tarayıcıda küçültülür; sunucu WebP'ye çevirip kaydeder.
    const file = ACCEPTED_TYPES.includes(original.type) && original.size > MAX_UPLOAD_BYTES ? await resizeForAnalysis(original, { maxEdge: 2048, quality: 0.9 }) : original;
    const id = crypto.randomUUID();
    setUploads((items) => [...items, { id, name: original.name, progress: 0 }]);
    try {
      return await uploadMedia(file, (progress) => setUploads((items) => items.map((item) => (item.id === id ? { ...item, progress } : item))), {
        alt: meta.alt,
        origin: meta.kind === "handoff" ? "handoff" : "upload",
        provider: meta.kind === "handoff" ? "chatgpt" : undefined,
        model: meta.kind === "handoff" ? "kullanıcı hesabı" : undefined,
        draftPostId: draftId,
      });
    } finally {
      setUploads((items) => items.filter((item) => item.id !== id));
    }
  };

  // "Görsel yükle": dosya(lar) kütüphaneye kaydedilir ve doğrudan seçilen bölüme konur.
  const uploadTo = (files, target) =>
    run("upload", async () => {
      const list = [...files].filter(Boolean).slice(0, target === "cover" ? 1 : 8);
      if (!list.length) return;
      const draftId = await ensureDraft().catch(() => null);
      const section = sectionOfTarget(target);
      const alt = [topic, target === "cover" ? "" : section?.title].filter(Boolean).join(" — ").slice(0, 300) || "Yazı görseli";
      let placed = 0;
      const errors = [];
      for (const original of list) {
        try {
          const media = await uploadOne(original, { alt, kind: "upload" }, draftId);
          if (placeMedia(media, { target, alt })) placed += 1;
          else errors.push(`${original.name}: bölüm bulunamadı, görsel arşivde`);
        } catch (failure) {
          errors.push(`${original.name}: ${offline(failure)}`);
        }
      }
      const where = target === "cover" ? "kapak olarak ayarlandı" : `${targetName(target)} bölümüne eklendi`;
      setNotice(
        placed
          ? { tone: errors.length ? "warn" : "ok", text: `${plural(placed, "görsel")} yüklendi ve ${where}. Alt metni blok ayarlarından düzenleyebilirsin.${errors.length ? ` Sorun: ${errors.join("; ")}` : ""}` }
          : { tone: "error", text: `Görsel eklenemedi. ${errors.join("; ")}` }
      );
    });

  const pickUpload = (target) => {
    uploadTargetRef.current = target;
    fileRef.current?.click();
  };

  // --- ChatGPT ile elle üretim ----------------------------------------------------
  const startHandoff = ({ target, title, references = [], replace = false, slot = null, alt = "", prompt = null }) => {
    const section = sectionOfTarget(target);
    const purpose = target === "cover" ? "cover" : "inline";
    setHandoff({
      key: crypto.randomUUID(),
      target,
      replace,
      slot,
      title,
      references,
      defaultAlt: alt || [topic, section?.title].filter(Boolean).join(" — ").slice(0, 300),
      prompt: prompt ?? buildHandoffPrompt({ topic, section: section?.title ?? "", purpose, alt: alt || section?.title || topic, hasReference: references.length > 0 }),
      acceptLabel: replace ? "Kabul et ve görseli değiştir" : target === "cover" ? "Kabul et ve kapak yap" : "Kabul et ve bu bölüme ekle",
    });
  };
  // Kapak: bu yazıya özgü sahne + kullanıcının kendi maskotu (referans olarak).
  const startCover = () =>
    startHandoff({
      target: "cover",
      title: "Kapak görseli · ChatGPT ile elle üretim",
      references: mascotRefs.map((item) => ({ url: item.url, label: item.label })),
      alt: [coverContext.title || topic, "kapak görseli"].filter(Boolean).join(" — "),
      prompt: buildCoverPrompt({
        title: coverContext.title || topic,
        idea: coverContext.excerpt,
        topic,
        highlight: layout.sections[0]?.title ?? "",
        audience: coverContext.audience,
        mascotCount: mascotRefs.length,
      }),
    });

  const acceptHandoff = async (file, alt) => {
    const current = handoff;
    if (!current || busyRef.current) return { ok: false, error: "Başka bir işlem sürüyor." };
    let result = { ok: false };
    await run("handoff", async () => {
      try {
        const draftId = await ensureDraft().catch(() => null);
        const media = await uploadOne(file, { alt, kind: "handoff" }, draftId);
        const ok = placeMedia(media, { target: current.target, alt, replace: current.replace, slot: current.slot, kind: "handoff" });
        result = ok ? { ok: true } : { ok: false, error: "Görsel kütüphaneye kaydedildi ama seçilen bölüm yazıda bulunamadı." };
        if (ok) {
          setHandoff(null);
          setNotice({ tone: "ok", text: current.target === "cover" ? "ChatGPT görseli kapak olarak ayarlandı." : current.replace ? "Görsel değiştirildi (eski görsel medya kütüphanesinde duruyor)." : `ChatGPT görseli ${targetName(current.target)} bölümüne eklendi.` });
        }
      } catch (failure) {
        result = { ok: false, error: offline(failure) };
      }
    });
    return result;
  };

  // Kütüphaneden seçim (ya da "Görseli değiştir").
  const onPicked = (media) => {
    const current = picker;
    setPicker(null);
    if (!current) return;
    const section = sectionOfTarget(current.target);
    const alt = String(media.alt_text || "").trim() || [topic, section?.title].filter(Boolean).join(" — ").slice(0, 300) || "Yazı görseli";
    const ok = placeMedia(media, { target: current.target, alt, replace: current.replace, slot: current.slot });
    setNotice(ok ? { tone: "ok", text: current.replace ? "Görsel değiştirildi." : current.target === "cover" ? "Kapak görseli ayarlandı." : `Görsel ${targetName(current.target)} bölümüne eklendi.` } : { tone: "error", text: "Seçilen bölüm yazıda bulunamadı." });
    // Her yazının kapağı kendine özgü olmalı: aynı görsel başka yazının kapağıysa uyar (engellemez).
    if (ok && current.target === "cover" && media.id) {
      fetch(`/api/admin/media?coverUse=${media.id}`, { cache: "no-store" })
        .then(readJson)
        .then((data) => {
          const others = (data.posts ?? []).filter((post) => post.id !== postId);
          if (others.length) setNotice({ tone: "warn", text: `Kapak ayarlandı, ancak bu görsel “${others[0].title || "başlıksız"}” yazısının da kapağı. Her yazıya özgü bir kapak önerilir.` });
        })
        .catch(() => {});
    }
  };

  const accept = (item) => patch(item.id, { state: "archived", selected: false });
  const reject = async (item) => {
    if (busyRef.current) return;
    const result = item.mediaId ? await deleteMedia(item.mediaId).catch(() => ({ ok: false, error: "Sunucuya ulaşılamadı." })) : { ok: true };
    if (!result?.ok) return setNotice({ tone: "error", text: `Görsel kaldırılamadı: ${result?.error ?? "bilinmeyen hata"}` });
    setImages((list) => list.filter((entry) => entry.id !== item.id));
    setNotice({ tone: "ok", text: "Görsel reddedildi ve medya kütüphanesinden silindi." });
  };

  const markBroken = (id) => () => setBroken((set) => new Set(set).add(id));
  const disabled = Boolean(busy);
  const busyText = { place: "Yazıya ekleniyor…", cover: "Kapak ayarlanıyor…", archive: "Kaydediliyor…", upload: "Yükleniyor…", handoff: "Kaydediliyor…" }[busy];
  const ownByUrl = useMemo(() => new Map(images.filter((item) => item.kind !== "source" && item.url).map((item) => [item.url, item])), [images]);
  const coverSource = layout.cover ? sourceById.get(layout.cover.id) : null;

  // Bölümde gerçekten duran görseller.
  const placedThumbs = (section) =>
    section.placed.map((image, index) => {
      const known = ownByUrl.get(image.url);
      return (
        <Thumb key={`${image.blockId}-${index}`} variant="row" src={image.url} alt={image.alt} chip="Yazıda" note={image.alt ? `Alt metin: ${image.alt}` : "Alt metin yok"} broken={broken.has(image.url)} onBroken={markBroken(image.url)}>
          <span className={styles.thumbActions}>
            <button
              type="button"
              className={`${studio.secondary} ${styles.small}`}
              disabled={disabled}
              onClick={() => setPicker({ target: `block:${image.blockId}`, replace: true, slot: image.slot, title: "Görseli değiştir" })}
            >
              <Replace size={14} aria-hidden="true" /> Görseli değiştir
            </button>
            <button
              type="button"
              className={`${studio.secondary} ${styles.small}`}
              disabled={disabled}
              onClick={() => startHandoff({ target: `block:${image.blockId}`, replace: true, slot: image.slot, alt: image.alt, title: `Bu görselden yeni seçenek · ${section.title}`, references: [{ url: image.url, label: image.alt || "Bu bölümdeki görsel" }] })}
            >
              <Wand2 size={14} aria-hidden="true" /> Yeni seçenek üret
            </button>
            {known?.mediaId ? (
              <button type="button" className={`${studio.secondary} ${styles.small}`} disabled={disabled} onClick={() => act("cover", [{ ...known, alt: known.alt || image.alt }])}>
                <Star size={14} aria-hidden="true" /> Kapak yap
              </button>
            ) : null}
          </span>
        </Thumb>
      );
    });

  const sourceThumb = (entry, match, defaultTarget) => (
    <Thumb
      key={entry.id}
      src={entry.url || entry.src}
      alt={entry.alt}
      label={entry.alt || "Kaynak görseli"}
      selectable
      selected={entry.selected}
      onToggle={() => toggle(entry, defaultTarget)}
      chip={STATE_LABELS[entry.state] ?? (match ? REASON_LABELS[match.reason] : null)}
      chipTone={STATE_LABELS[entry.state] ? undefined : "soft"}
      note={[entry.section ? `Kaynakta: “${entry.section}”` : "Kaynakta bölüm bilgisi yok", hostOf(entry.src)].filter(Boolean).join(" · ")}
      broken={broken.has(entry.id)}
      onBroken={markBroken(entry.id)}
    >
      {entry.selected ? <SelectedFields entry={entry} options={targetOptions} onChange={change} /> : null}
      {entry.error ? <span className={studio.warnText}><CircleAlert size={13} aria-hidden="true" /> {entry.error}</span> : null}
    </Thumb>
  );

  const sectionActions = (target, title) => (
    <div className={styles.actions}>
      <button type="button" className={studio.secondary} disabled={disabled} onClick={() => pickUpload(target)}>
        <Upload size={15} aria-hidden="true" /> Görsel yükle
      </button>
      <button type="button" className={studio.secondary} disabled={disabled} onClick={() => setPicker({ target, title: `Görsel seç · ${title}` })}>
        <Images size={15} aria-hidden="true" /> Mevcutlardan seç
      </button>
      <button type="button" className={studio.secondary} disabled={disabled} onClick={() => startHandoff({ target, title: `Yeni görsel · ${title}` })}>
        <Sparkles size={15} aria-hidden="true" /> Yeni görsel oluştur (ChatGPT)
      </button>
    </div>
  );

  return (
    <div className={styles.layout} ref={listRef}>
      <p className={styles.lead}>
        Görseller makalenin bölüm sırasıyla gösterilir. Her bölümde yalnızca orada kullanılan görseller ve kaynakta o bölüme ait olduğu doğrulanan görseller durur.
      </p>
      <ul className={styles.summary} aria-label="Özet">
        <li>{plural(layout.counts.sections, "bölüm")}</li>
        <li>{plural(layout.counts.placed, "görsel yazıda")}</li>
        <li>{layout.counts.empty ? `${layout.counts.empty} bölümde görsel yok` : "Her bölümde görsel var"}</li>
        {sourceEntries.length ? <li>{plural(sourceEntries.length, "kaynak görseli")}</li> : null}
      </ul>

      {notice ? (
        <p className={notice.tone === "error" ? studio.errorBox : notice.tone === "warn" ? studio.notice : studio.okBox} role="status">
          {notice.text}
        </p>
      ) : null}

      {handoff ? (
        <HandoffPanel
          key={handoff.key}
          title={handoff.title}
          prompt={handoff.prompt}
          references={handoff.references}
          defaultAlt={handoff.defaultAlt}
          acceptLabel={handoff.acceptLabel}
          busy={busy === "handoff"}
          note={handoff.target === "cover" ? "Kapak için yatay (16:9) ve yazısız bir görsel iste; başlık sayfada ayrıca gösterilir." : ""}
          onAccept={acceptHandoff}
          onCancel={() => setHandoff(null)}
        />
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        multiple
        className={studio.srOnly}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const target = uploadTargetRef.current;
          if (target) uploadTo(event.target.files, target);
          event.target.value = "";
        }}
      />
      {uploads.length ? (
        <ul className={studio.uploads}>
          {uploads.map((item) => (
            <li key={item.id}>
              <span>{item.name}</span>
              <progress max={100} value={item.progress} aria-label={`${item.name} yükleniyor`} />
            </li>
          ))}
        </ul>
      ) : null}

      <ol className={styles.sections}>
        {/* Kapak */}
        <li className={styles.card} data-section="cover" data-empty={!cover?.url || undefined} aria-labelledby="sec-cover">
          <div className={styles.cardHead}>
            <p className={styles.eyebrow}>Kapak</p>
            <h3 id="sec-cover" className={styles.cardTitle}>Kapak görseli</h3>
          </div>
          {cover?.url ? (
            <ul className={styles.thumbs}>
              <Thumb variant="row" src={cover.url} alt={cover.alt} chip="Kapak" note={cover.alt ? `Alt metin: ${cover.alt}` : "Kapak alt metni yok"} broken={broken.has(cover.url)} onBroken={markBroken(cover.url)} />
            </ul>
          ) : (
            <p className={styles.empty}>Henüz kapak görseli yok.</p>
          )}
          {coverSource ? (
            <>
              <p className={styles.groupLabel}>Kaynağın kendi kapak görseli</p>
              <ul className={styles.thumbs}>{sourceThumb(coverSource, null, "cover")}</ul>
            </>
          ) : null}
          <details className={styles.more}>
            <summary>Maskot referansların ({mascotRefs.length} kullanılıyor)</summary>
            <MascotRefs onChange={setMascotRefs} />
          </details>
          <div className={styles.actions}>
            <button type="button" className={studio.primary} disabled={disabled} onClick={startCover}>
              <Sparkles size={15} aria-hidden="true" /> {cover?.url ? "Yeni kapak oluştur (ChatGPT)" : "Kapak oluştur (ChatGPT)"}
            </button>
            <button type="button" className={studio.secondary} disabled={disabled} onClick={() => pickUpload("cover")}>
              <Upload size={15} aria-hidden="true" /> Görsel yükle
            </button>
            <button type="button" className={studio.secondary} disabled={disabled} onClick={() => setPicker({ target: "cover", title: "Kapak görseli seç" })}>
              <Images size={15} aria-hidden="true" /> Mevcutlardan seç
            </button>
          </div>
        </li>

        {layout.intro ? (
          <li className={styles.card} data-section="intro" data-empty={!layout.intro.placed.length || undefined} aria-labelledby="sec-intro">
            <div className={styles.cardHead}>
              <p className={styles.eyebrow}>Giriş</p>
              <h3 id="sec-intro" className={styles.cardTitle}>İlk bölümden önceki giriş</h3>
            </div>
            {layout.intro.placed.length ? (
              <>
                <p className={styles.groupLabel}>Bu bölümde kullanılan görsel{layout.intro.placed.length > 1 ? "ler" : ""}</p>
                <ul className={styles.thumbs}>{placedThumbs(layout.intro)}</ul>
              </>
            ) : (
              <p className={styles.empty}>Girişte görsel yok (isteğe bağlı).</p>
            )}
            {sectionActions("intro", "Giriş")}
          </li>
        ) : null}

        {layout.sections.map((section) => {
          // Yazıya eklenmiş kaynak görseli "kullanılan görsel" olarak zaten görünür; iki kez listelenmez.
          const used = new Set(section.placed.map((image) => image.url));
          const matches = section.matches
            .map((match) => ({ match, entry: sourceById.get(match.id) }))
            .filter((item) => item.entry && !(item.entry.state === "placed" || (item.entry.url && used.has(item.entry.url))));
          const target = sectionTarget(section);
          const empty = !section.placed.length;
          return (
            <li key={section.key} className={styles.card} data-section={section.key} data-focus={focusSection === section.key || undefined} data-empty={empty || undefined} aria-labelledby={`sec-${section.key}`}>
              <div className={styles.cardHead}>
                <p className={styles.eyebrow}>Bölüm {section.number}</p>
                <h3 id={`sec-${section.key}`} className={styles.cardTitle}>{section.title}</h3>
                {section.subheadings.length ? <p className={styles.subheads}>Alt başlıklar: {section.subheadings.map((sub) => sub.title).join(" · ")}</p> : null}
              </div>
              {empty ? (
                <p className={styles.empty}>Bu bölümde henüz görsel yok.{section.emptySlots.length ? " Şablondaki görsel alanı boş bekliyor." : ""}</p>
              ) : (
                <>
                  <p className={styles.groupLabel}>Bu bölümde kullanılan görsel{section.placed.length > 1 ? "ler" : ""}</p>
                  <ul className={styles.thumbs}>{placedThumbs(section)}</ul>
                </>
              )}
              {matches.length ? (
                <>
                  <p className={styles.groupLabel}>Kaynakta bu bölüme ait görseller ({matches.length})</p>
                  <ul className={styles.thumbs}>{matches.map(({ entry, match }) => sourceThumb(entry, match, target))}</ul>
                </>
              ) : null}
              {sectionActions(target, `Bölüm ${section.number}`)}
            </li>
          );
        })}
      </ol>

      {!layout.sections.length ? (
        <p className={studio.notice}>Yazıda henüz H2 başlığı yok. Bölümler oluşunca görseller bölüm bölüm burada görünür; şimdilik kapağı ve girişi kullanabilirsin.</p>
      ) : null}

      {layout.unmatched.length ? (
        <details className={styles.more} open={layout.unmatched.length <= 6 || undefined}>
          <summary>Bölümü doğrulanamayan kaynak görselleri ({layout.unmatched.length})</summary>
          <p className={studio.hint}>
            Bu görsellerin kaynakta hangi bölüme ait olduğu doğrulanamadı; yanlış yere eklenmesin diye bir bölüme yerleştirilmedi. Kullanmak istersen seç ve “Hangi bölüme?” alanından bölümünü belirle.
          </p>
          <ul className={styles.thumbs}>{layout.unmatched.map((item) => sourceById.get(item.id)).filter(Boolean).map((entry) => sourceThumb(entry, null, null))}</ul>
        </details>
      ) : null}

      {shotCount ? (
        <p className={studio.notice}>
          Ekran görüntülerinde {shotCount} görsel görüldü. Orijinal dosyaları elimizde olmadığı için kullanmak istersen kendi kopyanı yükle ya da ChatGPT ile benzerini üret.
        </p>
      ) : null}

      {candidates.length ? (
        <details className={styles.more} open>
          <summary>Onayını bekleyen görseller ({candidates.length})</summary>
          <ul className={styles.thumbs}>
            {candidates.map((item) => (
              <Thumb key={item.id} src={item.url} alt={item.alt} chip="Onay bekliyor" note={item.alt} broken={broken.has(item.id)} onBroken={markBroken(item.id)}>
                <span className={styles.thumbActions}>
                  <button type="button" className={`${studio.secondary} ${styles.small}`} disabled={disabled} onClick={() => accept(item)}><Check size={14} aria-hidden="true" /> Kabul et</button>
                  <button type="button" className={`${studio.secondary} ${styles.small}`} disabled={disabled} onClick={() => reject(item)}><Trash2 size={14} aria-hidden="true" /> Reddet</button>
                </span>
              </Thumb>
            ))}
          </ul>
        </details>
      ) : null}

      {library.length ? (
        <details className={styles.more}>
          <summary>Yüklediklerin ve arşivdekiler ({library.length})</summary>
          <p className={studio.hint}>Medya kütüphanesine kaydedilmiş ama bu yazıda kullanılmayan görseller.</p>
          <ul className={styles.thumbs}>
            {library.map((item) => (
              <Thumb key={item.id} src={item.url} alt={item.alt} label={item.alt} selectable selected={item.selected} onToggle={() => toggle(item, null)} chip={STATE_LABELS[item.state]} note={item.kind === "handoff" ? "ChatGPT ile elle üretildi" : "Yüklendi"} broken={broken.has(item.id)} onBroken={markBroken(item.id)}>
                {item.selected ? <SelectedFields entry={item} options={targetOptions} onChange={change} /> : null}
              </Thumb>
            ))}
          </ul>
        </details>
      ) : null}

      {selected.length ? (
        <div className={styles.bar} role="region" aria-label="Seçilen görsellerle işlem">
          <div className={styles.barHead}>
            <strong>{plural(selected.length, "görsel")} seçili</strong>
            {busy ? <span className={studio.hint}><LoaderCircle size={14} className={studio.spin} aria-hidden="true" /> {busyText}</span> : null}
            <button type="button" className={studio.linkButton} disabled={disabled} onClick={clearSelection}>Seçimi temizle</button>
          </div>
          {needsLicense ? (
            <label className={studio.check} data-error={licenseError || undefined}>
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
          <div className={styles.barActions}>
            <button type="button" className={studio.primary} disabled={disabled} onClick={() => act("place")}>
              <ImagePlus size={16} aria-hidden="true" /> Blogda kullan ({selected.length})
            </button>
            <button type="button" className={studio.secondary} disabled={disabled || selected.every((item) => item.mediaId)} onClick={() => act("archive")}>
              Arşive kaydet ({selected.length})
            </button>
            <button
              type="button"
              className={studio.secondary}
              disabled={disabled}
              onClick={() => {
                const target = selected.every((item) => item.target && item.target === selected[0].target) && selected[0].target !== "cover" ? selected[0].target : layout.sections[0] ? sectionTarget(layout.sections[0]) : "end";
                startHandoff({ target, title: `Referanslarla yeni görsel · ${targetName(target)}`, references: selected.map((item) => ({ url: item.url || item.src, label: item.alt || item.section || "Referans" })) });
              }}
            >
              <Wand2 size={15} aria-hidden="true" /> Referans olarak kullan ({selected.length})
            </button>
          </div>
          {selected.length === 1 ? (
            <button type="button" className={studio.linkButton} disabled={disabled} onClick={() => act("cover")}>
              <Star size={14} aria-hidden="true" /> Seçilen görseli kapak yap
            </button>
          ) : null}
          <p className={styles.barHint}>
            “Blogda kullan” seçilen bölüme gerçek görsel bloğu ekler. “Arşive kaydet” yalnızca medya kütüphanesine kaydeder. “Referans olarak kullan” bloga bir şey eklemez; ChatGPT’de yeni görsel için örnek olur.
          </p>
        </div>
      ) : null}

      {picker ? <MediaPickerDialog open title={picker.title} onSelect={onPicked} onClose={() => setPicker(null)} /> : null}
    </div>
  );
}

function SelectedFields({ entry, options, onChange }) {
  const valid = options.some((item) => item.value === entry.target);
  return (
    <div className={styles.assign}>
      <label className={styles.assign}>
        <span>Hangi bölüme?</span>
        <select className={studio.input} value={valid ? entry.target : ""} onChange={(event) => onChange(entry, { target: event.target.value })}>
          <option value="" disabled>Bölüm seç…</option>
          {options.filter((item) => item.value !== "cover").map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </label>
      <label className={styles.assign}>
        <span>Alt metin</span>
        <input className={studio.input} value={entry.alt ?? ""} maxLength={300} placeholder="Görseli kısaca tarif et" aria-invalid={!String(entry.alt ?? "").trim() || undefined} onChange={(event) => onChange(entry, { alt: event.target.value })} />
      </label>
    </div>
  );
}
