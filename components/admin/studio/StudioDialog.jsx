"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleAlert, ClipboardPaste, ImagePlus, LoaderCircle, MinusCircle, RefreshCw, Wand2, X } from "lucide-react";
import { contentHeadings } from "@/lib/blog/blocks/model";
import { placeImages } from "@/lib/blog/blocks/placeImages";
import { TEMPLATES, templateByKey } from "@/lib/blog/blocks/templates";
import { titleSimilarity } from "@/lib/ai/similarity";
import { pickTemplate } from "@/lib/ai/templatePick";
import ImageStep from "./ImageStep";
import SimilarityStep from "./SimilarityStep";
import { STAGE_STATUS_TEXT, ShotsPanel, analyzeScreenshots, streamSource } from "./SourceStep";
import styles from "./studio.module.css";
import { autoTarget, normalizeUrl } from "./studioInput";
import { saveSourceContext } from "@/lib/blog/sourceContext";

const CURRENT = "__current";
const TIMEOUT_MS = 80_000;
const MAX_EXPAND_ROUNDS = 2;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const PRESET_WORDS = { short: 600, medium: 1000, long: 1500 };
const PROVIDER_NAMES = { local: "Yerel okuyucu", jina: "Jina Reader", firecrawl: "Firecrawl", browser: "Tarayıcı okuyucusu" };
const STRONG = new Set(["very_high", "high", "medium"]);

// Kaynak okuma yöntemleri. "auto" önerilir: önce ücretsiz okuyucular, gerekirse
// alternatife geçilir. Okuyucuların bu sunucuda kullanılabilirliği sunucudan gelir.
const METHODS = [
  { key: "auto", label: "Otomatik (önerilen)", note: "Önce yerel okuyucu; yetersizse sırayla alternatif okuyucular denenir." },
  { key: "local", label: "Yerel okuyucu", note: "Sayfayı doğrudan okur; hızlı ve ücretsiz." },
  { key: "jina", label: "Jina Reader", note: "Ücretsiz okuma servisi; menü ve reklamları ayıklar." },
  { key: "firecrawl", label: "Firecrawl", note: "Zor sayfalar için; kredi tüketir." },
  { key: "browser", label: "JavaScript destekli tarayıcı (Playwright)", note: "İçeriği JavaScript ile yüklenen sayfalar için." },
  { key: "screenshots", label: "Ekran görüntüsü yükle", note: "Sayfa okunamıyorsa görüntülerden metin çıkarılır." },
  { key: "text", label: "Metin veya not yapıştır", note: "Makale metnini ya da notlarını doğrudan kullan." },
];
const READERS = new Set(["local", "jina", "firecrawl", "browser"]);

// Her aşama gerçek bir işleme bağlıdır; henüz yapılmayan iş tamamlandı görünmez.
const STAGES = [
  ["read", "Kaynak sayfa okunuyor"],
  ["structure", "İçerik yapısı çıkarılıyor"],
  ["archive", "Blog arşiviyle karşılaştırılıyor"],
  ["plan", "İçerik planı hazırlanıyor"],
  ["draft", "Taslak oluşturuluyor"],
];
const idleStages = () => Object.fromEntries(STAGES.map(([key]) => [key, { status: "pending", detail: "" }]));

const GOAL_OPTIONS = [
  ["inform", "Bilgilendirme"],
  ["guide", "Uygulamalı rehber"],
  ["service", "Hizmet tanıtımı ve iletişim"],
  ["compare", "Karar vermeye yardım"],
];
const TONE_OPTIONS = [
  ["friendly", "Samimi ve profesyonel"],
  ["corporate", "Kurumsal"],
  ["technical", "Teknik"],
  ["simple", "Sade"],
];
const LENGTH_OPTIONS = [
  ["auto", "Kaynağa göre (önerilen)"],
  ["short", "Kısa (~600 sözcük)"],
  ["medium", "Orta (~1000 sözcük)"],
  ["long", "Uzun (~1500 sözcük)"],
];
const DEFAULT_BRIEF = { topic: "", keyword: "", audience: "", goal: "inform", tone: "friendly", cta: "", length: "auto" };

const countWords = (text) => (String(text ?? "").match(/[\p{L}\p{N}]+/gu) ?? []).length;
const outlineOf = (text) => (String(text ?? "").match(/^#{2,3}\s+.+$/gm) ?? []).map((line) => line.replace(/^#+\s+/, "").trim());
const hrefsIn = (blocks) => [...new Set((JSON.stringify(blocks).match(/"href":"([^"]+)"/g) ?? []).map((match) => match.slice(8, -1)))];

function lengthHint(length, min, max) {
  if (length > max) return { text: `${length} karakter · önerilen en fazla ${max}`, warn: true };
  if (length < min) return { text: `${length} karakter · önerilen en az ${min}`, warn: true };
  return { text: `${length} karakter · uygun`, warn: false };
}

// --- Tarayıcıda yarım kalan çalışma (yalnızca bu tarayıcıda; kişisel kolaylık) ---
const sessionKey = (postId) => `persona-studio:${postId ?? "new"}`;
function loadSession(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!value || Date.now() - value.updatedAt > SESSION_TTL_MS) return null;
    return value;
  } catch {
    return null;
  }
}
function saveSession(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...value, updatedAt: Date.now() }));
  } catch {
    // Depolama kapalı ya da dolu: çalışma yalnızca bu sayfa açıkken korunur.
  }
}
function clearSession(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // yok sayılır
  }
}

// Taslağa ilişkin uyarılar: stüdyonun inceleme ekranı ve editördeki not paneli ortak kullanır.
export function draftNotes(result, placed, archiveMatches = []) {
  const { fields, stats, warnings = [], sources = [] } = result;
  const unreadable = sources.flatMap((source) => source.unreadable ?? []);
  return [
    ...warnings,
    ...(stats.unfilled ? [`${stats.unfilled} bölüm şablondaki haliyle kaldı; yayınlamadan önce doldurulmalı.`] : []),
    ...(stats.dropped ? [`Kaynakta dayanağı olmayan ${stats.dropped} alıntı/istatistik bloğu çıkarıldı.`] : []),
    ...(placed?.leftover ? [`${placed.leftover} görsel için uygun bölüm bulunamadı; editörde elle ekleyebilirsiniz.`] : []),
    ...sources
      .filter((source) => source.truncated)
      .map((source) => `“${source.title || source.url || "Kaynak"}” uzun olduğu için tamamı işlenmedi${source.missingFrom ? `; “${source.missingFrom}” bölümünden sonrası taslağa yansımadı` : ""}.`),
    ...archiveMatches
      .filter((match) => titleSimilarity(fields.title, match.title) >= 0.6)
      .map((match) => `Önerilen başlık arşivdeki “${match.title}” yazısının başlığına çok benziyor; ayırt edici bir başlık düşünün.`),
    ...(unreadable.length ? [`Ekran görüntülerinde okunamayan kısımlar: ${unreadable.join("; ")}`] : []),
  ];
}

function archiveDetail(compare) {
  const { archive, matches } = compare;
  const scanned = archive ? `${archive.scanned} yazı tarandı${archive.limited ? ` (toplam ${archive.total}; tamamı taranamadı)` : ""}` : "";
  const found = matches.length ? `${matches.length} benzer yazı (${matches[0].label.toLocaleLowerCase("tr-TR")})` : "belirgin benzerlik yok";
  return [scanned, found].filter(Boolean).join(" · ");
}

// AI Blog Stüdyosu — mobil öncelikli tek adımlı akış:
// link → (otomatik) okuma → yapı → arşiv karşılaştırması → şablon ve plan → taslak.
// Yalnızca belirgin benzerlik varsa kullanıcı kararı beklenir. Hiçbir adım
// yazıyı kaydetmez ya da yayımlamaz; editör boşsa taslak doğrudan editöre
// aktarılır (tek "Geri al" adımı), doluysa açık onay istenir.
export default function StudioDialog({
  postId,
  templateKey,
  getBlocks,
  canReplaceSilently = () => false,
  onApply,
  onApplyImages,
  onClose,
  initialPhase = "start",
  imageSource = null,
}) {
  const dialogRef = useRef(null);
  const shotsRef = useRef(null);
  const notesRef = useRef(null);
  const runRef = useRef(null);
  // Açılış anının görüntüsü: akış sürerken editör değişse de karar değişmez.
  const [editorBlocks] = useState(() => getBlocks());
  const [silent] = useState(() => canReplaceSilently());
  const key = sessionKey(postId);

  const [saved, setSaved] = useState(() => (initialPhase === "start" ? loadSession(key) : null));
  const [phase, setPhase] = useState(initialPhase); // start | run | decide | review | images
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [showAlt, setShowAlt] = useState(false);
  const [shots, setShots] = useState({ items: [], status: "idle", source: null, error: "" });
  const [brief, setBrief] = useState(DEFAULT_BRIEF);
  const [templateChoice, setTemplateChoice] = useState(() => (silent ? (templateKey ?? "auto") : editorBlocks.length ? CURRENT : "auto"));
  const [stages, setStages] = useState(idleStages);
  const [stageError, setStageError] = useState(null);
  const [running, setRunning] = useState(false);
  const [similar, setSimilar] = useState({ status: "idle", key: "", result: null, error: "", decision: null, selectedId: null, update: null });
  const [plan, setPlan] = useState(null);
  const [draft, setDraft] = useState({ status: "idle", result: null, error: "" });
  const [pool, setPool] = useState([]);
  const [coverId, setCoverId] = useState(null);
  const [pasteHint, setPasteHint] = useState("");
  const [inputError, setInputError] = useState("");
  // Ekranda gösterilen girdi ve okunan kaynaklar (önbelleğin render'a yansıyan kopyası).
  const [view, setView] = useState({ input: null, read: null, shots: null });
  const [focusNotes, setFocusNotes] = useState(false);
  const [method, setMethod] = useState("auto");
  const [readers, setReaders] = useState(null); // sunucudaki okuyucu desteği
  const [methodOpen, setMethodOpen] = useState(false);

  // Bu sunucuda hangi okuyucuların kullanılabildiği (ör. Vercel'de tarayıcı yok).
  useEffect(() => {
    if (initialPhase !== "start") return;
    let cancelled = false;
    fetch("/api/admin/ai/source", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data?.providers) setReaders(Object.fromEntries(data.providers.map((item) => [item.key, item])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialPhase]);

  // "Metin veya ekran görüntüsü ekle" seçilince metin alanı oluştuktan sonra odaklanır.
  useEffect(() => {
    if (!focusNotes || phase !== "start" || !showAlt) return;
    notesRef.current?.focus();
    // Odak isteği bir kez işlenir.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFocusNotes(false);
  }, [focusNotes, phase, showAlt]);

  // Önbellek: tekrar denemede tamamlanmış aşamalar (okuma, karşılaştırma) yeniden çalışmaz.
  const cache = useRef({ source: null, shots: null, compare: null });
  const decisionRef = useRef({ decision: null, selectedId: null, skipArchive: false });
  const inputRef = useRef({ url: "", notes: "", brief: DEFAULT_BRIEF, templateChoice: "auto" });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();
    const items = shots.items;
    return () => {
      runRef.current?.abort();
      for (const item of items) URL.revokeObjectURL(item.preview);
    };
    // Önizleme adresleri yalnızca kapanışta serbest bırakılır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setStage = (name, status, detail) =>
    setStages((current) => ({ ...current, [name]: { status, detail: detail ?? current[name].detail } }));

  const persist = (extra = {}) =>
    saveSession(key, {
      ...inputRef.current,
      source: cache.current.source,
      shots: cache.current.shots,
      compare: cache.current.compare,
      decision: decisionRef.current,
      ...extra,
    });

  const chosenTemplate = plan?.key ? templateByKey(plan.key) : null;
  const urlSource = view.read ?? imageSource ?? null;
  const archiveMatches = similar.result?.matches ?? [];

  const close = () => {
    if (running && !window.confirm("İşlem durdurulsun mu? Linkin, notların ve tamamlanan aşamalar bu tarayıcıda saklanır; sonra kaldığın yerden devam edebilirsin.")) return;
    runRef.current?.abort();
    onClose();
  };

  // --- Taslak ---------------------------------------------------------------------
  const postTemplate = async (body, signal) => {
    const response = await fetch("/api/admin/ai/template", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Taslak oluşturulamadı.");
    return data;
  };

  // İlk taslak hedefin %90'ının altında kalırsa en fazla iki tur, yalnızca kısa
  // kalan bölümler genişletilir. Her tur ayrı bir istektir; sonsuz deneme yok.
  const generate = async ({ sources, topic, compare, chosen, input, signal }) => {
    const matches = compare?.matches ?? [];
    const { decision, selectedId } = decisionRef.current;
    const related = matches.map((match) => ({ title: match.title, covered: match.overlapping, gaps: match.missing, focus: decision === "angle" && match.id === selectedId }));
    const base = { ...input.brief, topic, templateKey: chosen.current ? templateKey ?? null : chosen.key, sources, related, angle: decision === "angle" };
    setStage("draft", "active", "Bölümler yazılıyor… (genellikle 20–45 saniye)");
    let result = await postTemplate(
      { ...base, postId, blocks: chosen.current ? editorBlocks : [], images: pool.map((item) => ({ id: item.media.id, alt: item.alt, section: item.section ?? "" })) },
      signal
    );
    const rounds = [{ words: result.stats.words }];
    const missingTopics = (result.coverage?.items ?? []).filter((item) => !item.covered).map((item) => item.topic);
    for (let round = 1; round <= MAX_EXPAND_ROUNDS && result.stats.words < result.stats.targetWords * 0.9; round += 1) {
      setStage("draft", "active", `Taslak ${result.stats.words} sözcük (hedef ≈${result.stats.targetWords}); kısa kalan bölümler genişletiliyor (${round}/${MAX_EXPAND_ROUNDS})…`);
      const expanded = await postTemplate(
        { ...base, mode: "expand", blocks: result.blocks, targetWords: result.stats.targetWords, missingTopics, links: hrefsIn(result.blocks).map((href) => ({ href, label: href })) },
        signal
      );
      // Uzayan metin her zaman benimsenir; artış %3'ün altındaysa turlar durur.
      if (!expanded.stats.expanded || expanded.stats.words <= result.stats.words) break;
      const gain = expanded.stats.words / result.stats.words;
      rounds.push({ words: expanded.stats.words });
      const kept = result.warnings.filter((warning) => !/^Taslak \d+ sözcük|aynen örtüşüyor|birden fazla geçiyor|Kaynakta geçmeyen/.test(warning));
      result = { ...result, blocks: expanded.blocks, stats: { ...result.stats, words: expanded.stats.words }, warnings: [...expanded.warnings, ...kept] };
      if (gain < 1.03) break;
    }
    return { ...result, rounds, template: chosen };
  };

  // --- Akış -------------------------------------------------------------------------
  const run = async (input) => {
    inputRef.current = input;
    runRef.current?.abort();
    const controller = new AbortController();
    runRef.current = controller;
    const { signal } = controller;
    let current = "read";
    const timer = { id: null };
    const fail = (stage, message, actions) => {
      setRunning(false);
      // Ayrıntılı mesaj aşağıdaki hata kutusundadır; satırda tekrarlanmaz.
      setStage(stage, "error", "Tamamlanamadı");
      setStageError({ stage, message, actions });
      persist();
    };

    setPhase("run");
    setStageError(null);
    setRunning(true);
    setView({ input, read: cache.current.source?.source ?? null, shots: cache.current.shots ?? null });
    setDraft({ status: "idle", result: null, error: "" });
    setStages(idleStages());
    persist();

    try {
      // 1. Kaynak
      const readMethod = input.method ?? "auto";
      // Ekran görüntüsü ya da metin seçildiyse link okunmaz; seçilen girdi kullanılır.
      const link = READERS.has(readMethod) || readMethod === "auto" ? normalizeUrl(input.url) : "";
      if (link === null) return fail("read", "Bu bir web adresi gibi görünmüyor. Linki kontrol edip yeniden dene.", ["edit"]);
      let read = null;
      if (link) {
        const provider = READERS.has(readMethod) ? readMethod : "auto";
        const cached = cache.current.source;
        if (cached?.url === link && (provider === "auto" || cached.source.provider === provider)) {
          read = cached.source;
          setStage("read", "done", `${PROVIDER_NAMES[read.provider] ?? read.provider} ile okundu (önceki sonuç kullanıldı)`);
        } else {
          let tried = 0;
          setStage("read", "active", provider === "auto" ? "Kaynak sayfa okunuyor…" : `${PROVIDER_NAMES[provider]} ile okunuyor…`);
          const outcome = await streamSource(link, {
            signal,
            provider,
            onStage: (event) => {
              // Yalnızca gerçekten başlatılan okuyucular gösterilir; atlananlar ayrıntıda kalır.
              if (event.status !== "start") return;
              tried += 1;
              setStage("read", "active", tried === 1 ? (provider === "auto" ? "Kaynak sayfa okunuyor…" : `${event.label} ile okunuyor…`) : `Alternatif okuyucu deneniyor: ${event.label}…`);
            },
          });
          if (!outcome.source) {
            const detail = (outcome.attempts ?? []).filter((item) => item.status !== "skipped").map((item) => `${item.label}: ${STAGE_STATUS_TEXT[item.status]}`).join(" · ");
            const message = `${outcome.fallback || outcome.error || "Kaynak okunamadı."}${detail ? ` (${detail})` : ""}`;
            return fail("read", message, provider === "auto" ? ["alt", "retry"] : ["autoFallback", "alt"]);
          }
          read = outcome.source;
          cache.current.source = { url: link, source: read };
          setView((value) => ({ ...value, read }));
          const earlier = (outcome.attempts ?? []).filter((item) => item.stage !== read.provider && item.status !== "skipped").map((item) => `${item.label}: ${STAGE_STATUS_TEXT[item.status]}`);
          setStage("read", "done", `${PROVIDER_NAMES[read.provider] ?? read.provider} ile ${read.wordCount} sözcük okundu${earlier.length ? ` · önce denenen: ${earlier.join(", ")}` : ""}`);
        }
      }

      let shotSource = cache.current.shots;
      if (!shotSource && shots.status === "ready") shotSource = shots.source;
      if (!shotSource && shots.items.length) {
        setStage("read", "active", "Ekran görüntüleri okunuyor…");
        try {
          shotSource = await analyzeScreenshots(shots.items, { signal });
          setShots((value) => ({ ...value, status: "ready", source: shotSource }));
        } catch (failure) {
          if (signal.aborted) throw failure;
          return fail("read", failure.message, ["alt", "retry"]);
        }
      }
      cache.current.shots = shotSource ?? null;
      setView((value) => ({ ...value, shots: shotSource ?? null }));
      const textSource = input.notes.trim().length >= 40 ? { kind: "text", title: "Kullanıcı notu", text: input.notes.trim() } : null;
      const sources = [read, shotSource, textSource].filter(Boolean);
      const topic = input.brief.topic.trim() || read?.title || shotSource?.title || "";
      if (!sources.length && topic.length < 3) {
        return fail("read", "Başlamak için bir link, birkaç cümlelik bir not ya da bir konu gerekli.", ["edit"]);
      }
      if (!link) {
        setStage(
          "read",
          sources.length ? "done" : "skipped",
          [
            input.url.trim() ? "Seçilen yönteme göre link okunmadı" : "",
            shotSource ? `ekran görüntülerinden ${shotSource.wordCount} sözcük okundu` : textSource ? "notun kaynak olarak kullanılacak" : "yalnızca konu kullanılacak",
          ]
            .filter(Boolean)
            .join("; ")
            .replace(/^./, (char) => char.toLocaleUpperCase("tr-TR"))
        );
      }

      // 2. Yapı
      current = "structure";
      const main = read ?? shotSource ?? textSource;
      if (main) {
        const headings = outlineOf(main.text);
        setStage(
          "structure",
          "done",
          [`${main.wordCount ?? countWords(main.text)} sözcük`, `${headings.length} alt başlık`, read?.images?.length ? `${read.images.length} kaynak görseli` : "", read?.truncated ? "uzun kaynak: bir kısmı işlenecek" : ""]
            .filter(Boolean)
            .join(" · ")
        );
      } else {
        setStage("structure", "skipped", "Kaynak yok; yalnızca konu kullanılacak");
      }

      // 3. Arşiv
      current = "archive";
      let compare = null;
      if (main && !decisionRef.current.skipArchive) {
        const compareKey = `${main.kind}:${main.title}:${main.text.length}`;
        if (cache.current.compare?.key === compareKey) {
          compare = cache.current.compare.result;
        } else {
          setStage("archive", "active", "Kaynağın konusu ve arama niyeti çıkarılıyor, arşiv taranıyor…");
          const response = await fetch("/api/admin/ai/similar", {
            method: "POST",
            headers: { "content-type": "application/json" },
            signal,
            body: JSON.stringify({ source: { kind: main.kind, title: main.title, text: main.text, wordCount: main.wordCount } }),
          }).catch((failure) => {
            if (signal.aborted) throw failure;
            return null;
          });
          const data = response ? await response.json().catch(() => ({})) : {};
          if (!response || !response.ok) {
            return fail("archive", response ? data.error || "Arşiv karşılaştırması yapılamadı." : "Sunucuya ulaşılamadı. Bağlantını kontrol et.", ["retry", "skipArchive"]);
          }
          compare = data;
          cache.current.compare = { key: compareKey, result: compare };
        }
        if (compare.status === "insufficient") return fail("archive", compare.message, ["alt", "skipArchive"]);
        setSimilar((value) => ({ ...value, status: "ready", key: cache.current.compare.key, result: compare, selectedId: value.selectedId ?? compare.matches[0]?.id ?? null }));
        setStage("archive", "done", archiveDetail(compare));
        persist();
        const needsDecision = compare.matches.some((match) => STRONG.has(match.category));
        if (needsDecision && !["new", "angle"].includes(decisionRef.current.decision)) {
          setRunning(false);
          setPhase("decide");
          return;
        }
      } else {
        setStage("archive", "skipped", main ? "Karşılaştırma atlandı" : "Karşılaştırılacak kaynak yok");
      }

      // 4. Plan (şablon otomatik; kullanıcı Ayrıntılar'dan seçtiyse o)
      current = "plan";
      let chosen;
      if (input.templateChoice === CURRENT) {
        chosen = { key: null, current: true, label: "Editördeki yapı", reason: "Editördeki mevcut yapı korunuyor.", by: "user" };
      } else if (input.templateChoice !== "auto" && templateByKey(input.templateChoice)) {
        chosen = { key: input.templateChoice, label: templateByKey(input.templateChoice).label, reason: "Senin seçimin.", by: "user" };
      } else {
        const pick = pickTemplate(
          { format: compare?.profile?.format, title: compare?.profile?.titleTr || main?.title || topic, headings: outlineOf(main?.text), text: main?.text },
          TEMPLATES
        );
        chosen = { ...pick, label: templateByKey(pick.key).label };
      }
      setPlan(chosen);
      const target = input.brief.length === "auto" ? autoTarget(sources) : PRESET_WORDS[input.brief.length];
      setStage("plan", "done", `Şablon: ${chosen.label} · hedef ≈${target} sözcük${decisionRef.current.decision === "angle" ? " · farklı açı" : ""}`);

      // 5. Taslak
      current = "draft";
      timer.id = setTimeout(() => controller.abort("timeout"), TIMEOUT_MS * (MAX_EXPAND_ROUNDS + 1));
      const result = await generate({ sources, topic, compare, chosen, input, signal });
      setStage("draft", "done", `${result.stats.words} sözcük hazır (hedef ≈${result.stats.targetWords})`);
      setDraft({ status: "ready", result, error: "" });
      setRunning(false);
      persist({ plan: chosen, draft: result });

      // Editör boşsa doğrudan editöre; değilse inceleme ve açık onay.
      if (silent && pool.length === 0) {
        finish(result, chosen);
      } else {
        setPhase("review");
      }
    } catch (failure) {
      setRunning(false);
      if (signal.aborted) {
        const timeout = signal.reason === "timeout";
        setStage(current, "error", timeout ? "Yapay zekâ zamanında yanıt vermedi." : "Durduruldu");
        setStageError({
          stage: current,
          message: timeout ? "Yapay zekâ zamanında yanıt vermedi. Tamamlanan aşamalar korunuyor; yeniden denediğinde kaldığı yerden sürer." : "İşlem durduruldu. Tamamlanan aşamalar korunuyor.",
          actions: ["retry"],
        });
        persist();
        return;
      }
      fail(current, failure instanceof TypeError ? "Sunucuya ulaşılamadı. Bağlantını kontrol et." : failure.message, ["retry"]);
    } finally {
      clearTimeout(timer.id);
    }
  };

  const placed = useMemo(
    () => (draft.result ? placeImages(draft.result.blocks, pool, { coverId, placements: draft.result.imagePlacements }) : null),
    [draft.result, pool, coverId]
  );
  const missingAlt = pool.filter((item) => !item.alt.trim()).length;

  const finish = (result = draft.result, chosen = plan) => {
    const placement = placeImages(result.blocks, pool, { coverId, placements: result.imagePlacements });
    const read = cache.current.source?.source ?? null;
    onApply({
      blocks: placement.blocks,
      fields: result.fields,
      cover: placement.cover,
      templateKey: chosen?.key ?? null,
      notes: {
        words: result.stats.words,
        targetWords: result.stats.targetWords,
        auto: result.stats.auto,
        expansions: (result.rounds?.length ?? 1) - 1,
        template: chosen?.label ?? "",
        templateReason: chosen?.reason ?? "",
        warnings: draftNotes(result, placement, cache.current.compare?.result?.matches ?? []),
        coverage: result.coverage ? { covered: result.coverage.covered, total: result.coverage.total, missing: result.coverage.items.filter((item) => !item.covered).map((item) => item.topic) } : null,
        imageSource: read?.images?.length ? { title: read.title, url: read.url, images: read.images } : null,
        placedImages: placement.placed,
      },
    });
    // Kaynak bağlamı taslağa bağlı saklanır: AI Görselleri aşamasında URL
    // yeniden sorulmaz, makale yeniden indirilmez.
    if (read) saveSourceContext(postId, { ...read, url: read.url ?? cache.current.source?.url });
    clearSession(key);
    onClose();
  };

  // --- Girdi ------------------------------------------------------------------------
  const submit = (event) => {
    event.preventDefault();
    const link = normalizeUrl(url);
    if (link === null) {
      setInputError("Bu bir web adresi gibi görünmüyor. Örnek: https://ornek.com/makale");
      return;
    }
    setInputError("");
    decisionRef.current = { decision: null, selectedId: null, skipArchive: false };
    setSaved(null);
    run({ url, notes, brief, templateChoice, method });
  };
  const ready =
    method === "screenshots"
      ? shots.items.length > 0
      : method === "text"
        ? notes.trim().length >= 40
        : url.trim() || notes.trim().length >= 40 || shots.items.length > 0 || brief.topic.trim().length >= 3;

  const chooseMethod = (key) => {
    setMethod(key);
    if (key === "screenshots" || key === "text") {
      setShowAlt(true);
      if (key === "text") setFocusNotes(true);
    }
  };

  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (normalizeUrl(text)) {
        setUrl(text);
        setPasteHint("");
      } else setPasteHint("Panodaki metin bir link değil.");
    } catch {
      setPasteHint("Panoya erişilemedi; alana uzun basıp “Yapıştır”ı seç.");
    }
  };
  const canPaste = typeof navigator !== "undefined" && Boolean(navigator.clipboard?.readText);

  const resume = () => {
    const value = saved;
    setSaved(null);
    setUrl(value.url ?? "");
    setNotes(value.notes ?? "");
    setBrief({ ...DEFAULT_BRIEF, ...value.brief });
    setTemplateChoice(value.templateChoice ?? "auto");
    setMethod(value.method ?? "auto");
    cache.current = { source: value.source ?? null, shots: value.shots ?? null, compare: value.compare ?? null };
    decisionRef.current = value.decision ?? { decision: null, selectedId: null, skipArchive: false };
    if (value.compare?.result) {
      setSimilar((current) => ({ ...current, status: "ready", key: value.compare.key, result: value.compare.result, decision: decisionRef.current.decision, selectedId: decisionRef.current.selectedId ?? value.compare.result.matches[0]?.id ?? null }));
    }
    const input = { url: value.url ?? "", notes: value.notes ?? "", brief: { ...DEFAULT_BRIEF, ...value.brief }, templateChoice: value.templateChoice ?? "auto", method: value.method ?? "auto" };
    inputRef.current = input;
    setView({ input, read: value.source?.source ?? null, shots: value.shots ?? null });
    if (value.draft) {
      setPlan(value.plan ?? value.draft.template ?? null);
      setDraft({ status: "ready", result: value.draft, error: "" });
      setStages(Object.fromEntries(STAGES.map(([stage]) => [stage, { status: "done", detail: stage === "draft" ? `${value.draft.stats.words} sözcük hazır` : "" }])));
      setPhase("review");
    } else {
      run(input);
    }
  };

  const discard = () => {
    clearSession(key);
    setSaved(null);
  };

  const act = (action) => {
    if (action === "edit") return setPhase("start");
    if (action === "alt") {
      setShowAlt(true);
      setPhase("start");
      setFocusNotes(true);
      return;
    }
    if (action === "skipArchive") decisionRef.current = { ...decisionRef.current, skipArchive: true };
    if (action === "autoFallback") {
      setMethod("auto");
      return run({ ...inputRef.current, method: "auto" });
    }
    run(inputRef.current);
  };
  const ACTION_LABELS = { edit: "Linki düzenle", alt: "Metin veya ekran görüntüsü ekle", retry: "Tekrar dene", skipArchive: "Karşılaştırmadan devam et", autoFallback: "Otomatik yöntemle dene" };

  const regenerateWith = (key) => {
    setTemplateChoice(key);
    const input = { ...inputRef.current, templateChoice: key };
    run(input);
  };

  // --- Görünüm ------------------------------------------------------------------------
  const shown = view.input ?? { url: "", notes: "", brief: DEFAULT_BRIEF };
  const sourceLabel = shown.url ? shown.url : shown.notes ? "Not / metin" : shots.items.length ? "Ekran görüntüleri" : shown.brief.topic;
  const compareSourceView = view.read ?? view.shots ?? (shown.notes ? { kind: "text", title: "Kullanıcı notu", text: shown.notes } : null);

  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="studio-title" onCancel={(event) => { event.preventDefault(); close(); }}>
      <div className={styles.shell}>
        <header className={styles.head}>
          <h2 id="studio-title" className={styles.title}>
            <Wand2 size={19} aria-hidden="true" /> AI Blog Stüdyosu
          </h2>
          <button type="button" className={styles.close} aria-label="Stüdyoyu kapat" onClick={close}>
            <X size={20} />
          </button>
        </header>

        <div className={styles.body}>
          {phase === "start" ? (
            <form className={styles.start} onSubmit={submit} noValidate>
              <h3 className={styles.startTitle}>Yeni blog yazısı oluştur</h3>
              <p className={styles.startLead}>Kaynak linkini ekle; içeriği analiz edip sana uygun bir taslak hazırlayalım.</p>

              {saved && (saved.url || saved.notes) ? (
                <div className={styles.resume} role="status">
                  <p>
                    <strong>Yarım kalan çalışma</strong>
                    <span>{saved.url || "Not / metin"}{saved.draft ? " · taslak hazır" : ""}</span>
                  </p>
                  <div className={styles.resumeActions}>
                    <button type="button" className={styles.primary} onClick={resume}>Kaldığın yerden devam et</button>
                    <button type="button" className={styles.linkButton} onClick={discard}>Yeni başla</button>
                  </div>
                </div>
              ) : null}

              <label htmlFor="studio-url" className={styles.label}>Kaynak linki</label>
              <div className={styles.urlRow}>
                <input
                  id="studio-url"
                  // Açılışta odak: link hemen yapıştırılabilir.
                  autoFocus
                  type="url"
                  inputMode="url"
                  enterKeyHint="go"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className={`${styles.input} ${styles.urlInput}`}
                  value={url}
                  maxLength={2000}
                  placeholder="https://ornek.com/makale"
                  aria-invalid={inputError ? true : undefined}
                  aria-describedby={inputError ? "studio-url-error" : undefined}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    setInputError("");
                  }}
                />
                {canPaste ? (
                  <button type="button" className={styles.pasteButton} onClick={paste}>
                    <ClipboardPaste size={17} aria-hidden="true" />
                    <span>Yapıştır</span>
                  </button>
                ) : null}
              </div>
              {pasteHint ? <p className={styles.hint}>{pasteHint}</p> : null}
              {inputError ? <p id="studio-url-error" className={styles.errorBox} role="alert">{inputError}</p> : null}

              <button type="submit" className={styles.primaryWide} disabled={!ready}>
                <Wand2 size={18} aria-hidden="true" /> Analiz Et ve Taslağı Hazırla
              </button>

              <details className={styles.more} open={methodOpen} onToggle={(event) => setMethodOpen(event.currentTarget.open)}>
                <summary>
                  <span>
                    Kaynak okuma yöntemi: <strong className={styles.methodCurrent}>{METHODS.find((item) => item.key === method)?.label}</strong>
                  </span>
                </summary>
                <div className={styles.methods} role="radiogroup" aria-label="Kaynak okuma yöntemi">
                  {METHODS.map((item) => {
                    const support = READERS.has(item.key) ? readers?.[item.key] : null;
                    const disabled = Boolean(support && !support.available);
                    return (
                      <button
                        key={item.key}
                        type="button"
                        role="radio"
                        aria-checked={method === item.key}
                        className={styles.method}
                        disabled={disabled}
                        onClick={() => chooseMethod(item.key)}
                      >
                        <strong>{item.label}</strong>
                        <span>{disabled ? `Kullanılamıyor: ${support.reason}` : item.note}</span>
                      </button>
                    );
                  })}
                </div>
                {method !== "auto" && READERS.has(method) ? (
                  <p className={styles.hint}>Yalnızca seçilen okuyucu denenir. Başarısız olursa otomatik yönteme geçmeyi önerilir.</p>
                ) : null}
              </details>

              <button type="button" className={styles.altToggle} aria-expanded={showAlt} aria-controls="studio-alt" onClick={() => setShowAlt((value) => !value)}>
                Linkin yok mu? Metin veya not ekle
              </button>
              {showAlt ? (
                <div id="studio-alt" className={styles.altPanel}>
                  <label htmlFor="studio-notes" className={styles.label}>Metin ya da not</label>
                  <textarea
                    id="studio-notes"
                    ref={notesRef}
                    className={`${styles.input} ${styles.textarea}`}
                    rows={5}
                    maxLength={20_000}
                    value={notes}
                    placeholder="Makale metnini yapıştır ya da yazmak istediğin konuyu birkaç cümleyle anlat."
                    onChange={(event) => setNotes(event.target.value)}
                  />
                  <p className={styles.hint}>
                    {notes.trim().length} / 20.000 · en az 40 karakter. Link de verdiysen not, ek bilgi olarak kullanılır.
                  </p>
                  <details className={styles.more} open={method === "screenshots" || undefined}>
                    <summary>Ekran görüntüsünden ekle</summary>
                    <ShotsPanel shots={shots} setShots={setShots} inputRef={shotsRef} />
                  </details>
                </div>
              ) : null}

              <details className={styles.more}>
                <summary>Ayrıntılar (isteğe bağlı)</summary>
                <div className={styles.detailsGrid}>
                  <div className={styles.field}>
                    <label htmlFor="studio-template-select" className={styles.label}>Şablon</label>
                    <select id="studio-template-select" className={styles.input} value={templateChoice} onChange={(event) => setTemplateChoice(event.target.value)}>
                      <option value="auto">Otomatik seç (önerilen)</option>
                      {editorBlocks.length && !silent ? <option value={CURRENT}>Editördeki yapı ({editorBlocks.length} blok)</option> : null}
                      {TEMPLATES.map((item) => (
                        <option key={item.key} value={item.key}>{item.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="studio-topic" className={styles.label}>Konu</label>
                    <input id="studio-topic" className={styles.input} value={brief.topic} maxLength={200} placeholder="Boşsa kaynağın konusu kullanılır" onChange={(event) => setBrief((value) => ({ ...value, topic: event.target.value }))} />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="studio-keyword" className={styles.label}>Anahtar kelime</label>
                    <input id="studio-keyword" className={styles.input} value={brief.keyword} maxLength={80} onChange={(event) => setBrief((value) => ({ ...value, keyword: event.target.value }))} />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="studio-audience" className={styles.label}>Hedef kitle</label>
                    <input id="studio-audience" className={styles.input} value={brief.audience} maxLength={160} onChange={(event) => setBrief((value) => ({ ...value, audience: event.target.value }))} />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="studio-goal" className={styles.label}>Amaç</label>
                    <select id="studio-goal" className={styles.input} value={brief.goal} onChange={(event) => setBrief((value) => ({ ...value, goal: event.target.value }))}>
                      {GOAL_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="studio-tone" className={styles.label}>Ton</label>
                    <select id="studio-tone" className={styles.input} value={brief.tone} onChange={(event) => setBrief((value) => ({ ...value, tone: event.target.value }))}>
                      {TONE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="studio-length" className={styles.label}>Uzunluk</label>
                    <select id="studio-length" className={styles.input} value={brief.length} onChange={(event) => setBrief((value) => ({ ...value, length: event.target.value }))}>
                      {LENGTH_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="studio-cta" className={styles.label}>CTA</label>
                    <input id="studio-cta" className={styles.input} value={brief.cta} maxLength={200} placeholder="Boşsa iletişime davet edilir" onChange={(event) => setBrief((value) => ({ ...value, cta: event.target.value }))} />
                  </div>
                </div>
              </details>
            </form>
          ) : null}

          {phase === "run" || phase === "decide" ? (
            phase === "decide" && !stageError ? (
              // Karar beklerken ilerleme tek satırlık özete iner; karar düğmeleri öne çıkar.
              <details className={styles.more}>
                <summary>
                  Analiz adımları · {STAGES.filter(([stage]) => stages[stage].status === "done").length}/{STAGES.length} tamamlandı
                </summary>
                <ProgressList stages={stages} />
              </details>
            ) : (
              <section className={styles.panel} aria-labelledby="studio-run-title">
                <h3 id="studio-run-title" className={styles.panelTitle}>
                  {stageError ? <CircleAlert size={18} aria-hidden="true" /> : running ? <LoaderCircle size={18} className={styles.spin} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
                  {stageError ? "Bir adımda sorun çıktı" : "Taslak hazırlanıyor"}
                </h3>
                <p className={styles.sourceLine}>{sourceLabel}</p>
                <ProgressList stages={stages} />
                {stageError ? (
                  <div className={styles.errorBox} role="alert">
                    <p>{stageError.message}</p>
                    <div className={styles.errorActions}>
                      {stageError.actions.map((action, index) => (
                        <button key={action} type="button" className={index === 0 ? styles.primary : styles.secondary} onClick={() => act(action)}>
                          {action === "retry" ? <RefreshCw size={15} aria-hidden="true" /> : null}
                          {ACTION_LABELS[action]}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {running ? (
                  <button type="button" className={styles.secondary} onClick={() => runRef.current?.abort("cancel")}>Durdur</button>
                ) : null}
              </section>
            )
          ) : null}

          {phase === "decide" && similar.result ? (
            <SimilarityStep
              state={similar}
              setState={setSimilar}
              source={compareSourceView}
              onRetry={() => run(inputRef.current)}
              onBackToSource={() => setPhase("start")}
              onDecide={(decision, selectedId) => {
                decisionRef.current = { ...decisionRef.current, decision, selectedId };
                run(inputRef.current);
              }}
            />
          ) : null}

          {phase === "review" && draft.result ? (
            <div className={styles.draft}>
              <TemplateLine plan={plan} onChange={regenerateWith} disabled={running} />
              <DraftReview result={draft.result} placed={placed} archiveMatches={archiveMatches} />
              <button type="button" className={styles.secondary} onClick={() => setPhase("images")}>
                <ImagePlus size={16} aria-hidden="true" /> {pool.length ? `Görseller (${pool.length})` : "Görsel ekle (isteğe bağlı)"}
              </button>
            </div>
          ) : null}

          {phase === "images" ? (
            <ImageStep
              urlSource={urlSource}
              shotSource={view.shots}
              concepts={[draft.result?.fields?.title || shown.brief.topic || urlSource?.title || "Blog yazısı"].map((value) => value.slice(0, 90))}
              pool={pool}
              setPool={setPool}
              coverId={coverId}
              setCoverId={setCoverId}
            />
          ) : null}
        </div>

        {phase === "review" ? (
          <footer className={styles.foot}>
            <button type="button" className={styles.secondary} onClick={() => run(inputRef.current)}>Yeniden oluştur</button>
            <button type="button" className={styles.primary} disabled={missingAlt > 0} onClick={() => finish()} title={missingAlt ? "Tüm görsellerin alt metni olmalı" : undefined}>
              Editöre aktar
            </button>
          </footer>
        ) : null}
        {phase === "images" ? (
          <footer className={styles.foot}>
            <button type="button" className={styles.secondary} onClick={() => (draft.result ? setPhase("review") : close())}>
              {draft.result ? "Geri" : "Vazgeç"}
            </button>
            <button
              type="button"
              className={styles.primary}
              disabled={missingAlt > 0 || (!draft.result && pool.length === 0)}
              title={missingAlt ? "Tüm görsellerin alt metni olmalı" : undefined}
              onClick={() => {
                if (draft.result) return setPhase("review");
                onApplyImages?.({ pool, coverId });
                onClose();
              }}
            >
              {draft.result ? "Tamam" : "Görselleri yazıya ekle"}
            </button>
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}

const STATUS_WORDS = { pending: "bekliyor", active: "sürüyor", done: "tamamlandı", error: "hata", skipped: "atlandı" };

function ProgressList({ stages }) {
  return (
    <ol className={styles.progress} aria-live="polite">
      {STAGES.map(([stage, label]) => {
        const { status, detail } = stages[stage];
        return (
          <li key={stage} data-status={status}>
            <span className={styles.progressIcon} aria-hidden="true">
              {status === "active" ? <LoaderCircle size={17} className={styles.spin} /> : status === "done" ? <Check size={17} /> : status === "error" ? <CircleAlert size={17} /> : status === "skipped" ? <MinusCircle size={17} /> : <span className={styles.dot} />}
            </span>
            <span className={styles.progressLabel}>
              {label}
              <span className={styles.srOnly}>{` — ${STATUS_WORDS[status]}`}</span>
            </span>
            {detail ? <small className={styles.progressDetail}>{detail}</small> : null}
          </li>
        );
      })}
    </ol>
  );
}

function TemplateLine({ plan, onChange, disabled }) {
  const [editing, setEditing] = useState(false);
  if (!plan) return null;
  return (
    <div className={styles.templateLine}>
      <p>
        <span className={styles.hint}>Seçilen şablon:</span> <strong>{plan.label}</strong>
        {plan.reason ? <span className={styles.hint}> — {plan.reason}</span> : null}
      </p>
      {editing ? (
        <div className={styles.inline}>
          <label htmlFor="studio-template-change" className={styles.srOnly}>Şablonu değiştir</label>
          <select id="studio-template-change" className={styles.input} defaultValue={plan.key ?? ""} onChange={(event) => event.target.value && onChange(event.target.value)} disabled={disabled}>
            <option value="" disabled>Şablon seç…</option>
            {TEMPLATES.map((item) => (
              <option key={item.key} value={item.key}>{item.label}</option>
            ))}
          </select>
        </div>
      ) : (
        <button type="button" className={styles.linkButton} onClick={() => setEditing(true)}>Değiştir</button>
      )}
    </div>
  );
}

function DraftReview({ result, placed, archiveMatches = [] }) {
  const { fields, stats, coverage = null, rounds = [] } = result;
  const titleHint = lengthHint(fields.seoTitle.length, 30, 60);
  const descriptionHint = lengthHint(fields.seoDescription.length, 120, 155);
  const headings = contentHeadings({ type: "blocks", version: 1, blocks: placed.blocks });
  const notes = draftNotes(result, placed, archiveMatches);

  return (
    <div className={styles.twoCol}>
      <section className={styles.panel} aria-labelledby="studio-seo">
        <h3 id="studio-seo" className={styles.panelTitle}>Taslak ve SEO</h3>
        <dl className={styles.summary}>
          <dt>Başlık (H1)</dt>
          <dd>{fields.title}</dd>
          <dt>Uzunluk</dt>
          <dd>
            {stats.words} sözcük (gerçek ölçüm) · hedef ≈{stats.targetWords} ({stats.auto ? "kaynağa göre" : "seçilen"})
            <span data-warn={stats.words < stats.targetWords * 0.9 || undefined}>
              {rounds.length > 1 ? `İlk taslak ${rounds[0].words} sözcüktü; ${rounds.length - 1} genişletme turu yapıldı.` : "Genişletme gerekmedi."}
              {stats.extraSections ? ` Kaynaktan ${stats.extraSections} ek bölüm eklendi.` : ""}
            </span>
          </dd>
          <dt>SEO başlığı</dt>
          <dd>
            {fields.seoTitle}
            <span data-warn={titleHint.warn || undefined}>{titleHint.text}</span>
          </dd>
          <dt>Meta açıklama</dt>
          <dd>
            {fields.seoDescription || "—"}
            <span data-warn={descriptionHint.warn || undefined}>{descriptionHint.text}</span>
          </dd>
          <dt>Kalıcı bağlantı</dt>
          <dd><code>/blog/{fields.slug}</code></dd>
          <dt>Görseller</dt>
          <dd>
            {placed.placed} görsel yerleşti{placed.cover ? ` · kapak seçildi` : ""}
          </dd>
        </dl>
        <p className={styles.hint}>Tüm alanlar editörün “Ayarlar” bölümünde düzenlenebilir. Taslak yayımlanmaz.</p>
      </section>

      <section className={styles.panel} aria-labelledby="studio-outline">
        <h3 id="studio-outline" className={styles.panelTitle}>Yapı ve uyarılar</h3>
        <ol className={styles.outline}>
          {headings.map((heading) => (
            <li key={heading.id} data-level={heading.level + 1}>
              <span>H{heading.level + 1}</span>
              {heading.label}
            </li>
          ))}
        </ol>
        {notes.length ? (
          <ul className={styles.warnings}>
            {notes.map((note) => (
              <li key={note}>
                <CircleAlert size={15} aria-hidden="true" /> {note}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.okText}><Check size={14} aria-hidden="true" /> Uyarı yok.</p>
        )}
      </section>

      {coverage?.total ? (
        <section className={`${styles.panel} ${styles.panelWide}`} aria-labelledby="studio-coverage">
          <h3 id="studio-coverage" className={styles.panelTitle}>
            Kaynak kapsamı · {coverage.covered}/{coverage.total} konu işlendi
          </h3>
          <p className={styles.hint}>
            {coverage.method === "model" ? "Yapay zekânın beyanı" : "Yapay zekânın beyanı ve anahtar sözcük denetimi"}; metin benzerliği oranı değildir. Kaynakta{" "}
            {coverage.sourceHeadings} H2/H3 başlık vardı.
          </p>
          <ul className={styles.coverage}>
            {coverage.items.map((item) => (
              <li key={item.topic} data-covered={item.covered || undefined}>
                {item.covered ? <Check size={14} aria-label="İşlendi" /> : <CircleAlert size={14} aria-label="İşlenmedi" />}
                <span>{item.topic}</span>
                {item.note ? <small>{item.note}</small> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
