"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, CircleAlert, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { MAX_SOURCES, cleanUrl, hostLabel } from "@/lib/blog/meta";
import styles from "./builder.module.css";

// Kaynakça editörü (Sayfa Ayarları). Yazının sonunda "Yazıda kullanılan kaynaklar"
// olarak numaralı görünür; metindeki [1], [2] atıfları bu sırayla eşleşir.
// Sistem kaynak uydurmaz: liste okunan sayfalardan gelir ya da yazar elle ekler.
// Kaynağı olmayan yazı yalnızca "kendi deneyimime dayanıyor" beyanıyla yayımlanır.

const EMPTY = { url: "", title: "", siteName: "", sectionUrl: "" };

function SourceForm({ initial = EMPTY, submitLabel, onSubmit, onCancel }) {
  const [value, setValue] = useState({ ...EMPTY, ...initial });
  const [error, setError] = useState("");
  const set = (key) => (event) => setValue((current) => ({ ...current, [key]: event.target.value }));
  const submit = () => {
    const url = cleanUrl(value.url);
    if (!url) return setError("Geçerli bir http(s) adresi gir (ör. https://ornek.com/yazi).");
    const sectionUrl = value.sectionUrl.trim() ? cleanUrl(value.sectionUrl) : "";
    if (value.sectionUrl.trim() && !sectionUrl) return setError("Bölüm adresi geçerli bir http(s) adresi olmalı.");
    setError("");
    onSubmit({ ...value, url, sectionUrl, title: value.title.trim() || hostLabel(url), siteName: value.siteName.trim() });
  };
  return (
    <div className={styles.sourceForm}>
      <label className={styles.subField}>
        <span>Kaynak adresi (URL)</span>
        <input type="url" inputMode="url" className={styles.input} value={value.url} maxLength={2000} placeholder="https://…" onChange={set("url")} />
      </label>
      <label className={styles.subField}>
        <span>Başlık</span>
        <input type="text" className={styles.input} value={value.title} maxLength={200} placeholder="Makale ya da araştırma başlığı" onChange={set("title")} />
      </label>
      <label className={styles.subField}>
        <span>Site adı (isteğe bağlı)</span>
        <input type="text" className={styles.input} value={value.siteName} maxLength={80} placeholder="Ör. Think with Google" onChange={set("siteName")} />
      </label>
      <label className={styles.subField}>
        <span>Sitenin blog/araştırma bölümü (isteğe bağlı, doğruladıysan)</span>
        <input type="url" inputMode="url" className={styles.input} value={value.sectionUrl} maxLength={2000} placeholder="https://…/blog" onChange={set("sectionUrl")} />
      </label>
      {error ? <p className={styles.fieldError} role="alert">{error}</p> : null}
      <div className={styles.sourceFormActions}>
        {onCancel ? <button type="button" className={styles.btnSmall} onClick={onCancel}>Vazgeç</button> : null}
        <button type="button" className={styles.btnSmall} data-primary="true" onClick={submit}>{submitLabel}</button>
      </div>
    </div>
  );
}

export default function SourcesEditor({ sources = [], waived = false, dangling = [], onChange }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null); // index
  const update = (list, extra = {}) => onChange({ sources: list.map((item, index) => ({ ...item, id: item.id || `k${index + 1}` })), ...extra });
  const move = (index, by) => {
    const list = [...sources];
    const [item] = list.splice(index, 1);
    list.splice(index + by, 0, item);
    update(list);
  };
  const ready = sources.length > 0 || waived;

  return (
    <section className={styles.section} aria-labelledby="set-sources" id="kaynakca-ayari">
      <h3 id="set-sources" className={styles.sectionTitle}>Kaynakça</h3>
      <p className={styles.hint}>Yazının sonunda “Yazıda kullanılan kaynaklar” olarak numaralı görünür. Metinde [1], [2] yazarak kaynağa atıf yapabilirsin.</p>
      {!ready ? (
        <p className={styles.sourceWarn} role="status">
          <CircleAlert size={15} aria-hidden="true" /> Kaynak eklenmedi. Yayınlamadan önce kullandığın kaynağı ekle ya da yazı kendi deneyimine dayanıyorsa aşağıda işaretle.
        </p>
      ) : null}
      {dangling.length ? (
        <p className={styles.sourceWarn} role="status">
          <CircleAlert size={15} aria-hidden="true" /> Metinde kaynakçada karşılığı olmayan atıf var: {dangling.map((n) => `[${n}]`).join(", ")}.
        </p>
      ) : null}

      {sources.length ? (
        <ol className={styles.sourceList}>
          {sources.map((source, index) => (
            <li key={source.id || source.url} className={styles.sourceItem}>
              {editing === index ? (
                <SourceForm
                  initial={source}
                  submitLabel="Kaydet"
                  onCancel={() => setEditing(null)}
                  onSubmit={(value) => {
                    update(sources.map((item, position) => (position === index ? { ...item, ...value } : item)));
                    setEditing(null);
                  }}
                />
              ) : (
                <>
                  <span className={styles.sourceNumber}>[{index + 1}]</span>
                  <span className={styles.sourceText}>
                    <strong>{source.title || hostLabel(source.url)}</strong>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.siteName || hostLabel(source.url)} <ExternalLink size={12} aria-hidden="true" />
                    </a>
                    {source.kind === "source" ? <span className={styles.sourceTag}>Okunan kaynak</span> : null}
                  </span>
                  <span className={styles.sourceTools}>
                    <button type="button" className={styles.iconSmall} aria-label={`${index + 1}. kaynağı yukarı taşı`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></button>
                    <button type="button" className={styles.iconSmall} aria-label={`${index + 1}. kaynağı aşağı taşı`} disabled={index === sources.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></button>
                    <button type="button" className={styles.iconSmall} aria-label={`${index + 1}. kaynağı düzenle`} onClick={() => setEditing(index)}><Pencil size={14} /></button>
                    <button type="button" className={styles.iconSmall} data-danger="true" aria-label={`${index + 1}. kaynağı sil`} onClick={() => update(sources.filter((_, position) => position !== index))}><Trash2 size={14} /></button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ol>
      ) : null}

      {adding ? (
        <SourceForm
          submitLabel="Kaynağı ekle"
          onCancel={() => setAdding(false)}
          onSubmit={(value) => {
            if (sources.some((item) => item.url.replace(/\/$/, "") === value.url.replace(/\/$/, ""))) return setAdding(false);
            update([...sources, { ...value, kind: "user", id: `k${sources.length + 1}-${Date.now().toString(36).slice(-4)}` }], { sourcesWaived: false });
            setAdding(false);
          }}
        />
      ) : sources.length < MAX_SOURCES ? (
        <button type="button" className={styles.textLink} onClick={() => setAdding(true)}>
          <Plus size={14} aria-hidden="true" /> Kaynak ekle
        </button>
      ) : null}

      <label className={styles.toggle}>
        <span>Bu yazı kendi deneyimime dayanıyor (kaynak yok)</span>
        <input type="checkbox" role="switch" checked={waived && sources.length === 0} disabled={sources.length > 0} onChange={(event) => onChange({ sources, sourcesWaived: event.target.checked })} />
      </label>
      {waived && sources.length === 0 ? <p className={styles.hint}>Yazının sonunda kaynakça yerine “Bu yazı yazarın kendi deneyim ve gözlemlerine dayanır.” notu görünür.</p> : null}
    </section>
  );
}
