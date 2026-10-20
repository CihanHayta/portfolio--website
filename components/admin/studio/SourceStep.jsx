"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, LoaderCircle, Trash2 } from "lucide-react";
import { SCREENSHOT_TYPES, resizeForAnalysis } from "./resizeImage";
import styles from "./studio.module.css";

const MAX_SHOTS = 8;
export const STAGE_STATUS_TEXT = { start: "deneniyor…", ok: "yeterli içerik", thin: "yetersiz içerik", failed: "başarısız", skipped: "atlandı" };

const offline = (failure) => (failure instanceof TypeError ? "Sunucuya ulaşılamadı. Bağlantınızı kontrol edin." : failure.message);

// NDJSON akışını satır satır okur.
async function readStream(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line));
    }
    if (done) break;
  }
}

// Kaynak URL'yi sunucudaki okuyucu zinciriyle okur (yerel → Jina → Firecrawl →
// tarayıcı). Her sağlayıcı aşaması `onStage` ile gerçek zamanlı bildirilir.
// `provider`: "auto" (zincir) ya da belirli bir okuyucu (yalnızca o denenir).
// Dönüş: { source, attempts } | { fallback: mesaj, attempts } | { error: mesaj, kind }.
export async function streamSource(url, { signal, onStage = () => {}, provider = "auto" } = {}) {
  let outcome = { error: "Kaynak okunamadı." };
  try {
    const response = await fetch("/api/admin/ai/source", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, provider }),
      signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return { error: data.error || "Kaynak incelenemedi.", kind: data.kind };
    }
    await readStream(response, (message) => {
      if (message.type === "stage") onStage(message);
      else if (message.type === "result") outcome = { source: message.source, attempts: message.attempts ?? [] };
      else if (message.type === "fallback") outcome = { fallback: message.error, attempts: message.attempts ?? [] };
      else if (message.type === "error") outcome = { error: message.error, kind: message.kind };
    });
    return outcome;
  } catch (failure) {
    if (signal?.aborted) throw failure;
    return { error: offline(failure) };
  }
}

// Ekran görüntülerini (en fazla 8) küçültüp analiz için gönderir.
export async function analyzeScreenshots(items, { signal } = {}) {
  const body = new FormData();
  for (const item of items) body.append("images", await resizeForAnalysis(item.file));
  const response = await fetch("/api/admin/ai/screenshots", { method: "POST", body, signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ekran görüntüleri analiz edilemedi.");
  return data.source;
}

// Ekran görüntüsü yükleme: sürükle-bırak ya da seçim, sıralama, kaldırma.
// state: { items: [{ id, file, preview }], status, source, error }
export function ShotsPanel({ shots, setShots, inputRef }) {
  const [dragging, setDragging] = useState(false);
  const patch = (value) => setShots((current) => ({ ...current, ...value }));

  const addShots = (files) => {
    const accepted = [...files].filter((file) => SCREENSHOT_TYPES.includes(file.type));
    const rejected = files.length - accepted.length;
    setShots((current) => {
      const room = MAX_SHOTS - current.items.length;
      const items = accepted.slice(0, room).map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }));
      const notes = [];
      if (rejected) notes.push(`${rejected} dosya JPG, PNG ya da WebP olmadığı için eklenmedi.`);
      if (accepted.length > room) notes.push(`En fazla ${MAX_SHOTS} ekran görüntüsü eklenebilir.`);
      return { ...current, items: [...current.items, ...items], status: "idle", source: null, error: notes.join(" ") };
    });
  };
  const move = (index, delta) =>
    setShots((current) => {
      const items = [...current.items];
      const target = index + delta;
      if (target < 0 || target >= items.length) return current;
      [items[index], items[target]] = [items[target], items[index]];
      return { ...current, items, status: "idle", source: null };
    });
  const remove = (id) =>
    setShots((current) => {
      const removed = current.items.find((item) => item.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return { ...current, items: current.items.filter((item) => item.id !== id), status: "idle", source: null };
    });

  const analyze = async () => {
    patch({ status: "loading", error: "", source: null });
    try {
      patch({ status: "ready", source: await analyzeScreenshots(shots.items) });
    } catch (failure) {
      patch({ status: "error", error: offline(failure) });
    }
  };

  return (
    <div className={styles.shots}>
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
          addShots(event.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={SCREENSHOT_TYPES.join(",")}
          multiple
          className={styles.srOnly}
          onChange={(event) => {
            addShots(event.target.files);
            event.target.value = "";
          }}
        />
        <span>Makalenin ekran görüntülerini seçin</span>
        <span className={styles.hint}>En fazla {MAX_SHOTS} görsel · sırayla · gönderilmeden önce küçültülür</span>
      </label>

      {shots.items.length ? (
        <ol className={styles.thumbs}>
          {shots.items.map((item, index) => (
            <li key={item.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.preview} alt={`${index + 1}. ekran görüntüsü`} />
              <span className={styles.thumbIndex}>{index + 1}</span>
              <div className={styles.thumbActions}>
                <button type="button" aria-label={`${index + 1}. görüntüyü yukarı taşı`} disabled={index === 0} onClick={() => move(index, -1)}>
                  <ArrowUp size={16} />
                </button>
                <button type="button" aria-label={`${index + 1}. görüntüyü aşağı taşı`} disabled={index === shots.items.length - 1} onClick={() => move(index, 1)}>
                  <ArrowDown size={16} />
                </button>
                <button type="button" aria-label={`${index + 1}. görüntüyü kaldır`} onClick={() => remove(item.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      {shots.items.length && shots.status !== "ready" ? (
        <button type="button" className={styles.secondary} disabled={shots.status === "loading"} onClick={analyze}>
          {shots.status === "loading" ? <LoaderCircle size={16} className={styles.spin} aria-hidden="true" /> : null}
          {shots.status === "loading" ? "Görüntüler okunuyor…" : "Görüntüleri şimdi oku"}
        </button>
      ) : null}
      {shots.status === "ready" && shots.source ? (
        <p className={styles.okText}>
          {shots.source.wordCount} sözcük okundu{shots.source.unreadable?.length ? ` · okunamayan: ${shots.source.unreadable.join("; ")}` : ""}
        </p>
      ) : null}
      {shots.error ? (
        <p className={styles.errorBox} role="alert">
          {shots.error}
        </p>
      ) : null}
    </div>
  );
}
