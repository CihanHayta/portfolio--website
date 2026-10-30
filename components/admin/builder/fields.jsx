"use client";

import { useContext, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { defaultProps, videoEmbed } from "@/lib/blog/blocks/model";
import { safeHref } from "@/lib/blog/content";
import { ImageAiContext } from "../images/imageAiContext";
import styles from "./builder.module.css";

// Ağır parçalar (Tiptap, medya kütüphanesi) yalnızca gerektiğinde yüklenir.
export const RichTextField = dynamic(() => import("./RichTextField"), {
  ssr: false,
  loading: () => <div className={styles.fieldLoading}>Metin alanı yükleniyor…</div>,
});
const MediaPickerDialog = dynamic(() => import("../MediaPickerDialog"), { ssr: false });
const AiImageDialog = dynamic(() => import("../images/AiImageDialog"), { ssr: false });

const ALIGN_ICONS = { left: AlignLeft, center: AlignCenter, right: AlignRight };

function Label({ id, children }) {
  return (
    <label htmlFor={id} className={styles.label}>
      {children}
    </label>
  );
}

export function ImageControl({ value, onChange, label, withAlt = true, purpose = "inline" }) {
  const [open, setOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const aiContext = useContext(ImageAiContext);

  const pick = (media) => {
    onChange({
      ...(media.id ? { id: media.id } : {}),
      url: media.url,
      width: media.width,
      height: media.height,
      alt: value?.alt || media.alt_text || "",
    });
    setOpen(false);
  };

  return (
    <div className={styles.imageControl}>
      {value ? (
        <div className={styles.imagePreview}>
          <Image src={value.url} alt="" fill sizes="320px" />
        </div>
      ) : (
        <button type="button" className={styles.imageEmpty} onClick={() => setOpen(true)}>
          <ImagePlus size={22} strokeWidth={1.6} aria-hidden="true" />
          <span>Görsel seç ya da yükle</span>
        </button>
      )}
      {value ? (
        <div className={styles.imageActions}>
          <button type="button" className={styles.btnSmall} onClick={() => setOpen(true)}>
            Değiştir
          </button>
          <button type="button" className={styles.btnSmall} data-danger="true" onClick={() => onChange(null)}>
            Kaldır
          </button>
        </div>
      ) : null}
      {value && withAlt ? (
        <label className={styles.subField}>
          <span>Alt metin</span>
          <input
            type="text"
            className={styles.input}
            value={value.alt ?? ""}
            maxLength={300}
            placeholder="Görseli göremeyenler için kısa tarif"
            onChange={(event) => onChange({ ...value, alt: event.target.value })}
          />
        </label>
      ) : null}
      {aiContext ? (
        <div className={styles.imageSources}>
          <button type="button" className={styles.btnSmall} onClick={() => setOpen(true)}>
            <Upload size={14} aria-hidden="true" /> Görsel yükle
          </button>
          <button type="button" className={styles.btnSmall} onClick={() => setAiOpen(true)}>
            <Sparkles size={14} aria-hidden="true" /> Yapay zekâyla oluştur
          </button>
        </div>
      ) : null}
      {/* Pencere yalnızca açıldığında yüklenir ve kurulur. */}
      {open ? (
        <MediaPickerDialog open title={label} onSelect={pick} onClose={() => setOpen(false)} />
      ) : null}
      {aiOpen && aiContext ? (
        <AiImageDialog
          context={aiContext}
          purpose={purpose}
          current={value}
          onAccept={(media) => onChange({ ...media, alt: media.alt || value?.alt || "" })}
          onClose={() => setAiOpen(false)}
        />
      ) : null}
    </div>
  );
}

function ListControl({ field, value, onChange, idPrefix }) {
  const [openId, setOpenId] = useState(null);
  const items = value ?? [];

  const update = (index, patch) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const move = (index, delta) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    onChange(next);
  };
  const add = () => {
    const item = defaultProps(field.fields, true);
    onChange([...items, item]);
    setOpenId(item.id);
  };

  return (
    <div className={styles.list}>
      {items.map((item, index) => {
        const open = openId === item.id;
        const summary =
          item.title || item.question || item.value || item.image?.alt || `${field.itemLabel} ${index + 1}`;
        return (
          <div key={item.id} className={styles.listItem}>
            <div className={styles.listHead}>
              <button
                type="button"
                className={styles.listToggle}
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : item.id)}
              >
                <ChevronDown size={15} aria-hidden="true" data-open={open} />
                <span>{summary}</span>
              </button>
              <button type="button" className={styles.iconSmall} aria-label={`${summary}: yukarı taşı`} disabled={index === 0} onClick={() => move(index, -1)}>
                <ChevronUp size={15} />
              </button>
              <button type="button" className={styles.iconSmall} aria-label={`${summary}: aşağı taşı`} disabled={index === items.length - 1} onClick={() => move(index, 1)}>
                <ChevronDown size={15} />
              </button>
              <button
                type="button"
                className={styles.iconSmall}
                data-danger="true"
                aria-label={`${summary}: sil`}
                disabled={items.length <= field.min}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                <Trash2 size={15} />
              </button>
            </div>
            {open ? (
              <div className={styles.listBody}>
                {field.fields.map((sub) => (
                  <Field
                    key={sub.key}
                    field={sub}
                    value={item[sub.key]}
                    idPrefix={`${idPrefix}-${item.id}`}
                    onChange={(next) => update(index, { [sub.key]: next })}
                  />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
      <button type="button" className={styles.addButton} disabled={items.length >= field.max} onClick={add}>
        <Plus size={15} aria-hidden="true" />
        {field.itemLabel} ekle
      </button>
    </div>
  );
}

// Şemadaki bir alanı, türüne uygun form denetimiyle gösterir.
export function Field({ field, value, onChange, idPrefix }) {
  const id = `${idPrefix}-${field.key}`;

  switch (field.type) {
    case "text":
      return (
        <div className={styles.field}>
          <Label id={id}>{field.label}</Label>
          <input id={id} type="text" className={styles.input} value={value ?? ""} maxLength={field.max} onChange={(event) => onChange(event.target.value)} />
        </div>
      );
    case "textarea":
      return (
        <div className={styles.field}>
          <Label id={id}>{field.label}</Label>
          <textarea id={id} className={`${styles.input} ${styles.textarea}`} rows={4} value={value ?? ""} maxLength={field.max} onChange={(event) => onChange(event.target.value)} />
        </div>
      );
    case "url": {
      const invalid = Boolean(value) && !(field.video ? videoEmbed(value) : safeHref(value));
      return (
        <div className={styles.field}>
          <Label id={id}>{field.label}</Label>
          <input
            id={id}
            type="text"
            inputMode="url"
            className={styles.input}
            value={value ?? ""}
            maxLength={500}
            placeholder={field.video ? "https://www.youtube.com/watch?v=…" : "https://… ya da /sayfa"}
            aria-invalid={invalid}
            aria-describedby={invalid ? `${id}-error` : undefined}
            onChange={(event) => onChange(event.target.value)}
          />
          {invalid ? (
            <p id={`${id}-error`} className={styles.fieldError} role="alert">
              {field.video
                ? "Yalnızca YouTube ve Vimeo bağlantıları desteklenir."
                : "Geçerli bir adres yazın (https://…, /sayfa, #bölüm ya da mailto:…)."}
            </p>
          ) : null}
        </div>
      );
    }
    case "select":
      return (
        <div className={styles.field}>
          <Label id={id}>{field.label}</Label>
          <select id={id} className={styles.input} value={value} onChange={(event) => onChange(event.target.value)}>
            {field.options.map(([option, label]) => (
              <option key={option} value={option}>
                {label}
              </option>
            ))}
          </select>
        </div>
      );
    case "align":
      return (
        <div className={styles.field} role="group" aria-labelledby={`${id}-label`}>
          <span id={`${id}-label`} className={styles.label}>
            {field.label}
          </span>
          <div className={styles.segmented}>
            {field.options.map(([option, label]) => {
              const Icon = ALIGN_ICONS[option];
              return (
                <button key={option} type="button" aria-label={label} title={label} aria-pressed={value === option} onClick={() => onChange(option)}>
                  <Icon size={17} />
                </button>
              );
            })}
          </div>
        </div>
      );
    case "toggle":
      return (
        <label className={styles.toggle}>
          <span>{field.label}</span>
          <input type="checkbox" role="switch" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        </label>
      );
    case "image":
      return (
        <div className={styles.field}>
          <span className={styles.label}>{field.label}</span>
          <ImageControl value={value} onChange={onChange} label={field.label} />
        </div>
      );
    case "lines":
      return (
        <div className={styles.field}>
          <Label id={id}>{field.label}</Label>
          <textarea
            id={id}
            className={`${styles.input} ${styles.textarea}`}
            rows={5}
            value={(value ?? []).join("\n")}
            onChange={(event) => onChange(event.target.value.split("\n"))}
          />
        </div>
      );
    case "rich":
      return (
        <div className={styles.field}>
          <span className={styles.label}>{field.label}</span>
          <RichTextField compact value={value} onChange={onChange} label={field.label} />
        </div>
      );
    case "list":
      return (
        <div className={styles.field}>
          <span className={styles.label}>{field.label}</span>
          <ListControl field={field} value={value} onChange={onChange} idPrefix={id} />
        </div>
      );
    default:
      return null;
  }
}
