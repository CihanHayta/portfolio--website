"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ClipboardPaste, Copy, ExternalLink, ImageUp, LoaderCircle, Upload, X } from "lucide-react";
import { CHATGPT_URL } from "@/lib/ai/brandVisual";
import { ACCEPTED_TYPES } from "../upload";
import studio from "../studio/studio.module.css";
import styles from "./images.module.css";

// ChatGPT ile ELLE görsel üretimi. Otomatik bir üretim değildir: istem ve referans
// görseller kullanıcının kendi ChatGPT hesabına taşınır, üretilen görsel geri
// yapıştırılır. Görsel önce yalnızca bu ekranda (geçici önizleme) gösterilir;
// kullanıcı "kabul et" demeden hiçbir şey kaydedilmez ya da yazıya eklenmez.

// Görseli panoya PNG olarak koyar (Safari için ClipboardItem'a söz verilir).
export async function copyImageToClipboard(url) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("unsupported");
  const toPng = async () => {
    const blob = await fetch(url, { mode: "cors" }).then((response) => {
      if (!response.ok) throw new Error("fetch");
      return response.blob();
    });
    if (blob.type === "image/png") return blob;
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    return new Promise((resolve, reject) => canvas.toBlob((png) => (png ? resolve(png) : reject(new Error("png"))), "image/png"));
  };
  await navigator.clipboard.write([new ClipboardItem({ "image/png": toPng() })]);
}

const pickImage = (files) => [...(files ?? [])].find((file) => ACCEPTED_TYPES.includes(file.type)) ?? null;

export default function HandoffPanel({
  title,
  prompt: initialPrompt,
  references = [], // [{ url, label }]
  note = "",
  acceptLabel = "Kabul et ve ekle",
  defaultAlt = "",
  busy = false,
  onAccept, // async (file, alt) => { ok, error }
  onCancel,
}) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [opened, setOpened] = useState(null); // null | "copied" | "manual"
  const [refState, setRefState] = useState({}); // url → copied | failed
  const [file, setFile] = useState(null);
  const [alt, setAlt] = useState(defaultAlt);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.scrollIntoView?.({ block: "nearest" });
  }, []);

  // Önizleme adresi yalnızca ekranda yaşar; hiçbir yere kaydedilmez.
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const choose = (candidate) => {
    if (!candidate) {
      setError("Yalnızca JPG, PNG ya da WebP görsel eklenebilir.");
      return;
    }
    setError("");
    setFile(candidate);
  };

  const open = () => {
    // Referans varsa istem otomatik gönderilmesin diye yalnızca ChatGPT açılır; istem panodadır.
    const url = references.length ? CHATGPT_URL : `${CHATGPT_URL}?q=${encodeURIComponent(prompt)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    const copy = navigator.clipboard?.writeText ? navigator.clipboard.writeText(prompt) : Promise.reject(new Error("unsupported"));
    copy.then(
      () => setOpened("copied"),
      () => setOpened("manual")
    );
  };

  const copyReference = (url) =>
    copyImageToClipboard(url).then(
      () => setRefState((value) => ({ ...value, [url]: "copied" })),
      () => setRefState((value) => ({ ...value, [url]: "failed" }))
    );

  const pasteFromClipboard = async () => {
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((value) => ACCEPTED_TYPES.includes(value));
        if (type) return choose(new File([await item.getType(type)], `chatgpt.${type.split("/")[1]}`, { type }));
      }
      setError("Panoda görsel bulunamadı. ChatGPT’de görseli kopyala ya da indirip “Dosya seç” ile ekle.");
    } catch {
      setError("Panoya erişilemedi. Görseli indirip “Dosya seç” ile ekle.");
    }
  };
  const canReadClipboard = typeof navigator !== "undefined" && Boolean(navigator.clipboard?.read);

  const accept = async () => {
    if (!file) return;
    if (!alt.trim()) {
      setError("Alt metin boş olamaz: görseli göremeyen okurlar için kısaca tarif et.");
      return;
    }
    setError("");
    const result = await onAccept(file, alt.trim());
    if (result && !result.ok) setError(result.error || "Görsel kaydedilemedi. Seçimin korunuyor; yeniden dene.");
  };

  return (
    <section
      className={styles.handoff}
      aria-labelledby="handoff-title"
      data-testid="handoff-panel"
      onPaste={(event) => {
        const candidate = pickImage(event.clipboardData?.files);
        if (candidate) {
          event.preventDefault();
          choose(candidate);
        }
      }}
    >
      <div className={styles.handoffHead}>
        <h3 id="handoff-title" ref={headingRef} tabIndex={-1} className={studio.panelTitle}>{title}</h3>
        <button type="button" className={studio.iconButton} aria-label="Paneli kapat" onClick={onCancel}>
          <X size={18} />
        </button>
      </div>
      <p className={styles.manualNote}>
        Elle üretim: görsel ChatGPT’de <strong>senin hesabınla</strong> üretilir; sistem otomatik görsel üretmez. Sen onaylayana kadar hiçbir şey kaydedilmez.
      </p>
      {note ? <p className={studio.hint}>{note}</p> : null}

      <ol className={styles.steps}>
        <li>
          <strong>İstemi kopyala ve ChatGPT’yi aç</strong>
          <textarea
            className={`${studio.input} ${studio.textarea}`}
            rows={6}
            value={prompt}
            maxLength={4000}
            aria-label="ChatGPT istemi (düzenleyebilirsin)"
            onChange={(event) => setPrompt(event.target.value)}
          />
          <button type="button" className={studio.primary} onClick={open}>
            <ExternalLink size={16} aria-hidden="true" /> İstemi kopyala ve ChatGPT’yi aç
          </button>
          {opened ? (
            <span className={opened === "copied" ? studio.okText : studio.warnText} role="status">
              {opened === "copied" ? "İstem panoya kopyalandı; ChatGPT’de yapıştır." : "İstem kopyalanamadı; yukarıdaki metni seçip kopyala."}
            </span>
          ) : null}
        </li>

        {references.length ? (
          <li>
            <strong>Referans görsel{references.length > 1 ? `leri (${references.length})` : "i"} ChatGPT’ye ekle</strong>
            <span className={studio.hint}>Her görseli kopyalayıp ChatGPT’ye yapıştır ya da aç, kaydet ve ataç simgesiyle ekle.</span>
            <ul className={styles.refList}>
              {references.map((ref) => (
                <li key={ref.url}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ref.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  <span className={styles.refLabel}>{ref.label}</span>
                  <span className={styles.refActions}>
                    <button type="button" className={studio.secondary} onClick={() => copyReference(ref.url)}>
                      {refState[ref.url] === "copied" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                      {refState[ref.url] === "copied" ? "Kopyalandı" : "Görseli kopyala"}
                    </button>
                    <a className={studio.secondary} href={ref.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={15} aria-hidden="true" /> Aç
                    </a>
                  </span>
                  {refState[ref.url] === "failed" ? <span className={studio.warnText}>Bu görsel panoya kopyalanamadı; “Aç” ile kaydedip ekle.</span> : null}
                </li>
              ))}
            </ul>
          </li>
        ) : null}

        <li>
          <strong>Ürettiğin görseli buraya ekle</strong>
          {preview ? (
            <div className={styles.previewBox}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Eklenecek görselin önizlemesi" />
              <label className={styles.field}>
                <span>Alt metin (zorunlu)</span>
                <input className={studio.input} value={alt} maxLength={300} placeholder="Görseli kısaca tarif et" onChange={(event) => setAlt(event.target.value)} />
              </label>
              <div className={styles.row}>
                <button type="button" className={studio.primary} disabled={busy} onClick={accept}>
                  {busy ? <LoaderCircle size={16} className={studio.spin} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />} {acceptLabel}
                </button>
                <button type="button" className={studio.secondary} disabled={busy} onClick={() => setFile(null)}>
                  <X size={15} aria-hidden="true" /> Reddet
                </button>
              </div>
            </div>
          ) : (
            <label
              className={studio.dropzone}
              data-dragging={dragging || undefined}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                choose(pickImage(event.dataTransfer.files));
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                className={studio.srOnly}
                onChange={(event) => {
                  choose(pickImage(event.target.files));
                  event.target.value = "";
                }}
              />
              <span><ImageUp size={16} aria-hidden="true" /> Görseli yapıştır, sürükle ya da dosya seç</span>
              <span className={studio.hint}>ChatGPT’de görseli kopyalayıp bu alana yapıştırabilirsin (⌘V / uzun bas → Yapıştır).</span>
            </label>
          )}
          {!preview ? (
            <div className={styles.row}>
              {canReadClipboard ? (
                <button type="button" className={studio.secondary} onClick={pasteFromClipboard}>
                  <ClipboardPaste size={15} aria-hidden="true" /> Panodan yapıştır
                </button>
              ) : null}
              <button type="button" className={studio.secondary} onClick={() => fileRef.current?.click()}>
                <Upload size={15} aria-hidden="true" /> Dosya seç
              </button>
            </div>
          ) : null}
          {error ? <span className={studio.warnText} role="alert">{error}</span> : null}
        </li>
      </ol>
    </section>
  );
}
