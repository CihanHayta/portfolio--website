"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, ImagePlus, LoaderCircle, Wand2, X } from "lucide-react";
import { ARENA_COMPARE_URL, draftSections } from "@/lib/ai/visualPlan";
import { loadSourceContext, loadVisualState, saveSourceContext, saveVisualState } from "@/lib/blog/sourceContext";
import { resizeForAnalysis } from "../studio/resizeImage";
import { uploadMedia } from "../upload";
import { dataUrlToFile, deleteCandidate, getCandidate, newOpId, putCandidate, randomSeed } from "./candidateCache";
import VisualCard, { isRiskyCandidate } from "./VisualCard";
import styles from "./visual.module.css";

const readJson = async (response) => response.json().catch(() => ({}));
const offline = (error) => (error instanceof TypeError ? "Sunucuya ulaşılamadı. Bağlantını kontrol edip yeniden dene." : error.message);
const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Dosya okunamadı."));
    reader.readAsDataURL(file);
  });

function cardFromItem(item) {
  return {
    target: item.target,
    prompt: item.prompt,
    alt: item.alt,
    caption: item.caption,
    choice: item.sourceImage ? "source" : "ai",
    sourcePick: null,
    referenceUpload: null,
    licenseOk: false,
    refOptions: ["inspire"],
    refFormat: item.target === "cover" ? "cover" : "inline",
    include: item.priority === 1,
    candidates: [],
    rejected: [],
    selected: null,
    status: "idle",
    error: "",
    retryOpId: null,
    retrySeed: null,
    inserted: false,
    uploaded: {}, // aday kimliği → medya (aynı görsel ikinci kez yüklenmez)
  };
}

// AI Görsel Stüdyosu: taslağın bölümleri + kaynak bağlamından görsel planı;
// kart başına aday üretimi/seçimi; seçilenler doğru bölümlere eklenir.
export default function VisualStudio({ postId, title, getBlocks, onInsert, onClose }) {
  const dialogRef = useRef(null);
  const saved = useMemo(() => loadVisualState(postId), [postId]);
  const [source, setSource] = useState(() => loadSourceContext(postId));
  const [urlInput, setUrlInput] = useState("");
  const [plan, setPlan] = useState(saved?.plan ?? null);
  const [planMeta, setPlanMeta] = useState(saved?.planMeta ?? null);
  const [planOpId, setPlanOpId] = useState(saved?.planOpId ?? null);
  const [cards, setCards] = useState(saved?.cards ?? {});
  const [images, setImages] = useState({});
  const [planState, setPlanState] = useState({ status: saved?.plan ? "ready" : "idle", error: "" });
  const [providers, setProviders] = useState([]);
  const [zoom, setZoom] = useState(null);
  const [inserting, setInserting] = useState(false);
  const [notice, setNotice] = useState("");
  const [acceptRisk, setAcceptRisk] = useState(false);
  const cardsRef = useRef(cards);
  const controllers = useRef(new Map());
  const sections = useMemo(() => draftSections(getBlocks()), [getBlocks, plan]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();
  }, []);

  // Durum bu tarayıcıda saklanır: sayfa yenilenince plan ve seçimler kaybolmaz.
  useEffect(() => {
    const persistable = Object.fromEntries(Object.entries(cards).map(([id, card]) => [id, { ...card, status: card.status === "running" ? "interrupted" : card.status }]));
    saveVisualState(postId, { plan, planMeta, planOpId, cards: persistable });
  }, [postId, plan, planMeta, planOpId, cards]);

  // Aday görüntülerini IndexedDB'den yükle.
  useEffect(() => {
    let active = true;
    const ids = Object.values(cards).flatMap((card) => card.candidates.filter((candidate) => candidate.origin !== "source").map((candidate) => candidate.id));
    Promise.all(ids.filter((id) => !images[id]).map(async (id) => [id, await getCandidate(id)])).then((entries) => {
      if (!active) return;
      const found = entries.filter(([, value]) => value);
      if (found.length) setImages((current) => ({ ...current, ...Object.fromEntries(found) }));
    });
    return () => {
      active = false;
    };
  }, [cards]); // eslint-disable-line react-hooks/exhaustive-deps

  // Kullanılabilir görsel servisleri (yalnızca durum; anahtar değerleri gelmez).
  useEffect(() => {
    fetch("/api/admin/ai/services")
      .then(readJson)
      .then((data) => {
        const list = (data.services ?? []).filter((service) => service.category === "image").map((service) => ({ id: service.provider, label: service.label.replace(/ \(görsel\)$/, ""), ready: service.configured && service.state === "active", imageToImage: service.tasks.includes("referans görselden üretim") }));
        setProviders(list);
      })
      .catch(() => setProviders([]));
  }, []);

  const patchCard = useCallback((id, patch) => {
    setCards((current) => ({ ...current, [id]: { ...current[id], ...(typeof patch === "function" ? patch(current[id]) : patch) } }));
  }, []);

  const applyPlan = useCallback((data) => {
    setPlan(data.plan);
    setPlanMeta({ provider: data.provider, model: data.model, budget: data.budget, sourceSummary: data.sourceSummary, at: Date.now() });
    setCards((current) => Object.fromEntries(data.plan.items.map((item) => [item.id, current[item.id] && current[item.id].prompt ? { ...cardFromItem(item), ...current[item.id] } : cardFromItem(item)])));
    if (data.source) {
      saveSourceContext(postId, data.source);
      setSource(data.source);
    }
    setPlanState({ status: "ready", error: "" });
  }, [postId]);

  // Sayfa yenilendiyse ve plan işi sürüyorsa aynı işin sonucunu al (yeni üretim yok).
  useEffect(() => {
    if (plan || !planOpId) return;
    fetch(`/api/admin/ai/visual-plan?opId=${encodeURIComponent(planOpId)}`)
      .then(readJson)
      .then((data) => {
        if (data.job?.status === "completed" && data.job.result?.plan) applyPlan(data.job.result);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const requestPlan = async ({ fresh = false } = {}) => {
    if (planState.status === "loading") return;
    const opId = fresh || !planOpId ? newOpId() : planOpId;
    setPlanOpId(opId);
    setPlanState({ status: "loading", error: "" });
    const body = { opId, postId, title, sections: draftSections(getBlocks()), source: source ?? null, url: source ? "" : urlInput.trim() };
    try {
      for (let poll = 0; poll < 20; poll += 1) {
        const response = await fetch("/api/admin/ai/visual-plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const data = await readJson(response);
        if (response.status === 409 && data.status === "running") {
          await new Promise((resolve) => setTimeout(resolve, 3_000));
          continue;
        }
        if (!response.ok) throw new Error(data.error || "Görsel planı hazırlanamadı.");
        applyPlan(data);
        return;
      }
      throw new Error("Plan hâlâ hazırlanıyor. Biraz sonra yeniden aç.");
    } catch (error) {
      setPlanState({ status: "error", error: offline(error) });
    }
  };

  const generate = async (item, { provider = null, retry = false } = {}) => {
    const card = cardsRef.current[item.id];
    if (!card || card.status === "running") return; // çift dokunma koruması
    const opId = retry && card.retryOpId ? card.retryOpId : newOpId();
    const seed = retry && card.retrySeed !== null ? card.retrySeed : randomSeed();
    let reference = null;
    if (card.choice === "reference") {
      if (card.referenceUpload) reference = { kind: "upload", data: await getCandidate(card.referenceUpload) };
      else if (card.sourcePick) reference = { kind: "source", src: card.sourcePick, licenseConfirmed: card.licenseOk };
    }
    const controller = new AbortController();
    controllers.current.set(item.id, controller);
    patchCard(item.id, { status: "running", error: "", retryOpId: opId, retrySeed: seed });
    try {
      const response = await fetch("/api/admin/ai/visual-image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ opId, seed, provider, item: { prompt: card.prompt, negative: item.negative, aspect: item.aspect }, mode: card.choice === "reference" ? "reference" : "text", reference, options: card.refOptions, format: card.refFormat }),
      });
      const data = await readJson(response);
      if (!response.ok || !data.candidate?.image) throw new Error(data.error || "Görsel üretilemedi.");
      const { image, ...meta } = data.candidate;
      await putCandidate(meta.id, image);
      setImages((current) => ({ ...current, [meta.id]: image }));
      patchCard(item.id, (current) => ({ status: "done", error: "", retryOpId: null, retrySeed: null, candidates: [...current.candidates.filter((candidate) => candidate.id !== meta.id), { ...meta, origin: "ai", createdAt: Date.now() }] }));
    } catch (error) {
      if (controller.signal.aborted) patchCard(item.id, { status: "cancelled", error: "" });
      else patchCard(item.id, { status: "failed", error: `${offline(error)} Taslağın etkilenmedi.` });
    } finally {
      controllers.current.delete(item.id);
    }
  };

  const generateBatch = async () => {
    // Sıra ile: tüm kartlar aynı anda üretilmez (kota ve hız sınırı korunur).
    for (const item of plan.items) {
      const card = cardsRef.current[item.id];
      if (card?.include && (card.choice === "ai" || card.choice === "reference")) await generate(item);
    }
  };

  const pickSource = (item, image) => {
    const id = `src_${btoa(unescape(encodeURIComponent(image.src))).replace(/[^A-Za-z0-9]/g, "").slice(-24)}`;
    patchCard(item.id, (current) => {
      if (current.choice === "reference") return { sourcePick: current.sourcePick === image.src ? null : image.src, referenceUpload: null };
      const exists = current.candidates.some((candidate) => candidate.id === id);
      return {
        sourcePick: image.src,
        alt: current.alt || image.alt || "",
        candidates: exists ? current.candidates : [...current.candidates, { id, origin: "source", src: image.src, sourceAlt: image.alt, createdAt: Date.now() }],
        selected: id,
      };
    });
  };

  const addUpload = async (item, file, { asReference = false } = {}) => {
    if (!file) return;
    try {
      const small = await resizeForAnalysis(file, { maxEdge: 1600, quality: 0.86 });
      const dataUrl = await fileToDataUrl(small);
      const id = `${asReference ? "ref" : "up"}_${newOpId()}`;
      await putCandidate(id, dataUrl);
      setImages((current) => ({ ...current, [id]: dataUrl }));
      if (asReference) patchCard(item.id, { referenceUpload: id, sourcePick: null, licenseOk: false });
      else patchCard(item.id, (current) => ({ candidates: [...current.candidates, { id, origin: "upload", createdAt: Date.now() }], selected: id }));
    } catch (error) {
      patchCard(item.id, { error: offline(error) });
    }
  };

  const selectedItems = plan ? plan.items.filter((item) => cards[item.id]?.selected && !cards[item.id]?.inserted) : [];
  const missingAlt = selectedItems.filter((item) => !cards[item.id].alt.trim()).length;
  const missingLicense = selectedItems.filter((item) => {
    const card = cards[item.id];
    const candidate = card.candidates.find((entry) => entry.id === card.selected);
    return candidate?.origin === "source" && !card.licenseOk;
  }).length;
  const runningCount = Object.values(cards).filter((card) => card.status === "running").length;
  // Filigranlı ya da ticari şartı doğrulanmamış aday seçildiyse ekleme açık onay ister.
  const riskySelected = selectedItems.filter((item) => isRiskyCandidate(cards[item.id].candidates.find((entry) => entry.id === cards[item.id].selected))).length;
  const riskBlocked = riskySelected > 0 && !acceptRisk;
  const readyProviders = providers.filter((provider) => provider.ready).length;

  const insertSelected = async () => {
    if (inserting || selectedItems.length === 0 || missingAlt || missingLicense || riskBlocked) return;
    setInserting(true);
    setNotice("");
    const picks = [];
    for (const item of selectedItems) {
      const card = cardsRef.current[item.id];
      const candidate = card.candidates.find((entry) => entry.id === card.selected);
      try {
        let media = card.uploaded?.[candidate.id] ?? null;
        if (!media && candidate.origin === "source") {
          const response = await fetch("/api/admin/ai/import-image", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ src: candidate.src, alt: card.alt, licenseConfirmed: true }) });
          const data = await readJson(response);
          if (!response.ok) throw new Error(data.error || "Kaynak görseli aktarılamadı.");
          media = data.media;
        } else if (!media) {
          const dataUrl = images[candidate.id] ?? (await getCandidate(candidate.id));
          if (!dataUrl) throw new Error("Görsel verisi bulunamadı; yeniden üret.");
          const caption = candidate.origin === "ai" ? `AI: ${candidate.providerLabel} · ${candidate.modelLabel ?? "model bilinmiyor"}` : "";
          media = await uploadMedia(dataUrlToFile(dataUrl, `${item.id}.webp`), null, { alt: card.alt, caption });
        }
        patchCard(item.id, (current) => ({ uploaded: { ...current.uploaded, [candidate.id]: media }, error: "" }));
        picks.push({ itemId: item.id, target: card.target, media, alt: card.alt, caption: card.caption });
      } catch (error) {
        patchCard(item.id, { error: offline(error) });
      }
    }
    if (picks.length) {
      const result = onInsert(picks);
      const unplaced = new Set(result.unplaced.map((pick) => pick.itemId));
      for (const pick of picks) patchCard(pick.itemId, unplaced.has(pick.itemId) ? { targetMissing: true } : { inserted: true, targetMissing: false });
      setNotice(`${result.placed + (result.cover ? 1 : 0)} görsel taslağa eklendi.${unplaced.size ? ` ${unplaced.size} görselin hedef bölümü bulunamadı; bölüm seçip yeniden ekle.` : ""} Editörde “Geri al” ile kaldırabilirsin; yazı kaydedilene kadar yayın değişmez.`);
    }
    setInserting(false);
  };

  const close = () => {
    if (runningCount && !window.confirm("Görsel üretimi sürüyor. Kapatırsan bekleyen istekler iptal edilir; tamamlananlar bu tarayıcıda saklı kalır. Kapatılsın mı?")) return;
    for (const controller of controllers.current.values()) controller.abort();
    onClose();
  };

  const summary = planMeta?.sourceSummary ?? (source ? { url: source.url, title: source.title, wordCount: source.wordCount, images: source.images.length, truncated: source.truncated } : null);
  const canReference = providers.some((provider) => provider.ready && provider.imageToImage);

  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="visual-title" onCancel={(event) => { event.preventDefault(); if (zoom) setZoom(null); else close(); }}>
      <div className={styles.shell}>
        <header className={styles.head}>
          <div className={styles.headRow}>
            <h2 id="visual-title" className={styles.title}>AI Görselleri</h2>
            <button type="button" className={styles.iconButton} aria-label="Görsel stüdyosunu kapat" onClick={close}>
              <X size={18} />
            </button>
          </div>
          <p className={styles.postTitle}>{title || "Başlıksız yazı"}</p>
        </header>

        <div className={styles.body}>
          <section className={styles.source} aria-label="Kaynak ve analiz">
            {summary ? (
              <p className={styles.sourceLine}>
                Kaynak:{" "}
                <a href={summary.url} target="_blank" rel="noopener noreferrer">{summary.title || summary.url}</a>
                <span className={styles.meta}>{summary.wordCount ? `${summary.wordCount} sözcük` : ""}{summary.images ? ` · ${summary.images} görsel` : ""}{summary.truncated ? " · kısmen okundu" : ""}</span>
              </p>
            ) : (
              <div className={styles.label}>
                Kaynak bağlantısı (isteğe bağlı)
                <div className={styles.inline}>
                  <input className={styles.input} type="url" inputMode="url" placeholder="https://…" value={urlInput} onChange={(event) => setUrlInput(event.target.value)} />
                </div>
                <span className={styles.meta}>Kaynak yoksa plan yalnızca taslağın bölümlerinden hazırlanır.</span>
              </div>
            )}
            {planMeta ? (
              <p className={styles.meta}>
                Plan: {plan.items.length} görsel önerisi · {planMeta.provider === "gemini" ? "Gemini" : planMeta.provider} {planMeta.model ? `(${planMeta.model})` : ""}
              </p>
            ) : null}
            <div className={styles.actions}>
              {plan ? (
                <button type="button" className={styles.secondary} disabled={planState.status === "loading"} onClick={() => requestPlan({ fresh: true })}>
                  {planState.status === "loading" ? <LoaderCircle size={16} className={styles.spin} aria-hidden="true" /> : <Wand2 size={16} aria-hidden="true" />}
                  Görsel planını yeniden analiz et
                </button>
              ) : null}
            </div>
            <details className={styles.more}>
              <summary>Gelişmiş</summary>
              <a className={styles.link} href={ARENA_COMPARE_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={15} aria-hidden="true" /> Arena.ai&apos;de modelleri manuel karşılaştır
              </a>
              <p className={styles.meta}>Yalnızca bilgi amaçlı. Arena.ai kullanım şartları otomatik erişimi ve çıktının ticari kullanımını yasaklar; blog akışına bağlanmaz.</p>
            </details>
          </section>

          {providers.length > 0 && readyProviders === 0 ? (
            <p className={styles.notice} role="status">Şu anda kullanılabilir ücretsiz görsel üretim servisi yok (anahtar eksik, limit dolu ya da ücret onayı bekliyor). Kaynak görselini ya da kendi görselini kullanabilirsin; ücretli servise geçilmez.</p>
          ) : null}
          {!plan ? (
            <div className={styles.empty}>
              <p>Taslağın bölümlerine ve kaynağa göre hangi bölümde hangi görselin gerektiği belirlenir. Hiçbir görsel siz seçmeden taslağa eklenmez.</p>
              <button type="button" className={styles.primary} disabled={planState.status === "loading"} onClick={() => requestPlan()}>
                {planState.status === "loading" ? <LoaderCircle size={16} className={styles.spin} aria-hidden="true" /> : <ImagePlus size={16} aria-hidden="true" />}
                {planState.status === "loading" ? "Bölümler inceleniyor…" : "Görsel planını hazırla"}
              </button>
              {planState.status === "loading" ? <p className={styles.meta} role="status">Bu adım genellikle 10–40 saniye sürer. Pencereyi kapatsan da plan hazırlanırsa yeniden açtığında görünür.</p> : null}
            </div>
          ) : null}
          {planState.error ? <p className={styles.errorBox} role="alert">{planState.error}</p> : null}

          {plan ? (
            <>
              <ul className={styles.cards}>
                {plan.items.map((item) =>
                  cards[item.id] ? (
                    <VisualCard
                      key={item.id}
                      item={item}
                      card={cards[item.id]}
                      images={images}
                      sections={sections}
                      sourceImages={source?.images ?? []}
                      title={title}
                      providers={providers}
                      canReference={canReference}
                      onPatch={(patch) => {
                        // Reddedilen adayın görüntü verisi tarayıcı deposundan silinir.
                        for (const id of patch.rejected ?? []) if (!cards[item.id].rejected.includes(id)) deleteCandidate(id);
                        patchCard(item.id, patch);
                      }}
                      onGenerate={(options) => generate(item, options)}
                      onCancel={() => controllers.current.get(item.id)?.abort()}
                      onPickSource={(image) => pickSource(item, image)}
                      onUpload={(file) => addUpload(item, file)}
                      onReferenceUpload={(file) => addUpload(item, file, { asReference: true })}
                      onZoom={setZoom}
                    />
                  ) : null
                )}
              </ul>
              {plan.skipped?.length ? (
                <div className={styles.skipped}>
                  <strong>Görsel önerilmeyen bölümler:</strong>
                  <ul>
                    {plan.skipped.map((entry) => (
                      <li key={entry.sectionId}>{entry.heading} — {entry.reason}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        {plan ? (
          <footer className={styles.foot}>
            <p className={styles.footInfo} role="status" aria-live="polite">
              {notice || `${selectedItems.length} görsel seçildi${runningCount ? ` · ${runningCount} üretiliyor` : ""}${missingAlt ? ` · ${missingAlt} görselin alt metni eksik` : ""}${missingLicense ? ` · ${missingLicense} kaynak görselinin kullanım hakkı onaylanmadı` : ""}`}
            </p>
            {riskySelected ? (
              <label className={styles.check}>
                <input type="checkbox" checked={acceptRisk} onChange={(event) => setAcceptRisk(event.target.checked)} />
                <span>{riskySelected} görsel filigranlı ve ticari kullanım şartı doğrulanmamış (Pollinations). Bilerek ekliyorum.</span>
              </label>
            ) : null}
            <div className={styles.footActions}>
              <button type="button" className={styles.secondary} disabled={runningCount > 0} onClick={generateBatch}>
                Seçili kartlar için üret
              </button>
              <button type="button" className={styles.primary} disabled={inserting || selectedItems.length === 0 || missingAlt > 0 || missingLicense > 0 || riskBlocked} onClick={insertSelected}>
                {inserting ? <LoaderCircle size={16} className={styles.spin} aria-hidden="true" /> : null}
                Seçili görselleri taslağa ekle
              </button>
            </div>
          </footer>
        ) : null}
      </div>

      {zoom ? (
        <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label="Görsel önizleme">
          <div className={styles.lightboxBar}>
            <span>{zoom.label}</span>
            <button type="button" className={styles.iconButton} aria-label="Önizlemeyi kapat" autoFocus onClick={() => setZoom(null)}>
              <X size={18} />
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom.src} alt={zoom.label} referrerPolicy="no-referrer" />
        </div>
      ) : null}
    </dialog>
  );
}
