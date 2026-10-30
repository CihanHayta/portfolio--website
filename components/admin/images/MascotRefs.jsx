"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Trash2, Upload } from "lucide-react";
import { deleteMedia } from "@/app/admin/blog/actions";
import { ACCEPTED_TYPES, uploadMedia } from "../upload";
import studio from "../studio/studio.module.css";
import styles from "./images.module.css";

// Kullanıcının KENDİ tilki maskotu referansları. Varsayılan: sitedeki marka işareti
// (public/brand/persona-mark.png). Ek referanslar (ör. tam boy maskot pozları)
// medya arşivinde "maskot/" klasöründe kalıcı saklanır ve yedeğe girer.
// Başka bir sitenin tilkisi maskot olarak kullanılmaz; yalnızca buraya yüklenenler.
export const DEFAULT_MASCOT = "/brand/persona-mark.png";

export default function MascotRefs({ onChange }) {
  const [items, setItems] = useState(null); // null = yükleniyor
  const [off, setOff] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    let active = true;
    fetch("/api/admin/media?folder=maskot", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { media: [] }))
      .then((data) => active && setItems(data.media ?? []))
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, []);

  // İstemde kullanılacak referanslar (mutlak adres: ChatGPT'ye kopyalanır/açılır).
  useEffect(() => {
    if (items === null) return;
    const origin = window.location.origin;
    const all = [{ id: "default", url: `${origin}${DEFAULT_MASCOT}`, label: "Persona tilki işareti (sitedeki logo)" }, ...items.map((item) => ({ id: item.id, url: item.url, label: item.alt_text || "Maskot referansı" }))];
    onChangeRef.current(all.filter((item) => !off.has(item.id)));
  }, [items, off]);

  const upload = async (files) => {
    const list = [...files].filter((file) => ACCEPTED_TYPES.includes(file.type)).slice(0, 4);
    if (!list.length) return setError("Yalnızca JPG, PNG ya da WebP yüklenebilir.");
    setBusy(true);
    setError("");
    try {
      for (const file of list) {
        const media = await uploadMedia(file, null, { alt: "Persona tilki maskotu", folder: "maskot", origin: "upload" });
        setItems((current) => [{ ...media, alt_text: media.alt_text || "Persona tilki maskotu" }, ...(current ?? [])]);
      }
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item) => {
    setBusy(true);
    const result = await deleteMedia(item.id).catch(() => ({ ok: false, error: "Sunucuya ulaşılamadı." }));
    setBusy(false);
    if (!result?.ok) return setError(result?.error ?? "Silinemedi.");
    setItems((current) => current.filter((other) => other.id !== item.id));
  };

  const toggle = (id) =>
    setOff((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rows = items === null ? null : [{ id: "default", url: DEFAULT_MASCOT, alt_text: "Persona tilki işareti (sitedeki logo)", fixed: true }, ...items];
  return (
    <div className={styles.mascot} data-testid="mascot-refs">
      <p className={studio.hint}>
        Kapakta yalnızca <strong>senin</strong> tilkin kullanılır. Varsayılan referans sitedeki tilki işaretin; farklı pozlar (tam boy, el sallayan…) eklersen ChatGPT maskotu daha tutarlı çizer.
      </p>
      {rows === null ? (
        <p className={studio.hint}><LoaderCircle size={14} className={studio.spin} aria-hidden="true" /> Maskot referansları yükleniyor…</p>
      ) : (
        <ul className={styles.mascotList}>
          {rows.map((item) => (
            <li key={item.id}>
              <label className={styles.mascotItem}>
                <input type="checkbox" checked={!off.has(item.id)} onChange={() => toggle(item.id)} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt="" loading="lazy" />
                <span>{item.alt_text}</span>
              </label>
              {!item.fixed ? (
                <button type="button" className={studio.iconButton} aria-label="Maskot referansını sil" disabled={busy} onClick={() => remove(item)}>
                  <Trash2 size={15} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className={styles.row}>
        <button type="button" className={studio.secondary} disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? <LoaderCircle size={15} className={studio.spin} aria-hidden="true" /> : <Upload size={15} aria-hidden="true" />} Maskot görseli ekle
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          className={studio.srOnly}
          tabIndex={-1}
          aria-label="Maskot görseli seç"
          onChange={(event) => {
            upload(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      {error ? <span className={studio.warnText} role="alert">{error}</span> : null}
    </div>
  );
}
