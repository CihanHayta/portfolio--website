"use client";

import { Check, ExternalLink, ImagePlus, LoaderCircle, RefreshCw, Sparkles, Upload, X, ZoomIn } from "lucide-react";
import { REFERENCE_FORMATS, REFERENCE_OPTIONS, VISUAL_KINDS, imageSearchQuery } from "@/lib/ai/visualPlan";
import styles from "./visual.module.css";

const CHOICES = [
  ["ai", "AI ile üret", Sparkles],
  ["source", "Kaynak görsel", ImagePlus],
  ["upload", "Yükle", Upload],
  ["reference", "Kaynaktan AI", RefreshCw],
];

// Aday görselin lisans/kullanım notu (yalnızca bilinen gerçek bilgi).
export function licenseNote(candidate) {
  if (candidate.origin === "upload") return "kendi görselin";
  if (candidate.origin === "source") return "lisans doğrulanmadı";
  if (candidate.provider === "pollinations") return "filigranlı · ticari şart doğrulanmadı";
  if (candidate.provider === "cloudflare" && /flux/i.test(candidate.model ?? "")) return "model lisansı Apache-2.0";
  if (candidate.provider === "comfyui") return "model lisansını kendin doğrula";
  return "lisans bilgisi yok";
}
export const isRiskyCandidate = (candidate) => candidate?.origin === "ai" && candidate.provider === "pollinations";

const hostOf = (src) => {
  try {
    return new URL(src).hostname.replace(/^www\./, "");
  } catch {
    return "kaynak";
  }
};

// Bir görsel önerisi: hedef bölüm, amaç, üretim yöntemi, adaylar ve seçim.
export default function VisualCard({ item, card, images, sections, sourceImages, title, providers, canReference, onPatch, onGenerate, onCancel, onPickSource, onUpload, onReferenceUpload, onZoom }) {
  const running = card.status === "running";
  const candidates = card.candidates.filter((candidate) => !card.rejected.includes(candidate.id));
  const query = imageSearchQuery({ ...item, heading: sections.find((section) => section.id === card.target)?.heading ?? item.heading }, title);
  const sectionImages = [...sourceImages].sort((a, b) => Number(b.section === item.sourceImage?.section) - Number(a.section === item.sourceImage?.section));
  const usedProviders = new Set(card.candidates.filter((candidate) => candidate.origin === "ai").map((candidate) => candidate.provider));
  const alternatives = providers.filter((provider) => provider.ready && (card.choice !== "reference" || provider.imageToImage));
  const altMissing = Boolean(card.selected) && !card.alt.trim();
  const headingId = `visual-${item.id}-title`;

  return (
    <li className={styles.card} data-selected={Boolean(card.selected)} aria-labelledby={headingId}>
      <div className={styles.cardHead}>
        <span className={styles.kind}>{VISUAL_KINDS[item.kind] ?? "Görsel"} · öncelik {item.priority}</span>
        <h3 id={headingId} className={styles.purpose}>{item.purpose || "Görsel önerisi"}</h3>
        {item.composition ? <p className={styles.composition}>{item.composition}</p> : null}
      </div>

      <label className={styles.label}>
        Hedef bölüm
        <select className={styles.select} value={card.target} onChange={(event) => onPatch({ target: event.target.value })}>
          <option value="cover">Kapak görseli</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.level === 3 ? "— " : ""}{section.heading}
            </option>
          ))}
        </select>
      </label>
      {card.targetMissing ? (
        <p className={styles.errorBox} role="alert">Bu bölüm taslakta bulunamadı. Görselin ekleneceği bölümü seç.</p>
      ) : null}

      <fieldset className={styles.choices}>
        <legend>Görsel nereden gelsin?</legend>
        {CHOICES.map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={card.choice === value}
            className={styles.choice}
            disabled={running || (value === "source" && sourceImages.length === 0)}
            onClick={() => onPatch({ choice: value })}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        ))}
      </fieldset>

      {card.choice === "source" || card.choice === "reference" ? (
        <div className={styles.label}>
          {card.choice === "reference" ? "Referans görsel" : "Kaynak makaledeki görseller"}
          {sectionImages.length ? (
            <ul className={styles.sourceImages}>
              {sectionImages.slice(0, 9).map((image) => (
                <li key={image.src}>
                  <button type="button" className={styles.sourceImage} aria-pressed={card.sourcePick === image.src} aria-label={`Kaynak görseli: ${image.alt || "alt metin yok"}`} onClick={() => onPickSource(image)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.src} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <span className={styles.meta}>Kaynakta görsel bulunamadı.</span>
          )}
          {card.choice === "reference" ? (
            <label className={styles.secondary}>
              <Upload size={16} aria-hidden="true" /> Referansı telefondan yükle
              <input type="file" accept="image/jpeg,image/png,image/webp" className={styles.srOnly} onChange={(event) => onReferenceUpload(event.target.files?.[0])} />
            </label>
          ) : null}
          {card.sourcePick || card.referenceUpload ? (
            <label className={styles.check}>
              <input type="checkbox" checked={card.licenseOk} onChange={(event) => onPatch({ licenseOk: event.target.checked })} />
              <span>Bu görseli kullanma hakkım olduğunu onaylıyorum. Lisans doğrulanmadı; kaynakta bulunması serbest kullanım hakkı vermez.</span>
            </label>
          ) : null}
        </div>
      ) : null}

      {card.choice === "upload" ? (
        <label className={styles.secondary}>
          <Upload size={16} aria-hidden="true" /> Telefondan görsel seç
          <input type="file" accept="image/jpeg,image/png,image/webp" className={styles.srOnly} onChange={(event) => onUpload(event.target.files?.[0])} />
        </label>
      ) : null}

      {card.choice === "reference" ? (
        <div className={styles.label}>
          Kaynaktan özgün görsel
          <div className={styles.chips}>
            {Object.entries(REFERENCE_OPTIONS).map(([key, option]) => (
              <button key={key} type="button" className={styles.chip} aria-pressed={card.refOptions.includes(key)} onClick={() => onPatch({ refOptions: card.refOptions.includes(key) ? card.refOptions.filter((value) => value !== key) : [...card.refOptions, key] })}>
                {option.label}
              </button>
            ))}
          </div>
          <select className={styles.select} aria-label="Görsel biçimi" value={card.refFormat} onChange={(event) => onPatch({ refFormat: event.target.value })}>
            {Object.entries(REFERENCE_FORMATS).map(([key, format]) => (
              <option key={key} value={key}>{format.label} ({format.aspect})</option>
            ))}
          </select>
          {!canReference ? <p className={styles.notice}>Bu ortamda referans görselden üretim yapan ücretsiz bir servis yapılandırılmamış (ComfyUI ya da Cloudflare Workers AI). Metinden üretimi kullanabilirsin.</p> : null}
        </div>
      ) : null}

      {card.choice === "ai" || card.choice === "reference" ? (
        <details className={styles.more}>
          <summary>İstemi düzenle</summary>
          <textarea className={styles.textarea} aria-label="Görsel üretim istemi" value={card.prompt} maxLength={900} onChange={(event) => onPatch({ prompt: event.target.value })} />
        </details>
      ) : null}

      {candidates.length ? (
        <ul className={styles.candidates} aria-label="Görsel adayları">
          {candidates.map((candidate) => {
            const src = candidate.origin === "source" ? candidate.src : images[candidate.id];
            const label = candidate.origin === "ai" ? candidate.providerLabel : candidate.origin === "source" ? "Kaynak görsel" : "Yüklenen görsel";
            const detail = candidate.origin === "ai" ? `${candidate.modelLabel || "model bildirilmedi"} · ${licenseNote(candidate)}` : candidate.origin === "source" ? `${hostOf(candidate.src)} · ${licenseNote(candidate)}` : licenseNote(candidate);
            return (
              <li key={candidate.id} className={styles.candidate} data-selected={card.selected === candidate.id}>
                <button type="button" className={styles.thumb} aria-label={`${label} görselini büyüt`} onClick={() => src && onZoom({ src, label: `${label} · ${detail}` })}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {src ? <img src={src} alt="" referrerPolicy="no-referrer" /> : <span className={styles.meta}>Önizleme yükleniyor…</span>}
                </button>
                <p className={styles.provenance}>
                  {label}
                  <span>{detail}{candidate.cached ? " · önbellekten" : ""}</span>
                </p>
                <div className={styles.candidateActions}>
                  <button type="button" className={styles.pick} aria-pressed={card.selected === candidate.id} onClick={() => onPatch({ selected: card.selected === candidate.id ? null : candidate.id })}>
                    {card.selected === candidate.id ? <><Check size={14} aria-hidden="true" /> Seçildi</> : "Bu görseli seç"}
                  </button>
                  <button type="button" className={styles.reject} aria-label="Bu adayı reddet" onClick={() => onPatch({ rejected: [...card.rejected, candidate.id], selected: card.selected === candidate.id ? null : card.selected })}>
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {running ? (
        <p className={styles.status} role="status">
          <LoaderCircle size={16} className={styles.spin} aria-hidden="true" /> Görsel üretiliyor… (genellikle 5–40 sn)
          <button type="button" className={styles.secondary} onClick={onCancel}>İptal</button>
        </p>
      ) : null}
      {card.error ? (
        <div className={styles.errorBox} role="alert">
          {card.error}
          {card.retryOpId ? (
            <div className={styles.actions} style={{ marginTop: 8 }}>
              <button type="button" className={styles.secondary} onClick={() => onGenerate({ retry: true })}>Yeniden dene</button>
            </div>
          ) : null}
        </div>
      ) : null}

      {card.choice === "ai" || card.choice === "reference" ? (
        <div className={styles.actions}>
          <button type="button" className={styles.primary} disabled={running || (card.choice === "reference" && (!canReference || !(card.sourcePick || card.referenceUpload) || !card.licenseOk))} onClick={() => onGenerate({})}>
            {running ? <LoaderCircle size={16} className={styles.spin} aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
            {card.candidates.some((candidate) => candidate.origin === "ai") ? "Tekrar oluştur" : "Görsel üret"}
          </button>
          {alternatives.length > 1 || (alternatives.length === 1 && !usedProviders.has(alternatives[0].id)) ? (
            <details className={styles.more}>
              <summary>Başka modelle alternatif</summary>
              <div className={styles.actions}>
                {alternatives.map((provider) => (
                  <button key={provider.id} type="button" className={styles.secondary} disabled={running} onClick={() => onGenerate({ provider: provider.id })}>
                    {provider.label}
                  </button>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}

      <label className={styles.label}>
        Alt metin {card.selected ? "(zorunlu)" : ""}
        <input className={styles.input} value={card.alt} maxLength={300} aria-invalid={altMissing || undefined} placeholder="Görseli kısaca tarif et" onChange={(event) => onPatch({ alt: event.target.value })} />
      </label>
      <label className={styles.label}>
        Açıklama (isteğe bağlı)
        <input className={styles.input} value={card.caption} maxLength={300} onChange={(event) => onPatch({ caption: event.target.value })} />
      </label>
      <label className={styles.check}>
        <input type="checkbox" checked={card.include} onChange={(event) => onPatch({ include: event.target.checked })} />
        <span>Toplu üretime dahil et</span>
      </label>
      {card.inserted ? <p className={styles.okText}>Taslağa eklendi.</p> : null}
    </li>
  );
}
