"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, ImagePlus, LoaderCircle, RotateCw, Trash2 } from "lucide-react";
import { deleteMedia, listMedia, updateMediaAlt } from "@/app/admin/blog/actions";
import ConfirmDialog from "./ConfirmDialog";
import { toast } from "./toast";
import { uploadMedia } from "./upload";
import styles from "./MediaLibrary.module.css";

// Medya kütüphanesi. `onSelect` verilirse seçim modunda (editördeki pencere),
// verilmezse yönetim modunda (alt metin düzenleme ve silme) çalışır.
export default function MediaLibrary({ onSelect }) {
  const [media, setMedia] = useState(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  const applyList = useCallback((result) => {
    if (result.ok) setMedia(result.media);
    else setError(result.error);
  }, []);

  useEffect(() => {
    listMedia().then(applyList);
  }, [applyList]);

  const reload = () => {
    setError("");
    listMedia().then(applyList);
  };

  const upload = async (files) => {
    for (const file of files) {
      setProgress(0);
      try {
        const item = await uploadMedia(file, setProgress);
        setMedia((current) => [item, ...(current ?? [])]);
        toast("Görsel yüklendi.");
      } catch (uploadError) {
        toast(uploadError.message, "error");
      }
    }
    setProgress(null);
  };

  const confirmDelete = async () => {
    setBusy(true);
    const result = await deleteMedia(deleting.id);
    setBusy(false);
    if (!result.ok) {
      setDeleting(null);
      return toast(result.error, "error");
    }
    setMedia((current) => current.filter((item) => item.id !== deleting.id));
    setDeleting(null);
    toast("Görsel silindi.");
  };

  const saveAlt = async (item, value) => {
    if (value === item.alt_text) return;
    const result = await updateMediaAlt(item.id, value);
    if (!result.ok) return toast(result.error, "error");
    setMedia((current) =>
      current.map((other) => (other.id === item.id ? { ...other, alt_text: value } : other))
    );
    toast("Alt metin kaydedildi.");
  };

  return (
    <div>
      <div
        className={styles.dropzone}
        data-dragging={dragging}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          upload([...event.dataTransfer.files]);
        }}
      >
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(event) => {
            upload([...event.target.files]);
            event.target.value = "";
          }}
        />
        {progress === null ? (
          <>
            <button type="button" className={styles.uploadButton} onClick={() => fileInput.current.click()}>
              <ImagePlus size={18} aria-hidden="true" />
              Görsel yükle
            </button>
            <span className={styles.dropHint}>
              ya da sürükleyip bırak · JPG, PNG, WebP · en fazla 4 MB
            </span>
          </>
        ) : (
          <div className={styles.progress} role="status">
            <LoaderCircle size={18} className={styles.spin} aria-hidden="true" />
            <span>Yükleniyor… %{progress}</span>
            <progress value={progress} max={100} aria-label="Yükleme ilerlemesi" />
          </div>
        )}
      </div>

      {error ? (
        <div className={styles.state} role="alert">
          <p>{error}</p>
          <button type="button" className={styles.uploadButton} onClick={reload}>
            <RotateCw size={16} aria-hidden="true" />
            Yeniden dene
          </button>
        </div>
      ) : media === null ? (
        <div className={styles.state} role="status">
          <LoaderCircle size={20} className={styles.spin} aria-hidden="true" />
          <p>Görseller yükleniyor…</p>
        </div>
      ) : media.length === 0 ? (
        <div className={styles.state}>
          <p>Kütüphanede henüz görsel yok. Yüklediğin görseller burada birikir ve tekrar kullanılabilir.</p>
        </div>
      ) : (
        <ul className={styles.grid}>
          {media.map((item) => (
            <li key={item.id} className={styles.item}>
              <div className={styles.thumb}>
                <Image src={item.url} alt={item.alt_text} fill sizes="220px" />
              </div>
              {onSelect ? (
                <button type="button" className={styles.select} onClick={() => onSelect(item)}>
                  <Check size={15} aria-hidden="true" />
                  Bu görseli seç
                  <span className={styles.srOnly}>: {item.alt_text || "alt metni yok"}</span>
                </button>
              ) : (
                <div className={styles.manage}>
                  <label className={styles.altLabel}>
                    Alt metin
                    <input
                      type="text"
                      defaultValue={item.alt_text}
                      maxLength={300}
                      placeholder="Görseli kısaca tarif et"
                      className={styles.altInput}
                      onBlur={(event) => saveAlt(item, event.target.value.trim())}
                    />
                  </label>
                  <div className={styles.itemFooter}>
                    <span>
                      {item.width}×{item.height} · {Math.max(1, Math.round(item.size_bytes / 1024))} KB
                    </span>
                    <button
                      type="button"
                      className={styles.delete}
                      aria-label="Görseli sil"
                      title="Görseli sil"
                      onClick={() => setDeleting(item)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Görsel silinsin mi?"
        confirmLabel="Görseli sil"
        danger
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      >
        Görsel depolamadan kalıcı olarak silinir. Bir yazıda kullanılıyorsa silme işlemi yapılmaz.
      </ConfirmDialog>
    </div>
  );
}
