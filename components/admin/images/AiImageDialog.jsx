"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Sparkles, X } from "lucide-react";
import { buildCoverPrompt, buildHandoffPrompt } from "@/lib/ai/brandVisual";
import { blockImages } from "@/lib/blog/blocks/imageSections";
import HandoffPanel from "./HandoffPanel";
import MascotRefs from "./MascotRefs";
import { uploadMedia, ACCEPTED_TYPES, MAX_UPLOAD_BYTES } from "../upload";
import { resizeForAnalysis } from "../studio/resizeImage";
import { useModalDialog } from "../useModalDialog";
import studio from "../studio/studio.module.css";
import styles from "./images.module.css";

// Blok ayarlarında "Yapay zekâyla oluştur". Ücretsiz otomatik görsel servisi
// olmadığı için üretim ChatGPT'de, kullanıcının kendi hesabıyla ELLE yapılır:
// 1) bu yazıdaki / yüklenen / daha önce üretilen görsellerden referans seçilir,
// 2) kullanıcı ne istediğini Türkçe yazar, 3) istem hazırlanıp ChatGPT açılır,
// 4) sonuç önizlenir ve kabul edilirse kaydedilip bu bloğa konur.
// Kabul edilene kadar bloktaki mevcut görsel değişmez.

const headingBefore = (blocks, blockId) => {
  let heading = "";
  for (const block of blocks) {
    if (block.type === "heading" && block.props?.text) heading = String(block.props.text);
    if (block.id === blockId) return heading;
  }
  return "";
};

function Group({ title, items, picked, onToggle, empty }) {
  return (
    <section className={styles.pickGroup} aria-label={title}>
      <p className={styles.groupLabel}>{title} ({items?.length ?? 0})</p>
      {items === null ? (
        <p className={studio.hint}><LoaderCircle size={14} className={studio.spin} aria-hidden="true" /> Yükleniyor…</p>
      ) : items.length ? (
        <ul className={styles.thumbs}>
          {items.map((item) => (
            <li key={item.url} className={styles.thumb} data-selected={picked.has(item.url) || undefined}>
              <label className={styles.thumbImage}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt="" loading="lazy" />
                <span className={styles.pick}>
                  <input type="checkbox" checked={picked.has(item.url)} onChange={() => onToggle(item)} aria-label={`${item.label} — referans olarak seç`} />
                </span>
              </label>
              <span className={styles.thumbNote}>{item.label}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>{empty}</p>
      )}
    </section>
  );
}

export default function AiImageDialog({ context, purpose = "inline", current = null, onAccept, onClose }) {
  const ref = useRef(null);
  useModalDialog(ref, true, { fitViewport: true });
  const blocks = useMemo(() => context.getBlocks?.() ?? [], [context]);
  const title = context.getTitle?.() ?? "";
  const section = purpose === "cover" ? "" : headingBefore(blocks, context.blockId);
  const [uploads, setUploads] = useState(null);
  const [generated, setGenerated] = useState(null);
  const [picked, setPicked] = useState(() => new Map());
  const [wish, setWish] = useState("");
  const [mascots, setMascots] = useState([]);
  const [handoff, setHandoff] = useState(null);
  const [busy, setBusy] = useState(false);

  // Bu yazıdaki görseller (bloklar + kapak); mevcut görsel en başta.
  const inPost = useMemo(() => {
    const seen = new Set();
    const out = [];
    const add = (url, label) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      out.push({ url, label });
    };
    if (current?.url) add(current.url, "Bu bloktaki görsel");
    const cover = context.getCover?.();
    if (cover?.url) add(cover.url, "Kapak görseli");
    for (const block of blocks) for (const image of blockImages(block)) add(image.url, image.alt || "Yazıdaki görsel");
    return out;
  }, [blocks, context, current]);

  useEffect(() => {
    let active = true;
    const load = (origin, set) =>
      fetch(`/api/admin/media?origin=${origin}`, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : { media: [] }))
        .then((data) => active && set((data.media ?? []).map((item) => ({ url: item.url, label: item.alt_text || "Görsel" }))))
        .catch(() => active && set([]));
    load("upload", setUploads);
    load("ai,handoff", setGenerated);
    return () => {
      active = false;
    };
  }, []);

  const toggle = (item) =>
    setPicked((map) => {
      const next = new Map(map);
      if (next.has(item.url)) next.delete(item.url);
      else next.set(item.url, item);
      return next;
    });

  const prepare = () => {
    const references = [...picked.values(), ...(purpose === "cover" ? mascots : [])];
    const base =
      purpose === "cover"
        ? buildCoverPrompt({ title, idea: wish, topic: title, mascotCount: mascots.length })
        : buildHandoffPrompt({ topic: title, section, purpose: "inline", alt: wish, hasReference: picked.size > 0 });
    setHandoff({
      key: crypto.randomUUID(),
      references,
      prompt: `${base}\nİstek (Türkçe): ${wish.trim()}`,
    });
  };

  const accept = async (file, alt) => {
    setBusy(true);
    try {
      const draftId = await context.ensureDraft?.().catch(() => null);
      const upload = ACCEPTED_TYPES.includes(file.type) && file.size > MAX_UPLOAD_BYTES ? await resizeForAnalysis(file, { maxEdge: 2048, quality: 0.9 }) : file;
      const media = await uploadMedia(upload, null, { alt, origin: "handoff", provider: "chatgpt", model: "kullanıcı hesabı", draftPostId: draftId });
      onAccept({ id: media.id, url: media.url, width: media.width ?? null, height: media.height ?? null, alt });
      onClose();
      return { ok: true };
    } catch (failure) {
      return { ok: false, error: failure instanceof TypeError ? "Sunucuya ulaşılamadı." : failure.message };
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby="ai-image-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className={styles.dialogHead}>
        <h2 id="ai-image-title" className={styles.dialogTitle}>
          <Sparkles size={18} aria-hidden="true" /> {purpose === "cover" ? "Kapak görselini yapay zekâyla oluştur" : "Yapay zekâyla görsel oluştur"}
        </h2>
        <button type="button" className={studio.iconButton} aria-label="Kapat" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className={styles.dialogBody}>
        <p className={styles.manualNote}>
          Ücretsiz otomatik görsel servisi yok. Görsel ChatGPT’de <strong>senin hesabınla</strong> elle üretilir; burada istem hazırlanır, sonuç önizlenir ve sen kabul edersen bu {purpose === "cover" ? "yazının kapağı" : "blok"} olur. Kabul edene kadar mevcut görsel değişmez.
        </p>
        {section ? <p className={studio.hint}>Bölüm: <strong>{section}</strong></p> : null}

        {handoff ? (
          <HandoffPanel
            key={handoff.key}
            title="ChatGPT ile elle üretim"
            prompt={handoff.prompt}
            references={handoff.references}
            defaultAlt={wish.trim().slice(0, 300)}
            acceptLabel={purpose === "cover" ? "Kabul et ve kapak yap" : "Kabul et ve bloğa koy"}
            busy={busy}
            onAccept={accept}
            onCancel={() => setHandoff(null)}
          />
        ) : (
          <>
            <label className={styles.field}>
              <span>Ne istediğini Türkçe anlat</span>
              <textarea
                className={`${studio.input} ${studio.textarea}`}
                rows={3}
                maxLength={600}
                value={wish}
                placeholder={purpose === "cover" ? "Ör. tilki bütçe grafiklerinin önünde, tablet tutuyor" : "Ör. bütçe dağılımını gösteren sade bir şema"}
                onChange={(event) => setWish(event.target.value)}
              />
            </label>
            {purpose === "cover" ? (
              <details className={styles.more}>
                <summary>Maskot referansların ({mascots.length})</summary>
                <MascotRefs onChange={setMascots} />
              </details>
            ) : null}
            <p className={studio.hint}>İstersen referans seç (birden fazla seçebilirsin). Referans yalnızca ChatGPT’ye örnek olur; birebir kopyalanmaz.</p>
            <Group title="Bu yazıdaki görseller" items={inPost} picked={picked} onToggle={toggle} empty="Bu yazıda henüz görsel yok." />
            <Group title="Yüklediklerin" items={uploads} picked={picked} onToggle={toggle} empty="Henüz yüklediğin görsel yok." />
            <Group title="Daha önce yapay zekâyla oluşturulanlar" items={generated} picked={picked} onToggle={toggle} empty="Daha önce oluşturulmuş görsel yok." />
          </>
        )}
      </div>
      {!handoff ? (
        <div className={styles.dialogFoot}>
          <span className={studio.hint}>{picked.size ? `${picked.size} referans seçili` : "Referans seçilmedi"}</span>
          <button type="button" className={studio.primary} disabled={wish.trim().length < 5} onClick={prepare}>
            <Sparkles size={16} aria-hidden="true" /> İstemi hazırla
          </button>
        </div>
      ) : null}
    </dialog>
  );
}
