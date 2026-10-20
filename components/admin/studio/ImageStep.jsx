"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, CircleAlert, Images, LoaderCircle, Sparkles, Star, Trash2, Upload } from "lucide-react";
import { ACCEPTED_TYPES, uploadMedia } from "../upload";
import styles from "./studio.module.css";

const ORIGIN_LABEL = { source: "Kaynaktan", upload: "Yüklendi", ai: "AI · Pollinations" };

// Seçilen görseller havuzu: sıra, alt metin, kapak ve kaldırma.
function Pool({ pool, setPool, coverId, setCoverId }) {
  if (pool.length === 0) {
    return <p className={styles.hint}>Henüz görsel seçilmedi. Görselsiz de devam edebilirsiniz.</p>;
  }
  const move = (index, delta) =>
    setPool((items) => {
      const next = [...items];
      const target = index + delta;
      if (target < 0 || target >= next.length) return items;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  return (
    <ol className={styles.pool}>
      {pool.map((item, index) => (
        <li key={item.media.id} data-cover={item.media.id === coverId || undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.media.url} alt="" />
          <div className={styles.poolBody}>
            <span className={styles.badge}>{ORIGIN_LABEL[item.origin]}</span>
            <label className={styles.srOnly} htmlFor={`alt-${item.media.id}`}>{`${index + 1}. görselin alt metni`}</label>
            <input
              id={`alt-${item.media.id}`}
              className={styles.input}
              value={item.alt}
              maxLength={300}
              placeholder="Alt metin (görseli kısaca tarif edin)"
              aria-invalid={!item.alt.trim() || undefined}
              onChange={(event) => setPool((items) => items.map((other) => (other.media.id === item.media.id ? { ...other, alt: event.target.value } : other)))}
            />
            {!item.alt.trim() ? <span className={styles.warnText}>Alt metin gerekli.</span> : null}
          </div>
          <div className={styles.poolActions}>
            <button
              type="button"
              aria-pressed={item.media.id === coverId}
              aria-label={item.media.id === coverId ? "Kapak görseli (seçili)" : "Kapak görseli yap"}
              onClick={() => setCoverId(item.media.id === coverId ? null : item.media.id)}
            >
              <Star size={15} />
            </button>
            <button type="button" aria-label="Yukarı taşı" disabled={index === 0} onClick={() => move(index, -1)}>
              <ArrowUp size={15} />
            </button>
            <button type="button" aria-label="Aşağı taşı" disabled={index === pool.length - 1} onClick={() => move(index, 1)}>
              <ArrowDown size={15} />
            </button>
            <button
              type="button"
              aria-label="Kaldır"
              onClick={() => {
                setPool((items) => items.filter((other) => other.media.id !== item.media.id));
                if (coverId === item.media.id) setCoverId(null);
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function ImageStep({ urlSource, shotSource, concepts, pool, setPool, coverId, setCoverId }) {
  const sourceImages = urlSource?.images ?? [];
  const [mode, setMode] = useState(sourceImages.length ? "source" : "upload");
  const add = (entries) =>
    setPool((items) => {
      const seen = new Set(items.map((item) => item.media.id));
      return [...items, ...entries.filter((entry) => !seen.has(entry.media.id))];
    });

  // --- A: kaynak görselleri ----------------------------------------------------
  const [picked, setPicked] = useState(() => new Set());
  const [broken, setBroken] = useState(() => new Set());
  const [license, setLicense] = useState(false);
  const [importing, setImporting] = useState({}); // src → "loading" | "done" | hata metni
  const importPicked = async () => {
    for (const image of sourceImages.filter((item) => picked.has(item.src) && importing[item.src] !== "done")) {
      setImporting((state) => ({ ...state, [image.src]: "loading" }));
      try {
        const response = await fetch("/api/admin/ai/import-image", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ src: image.src, alt: image.alt, licenseConfirmed: true }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Görsel aktarılamadı.");
        add([{ media: data.media, alt: image.alt || "", origin: "source", section: image.section || "" }]);
        setImporting((state) => ({ ...state, [image.src]: "done" }));
      } catch (failure) {
        setImporting((state) => ({ ...state, [image.src]: failure.message }));
      }
    }
  };

  // --- B: kendi görselleri -------------------------------------------------------
  const [uploads, setUploads] = useState([]); // { id, name, progress, error }
  const [dragging, setDragging] = useState(false);
  const uploadFiles = async (files) => {
    for (const file of [...files].slice(0, 12)) {
      const id = crypto.randomUUID();
      setUploads((items) => [...items, { id, name: file.name, progress: 0, error: "" }]);
      try {
        const media = await uploadMedia(file, (progress) => setUploads((items) => items.map((item) => (item.id === id ? { ...item, progress } : item))));
        add([{ media, alt: "", origin: "upload" }]);
        setUploads((items) => items.filter((item) => item.id !== id));
      } catch (failure) {
        setUploads((items) => items.map((item) => (item.id === id ? { ...item, error: failure.message } : item)));
      }
    }
  };

  // --- C: AI görselleri (Pollinations) ----------------------------------------
  const [ideas, setIdeas] = useState(() => concepts.slice(0, 3));
  const [generating, setGenerating] = useState({}); // index → "loading" | "done" | hata metni
  const generate = async () => {
    for (const [index, concept] of ideas.entries()) {
      if (!concept.trim() || generating[index] === "done") continue;
      setGenerating((state) => ({ ...state, [index]: "loading" }));
      try {
        const response = await fetch("/api/admin/ai/images", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider: "pollinations",
            seed: Math.floor(Math.random() * 1_000_000),
            image: {
              role: index === 0 ? "cover" : "inline",
              concept: concept.slice(0, 90),
              alt: concept.slice(0, 300),
              prompt: `Editorial blog illustration, original concept: ${concept}. Clean, modern, no text, no logos.`,
            },
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Görsel oluşturulamadı.");
        if (data.kind && data.kind !== "ai") throw new Error("Ücretsiz AI sağlayıcısı görsel üretmedi; sonuç kullanılmadı.");
        add([{ media: data.media, alt: concept.slice(0, 300), origin: "ai" }]);
        setGenerating((state) => ({ ...state, [index]: "done" }));
      } catch (failure) {
        setGenerating((state) => ({ ...state, [index]: failure.message }));
      }
    }
  };

  const options = [
    { key: "source", label: "Kaynak Görsellerini Kullan", Icon: Images, disabled: sourceImages.length === 0, note: sourceImages.length ? `${sourceImages.length} görsel bulundu` : "Kaynak sayfada görsel bulunamadı" },
    { key: "upload", label: "Kendi Görsellerimi Yükle", Icon: Upload, note: "JPG, PNG, WebP · en fazla 4 MB" },
    // İkincil seçenek: kendiliğinden açılmaz ve kullanıcı istemeden üretim yapmaz.
    { key: "ai", label: "Yapay Zekâyla Ücretsiz Görsel Oluştur", Icon: Sparkles, note: "İkincil seçenek · Pollinations · filigranlı, düşük çözünürlük", secondary: true },
  ];

  return (
    <div className={styles.imageLayout}>
      <div>
        <div className={styles.modes} role="group" aria-label="Görsel yöntemi">
          {options.map(({ key, label, Icon, disabled, note, secondary }) => (
            <button key={key} type="button" className={styles.mode} data-secondary={secondary || undefined} aria-pressed={mode === key} disabled={disabled} onClick={() => setMode(key)}>
              <Icon size={20} aria-hidden="true" />
              <strong>{label}</strong>
              <span>{note}</span>
            </button>
          ))}
        </div>

        {shotSource?.images?.length ? (
          <p className={styles.notice}>
            Ekran görüntülerinde {shotSource.images.length} görsel görüldü. Bunların orijinal dosyaları elimizde olmadığı için yalnızca
            tarif olarak taslağa yansır; kullanmak isterseniz kendi kopyanızı yükleyin.
          </p>
        ) : null}

        {mode === "source" ? (
          <section className={styles.panel} aria-label="Kaynak görselleri">
            <div className={styles.license} role="note">
              <CircleAlert size={18} aria-hidden="true" />
              <div>
                <p>
                  Kaynak sitedeki görsellerin telif hakkı genellikle o siteye aittir. Yalnızca kullanım hakkınız olan (kendi içeriğiniz,
                  lisanslı ya da izin alınmış) görselleri aktarın. Aktarılan görsel medya kütüphanenize kaynak bilgisiyle kaydedilir.
                </p>
                <label className={styles.check}>
                  <input type="checkbox" checked={license} onChange={(event) => setLicense(event.target.checked)} />
                  Seçtiğim görselleri kullanma hakkım olduğunu onaylıyorum.
                </label>
              </div>
            </div>
            <ul className={styles.sourceImages}>
              {sourceImages.map((image) => {
                const status = importing[image.src];
                return (
                  <li key={image.src} data-picked={picked.has(image.src) || undefined}>
                    <label>
                      <input
                        type="checkbox"
                        checked={picked.has(image.src)}
                        disabled={broken.has(image.src) || status === "done"}
                        onChange={(event) =>
                          setPicked((set) => {
                            const next = new Set(set);
                            if (event.target.checked) next.add(image.src);
                            else next.delete(image.src);
                            return next;
                          })
                        }
                      />
                      <span className={styles.srOnly}>{image.alt || image.src}</span>
                      {broken.has(image.src) ? (
                        <span className={styles.broken}>Önizleme yüklenemedi</span>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={image.src} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken((set) => new Set(set).add(image.src))} />
                      )}
                    </label>
                    <span className={styles.badge}>{image.role === "og" ? "Kapak (Open Graph)" : "İçerik görseli"}</span>
                    <span className={styles.imageAlt}>{image.alt || "Alt metin yok"}</span>
                    {image.section ? <span className={styles.imageSection}>Bölüm: {image.section}</span> : null}
                    <a href={image.src} target="_blank" rel="noreferrer" className={styles.imageLink}>
                      {new URL(image.src).hostname}
                    </a>
                    {status === "loading" ? <span className={styles.hint}>Aktarılıyor…</span> : null}
                    {status === "done" ? <span className={styles.okText}><Check size={13} aria-hidden="true" /> Kütüphaneye aktarıldı</span> : null}
                    {status && status !== "loading" && status !== "done" ? <span className={styles.warnText}>{status}</span> : null}
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className={styles.secondary}
              disabled={!license || picked.size === 0 || Object.values(importing).includes("loading")}
              onClick={importPicked}
            >
              Seçilenleri kütüphaneye aktar ({picked.size})
            </button>
          </section>
        ) : null}

        {mode === "upload" ? (
          <section className={styles.panel} aria-label="Kendi görselleriniz">
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
              <input type="file" accept={ACCEPTED_TYPES.join(",")} multiple className={styles.srOnly} onChange={(event) => { uploadFiles(event.target.files); event.target.value = ""; }} />
              <span>Görselleri bırakın ya da seçmek için tıklayın</span>
              <span className={styles.hint}>Yüklenen görseller WebP’ye çevrilip medya kütüphanesine kaydedilir.</span>
            </label>
            {uploads.length ? (
              <ul className={styles.uploads}>
                {uploads.map((item) => (
                  <li key={item.id}>
                    <span>{item.name}</span>
                    {item.error ? <span className={styles.warnText}>{item.error}</span> : <progress max={100} value={item.progress} aria-label={`${item.name} yükleniyor`} />}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {mode === "ai" ? (
          <section className={styles.panel} aria-label="AI görselleri">
            <p className={styles.notice}>
              Görseller Pollinations’ın anahtarsız, ücretsiz hizmetiyle üretilir: çözünürlüğü düşüktür ve görselde Pollinations filigranı
              bulunur. Ücretli bir hizmete hiçbir koşulda geçilmez; hizmet yanıt vermezse diğer seçenekler açık kalır.
            </p>
            {ideas.map((idea, index) => (
              <div key={index} className={styles.ideaRow}>
                <label htmlFor={`idea-${index}`} className={styles.label}>{index === 0 ? "Kapak görseli konusu" : `${index + 1}. görsel konusu`}</label>
                <input
                  id={`idea-${index}`}
                  className={styles.input}
                  value={idea}
                  maxLength={90}
                  onChange={(event) => setIdeas((list) => list.map((value, other) => (other === index ? event.target.value : value)))}
                />
                {generating[index] === "loading" ? <span className={styles.hint}><LoaderCircle size={13} className={styles.spin} aria-hidden="true" /> Üretiliyor…</span> : null}
                {generating[index] === "done" ? <span className={styles.okText}><Check size={13} aria-hidden="true" /> Hazır</span> : null}
                {generating[index] && !["loading", "done"].includes(generating[index]) ? <span className={styles.warnText}>{generating[index]}</span> : null}
              </div>
            ))}
            <button type="button" className={styles.secondary} disabled={Object.values(generating).includes("loading") || ideas.every((idea) => !idea.trim())} onClick={generate}>
              <Sparkles size={16} aria-hidden="true" /> Görselleri oluştur
            </button>
          </section>
        ) : null}
      </div>

      <aside className={styles.poolPanel} aria-labelledby="pool-title">
        <h3 id="pool-title" className={styles.panelTitle}>Seçilen görseller ({pool.length})</h3>
        <p className={styles.hint}>Sıra, taslaktaki görsel alanlarına yerleşme sırasıdır. Yıldızlı görsel kapak olur.</p>
        <Pool pool={pool} setPool={setPool} coverId={coverId} setCoverId={setCoverId} />
      </aside>
    </div>
  );
}
