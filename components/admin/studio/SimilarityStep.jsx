"use client";

import { useState } from "react";
import { Archive, Check, CircleAlert, ExternalLink, FilePenLine, LoaderCircle, RefreshCw } from "lucide-react";
import styles from "./studio.module.css";
import { UPDATE_STORAGE_PREFIX } from "./updateStorage";

const STATE_LABELS = { published: "Yayında", scheduled: "Planlandı", draft: "Taslak" };
const HEADLINES = {
  very_high: "Bu konuda daha önce içerik oluşturmuşuz.",
  high: "Bu konuda daha önce içerik oluşturmuşuz.",
  medium: "Arşivde bu konuya yakın yazılar var.",
  low: "Arşivde ilişkili ama farklı yazılar var.",
};

const DECISIONS = {
  angle: { key: "angle", label: "Farklı açıdan taslak oluştur", note: "Mevcut yazının işlediği konular ana eksen olmaz; tamamlayıcı konulara öncelik verilir.", needsMatch: true },
  new: { key: "new", label: "Yine de yeni yazı oluştur", note: "Mevcut yazıların kapsadığı konular yapay zekâya bildirilir; gereksiz tekrar önlenir." },
  update: { key: "update", label: "Güncelleme önerilerini gör", note: "Önce öneriler önizlenir; onayınız olmadan hiçbir yazı değişmez.", needsMatch: true },
  cancel: { key: "cancel", label: "Vazgeç", note: "Taslak üretilmez; girdiğiniz link ve notlar korunur." },
};

// Önerilen seçenek gerçek sonuca göre: güçlü benzerlikte farklı açı, orta
// benzerlikte yeni yazı önce gelir.
function decisionOrder(top) {
  return top === "very_high" || top === "high" ? ["angle", "new", "update", "cancel"] : ["new", "angle", "update", "cancel"];
}

function scopeText(archive) {
  if (!archive) return "";
  const parts = [`${archive.published} yayımlanmış`, `${archive.scheduled} planlanmış`, `${archive.drafts} taslak`];
  return `Taranan arşiv: ${parts.join(", ")} yazı${archive.limited ? ` — DİKKAT: toplam ${archive.total} yazının yalnızca en son güncellenen ${archive.scanned} tanesi tarandı` : " (tamamı)"}. Çöp kutusundaki yazılar taranmaz.`;
}

// Kaynak okunduktan sonra, taslak üretilmeden önce arşiv karşılaştırması.
// state: { status, result, error, decision, selectedId, update }
// `onDecide(karar)`: "new" ya da "angle" seçilince taslak üretimi hemen sürer.
export default function SimilarityStep({ state, setState, source, onRetry, onBackToSource, onDecide = () => {} }) {
  const { status, result, error, decision, selectedId } = state;
  const patch = (value) => setState((current) => ({ ...current, ...value }));

  if (!source) {
    return (
      <section className={styles.panel}>
        <p className={styles.lead}>Kaynak verilmediği için arşiv karşılaştırması yapılmadı. Yalnızca konuyla devam edebilirsiniz.</p>
      </section>
    );
  }

  if (status === "loading") {
    return (
      <section className={styles.panel}>
        <div className={styles.loading} role="status" aria-live="polite">
          <LoaderCircle size={22} className={styles.spin} aria-hidden="true" />
          <p>Kaynağın konusu ve arama niyeti çıkarılıyor, blog arşivi taranıyor…</p>
          <p className={styles.hint}>Taslak bu karşılaştırma bitmeden oluşturulmaz.</p>
        </div>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className={styles.panel}>
        <p className={styles.errorBox} role="alert">{error}</p>
        <div className={styles.inline}>
          <button type="button" className={styles.secondary} onClick={onRetry}>
            <RefreshCw size={15} aria-hidden="true" /> Yeniden dene
          </button>
          <button type="button" className={styles.linkButton} onClick={() => patch({ decision: "new", skipped: true })}>
            Karşılaştırmadan devam et
          </button>
        </div>
        {decision === "new" ? <p className={styles.hint}>Arşiv karşılaştırması yapılmadan devam ediliyor.</p> : null}
      </section>
    );
  }

  if (!result) return null;

  if (result.status === "insufficient") {
    return (
      <section className={styles.panel}>
        <h3 className={styles.panelTitle}><CircleAlert size={17} aria-hidden="true" /> Kaynak yeterince okunamadı</h3>
        <p>{result.message}</p>
        <div className={styles.inline}>
          <button type="button" className={styles.secondary} onClick={onBackToSource}>Kaynağa dön (metin ya da ekran görüntüsü ekle)</button>
          <button type="button" className={styles.linkButton} onClick={() => patch({ decision: "new", skipped: true })}>Karşılaştırmadan devam et</button>
        </div>
      </section>
    );
  }

  const { matches, archive, profile, method, notes = [] } = result;
  const strong = matches.some((match) => match.category === "very_high" || match.category === "high");
  const selected = matches.find((match) => match.id === selectedId) ?? matches[0] ?? null;

  const matchList = matches.length ? (
    <section className={styles.panel} aria-labelledby="sim-matches">
      <h3 id="sim-matches" className={styles.panelTitle}>Benzer yazılar ({matches.length})</h3>
      <ol className={styles.matches}>
        {matches.map((match) => (
          <li key={match.id} data-picked={match.id === selected?.id || undefined} data-category={match.category}>
            <label className={styles.matchPick}>
              <input type="radio" name="sim-match" checked={match.id === selected?.id} onChange={() => patch({ selectedId: match.id })} />
              <span className={styles.matchTitle}>{match.title || "(başlıksız)"}</span>
            </label>
            <div className={styles.matchMeta}>
              <span className={styles.badge}>{match.label}</span>
              <span className={styles.stateBadge} data-state={match.state}>{STATE_LABELS[match.state] ?? match.state}</span>
            </div>
            <ul className={styles.reasons}>
              {match.reasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
            {match.overlapping.length ? <p className={styles.hint}><strong>Örtüşen konular:</strong> {match.overlapping.join(" · ")}</p> : null}
            {match.missing.length ? <p className={styles.hint}><strong>Kaynakta olup bu yazıda olmayan:</strong> {match.missing.join(" · ")}</p> : null}
            <p className={styles.hint}>
              Ölçümler (genel benzerlik değildir): başlık benzerliği {Math.round(match.signals.title * 100)}/100 · alt başlık örtüşmesi %{Math.round(match.signals.headings * 100)}
            </p>
            <div className={styles.inline}>
              {match.state === "published" ? (
                <a className={styles.linkButton} href={`/blog/${match.slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink size={15} aria-hidden="true" /> Mevcut yazıyı incele
                </a>
              ) : null}
              <a className={styles.linkButton} href={`/admin/blog/${match.id}`} target="_blank" rel="noreferrer">
                <FilePenLine size={15} aria-hidden="true" /> Editörde aç
              </a>
            </div>
          </li>
        ))}
      </ol>
    </section>
  ) : null;

  // Mobil öncelikli sıra: kısa özet → karar → ayrıntılı kartlar.
  return (
    <div className={styles.similarity}>
      <section className={styles.panel} aria-labelledby="sim-title">
        <h3 id="sim-title" className={styles.panelTitle}>
          <Archive size={17} aria-hidden="true" />
          {matches.length ? HEADLINES[result.top] : "Belirgin benzerlik bulunamadı"}
        </h3>
        <p>
          {strong
            ? `Kaynak, “${matches[0].title}” yazımızla önemli ölçüde örtüşüyor. İstersen farklı bir açıdan yeni bir yazı hazırlayabilir veya mevcut yazıyı güncelleyebilirsin.`
            : matches.length
              ? "Arşivde ilişkili yazılar var; kapsamları farklı olabilir. Nasıl devam edeceğini seç."
              : "Mevcut blog arşivimizde bu kaynakla belirgin bir benzerlik bulunamadı."}
        </p>
        <p className={styles.hint}>{scopeText(archive)}</p>
        {notes.map((note) => <p key={note} className={styles.notice}>{note}</p>)}
        <details className={styles.more}>
          <summary>Analiz ayrıntıları</summary>
          {profile?.question ? <p className={styles.hint}>Kaynağın yanıtladığı soru: “{profile.question}”</p> : null}
          <p className={styles.hint}>
            Değerlendirme: {method === "ai" ? "yerel ön eleme + yapay zekâ karşılaştırması" : "yalnızca yerel ölçümler (yapay zekâ kullanılamadı)"}. Kategoriler gerekçelere dayanır; genel bir benzerlik yüzdesi değildir.
          </p>
        </details>
      </section>

      <section className={styles.panel} aria-labelledby="sim-decision">
        <h3 id="sim-decision" className={styles.panelTitle}>Nasıl devam edelim?</h3>
        <div className={styles.decisions} role="radiogroup" aria-labelledby="sim-decision">
          {decisionOrder(result.top).map((key) => DECISIONS[key]).filter((item) => !item.needsMatch || matches.length).map((item, index) => (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={decision === item.key}
              className={styles.mode}
              data-recommended={index === 0 || undefined}
              onClick={() => {
                patch({ decision: item.key, selectedId: selected?.id ?? null });
                if (item.key === "new" || item.key === "angle") onDecide(item.key, selected?.id ?? null);
              }}
            >
              {index === 0 ? <span className={styles.recommended}>Önerilen</span> : null}
              <strong>{item.label}</strong>
              <span>{item.key === "angle" || item.key === "update" ? `${item.note} Seçili yazı: “${selected?.title ?? ""}”.` : item.note}</span>
            </button>
          ))}
        </div>
        {decision === "cancel" ? (
          <p className={styles.notice}>Taslak üretimi durduruldu. Linkin ve notların korunuyor; kararını değiştirebilir ya da stüdyoyu kapatabilirsin.</p>
        ) : null}
        {decision === "update" && selected ? <UpdatePreview key={selected.id} match={selected} source={source} state={state.update} setState={(update) => patch({ update })} /> : null}
      </section>

      {matchList}
    </div>
  );
}

// Güncelleme önerileri: önce önizleme, sonra açık onayla editöre aktarım.
function UpdatePreview({ match, source, state, setState }) {
  const [picked, setPicked] = useState(() => new Set());
  const [confirmed, setConfirmed] = useState(false);
  const current = state?.postId === match.id ? state : null;

  const prepare = async () => {
    setState({ postId: match.id, status: "loading", data: null, error: "" });
    try {
      const response = await fetch("/api/admin/ai/similar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "suggest", postId: match.id, source, missing: match.missing }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Öneriler hazırlanamadı.");
      setState({ postId: match.id, status: "ready", data, error: "" });
      setPicked(new Set(data.suggestions.map((item) => item.id)));
    } catch (failure) {
      setState({ postId: match.id, status: "error", data: null, error: failure instanceof TypeError ? "Sunucuya ulaşılamadı." : failure.message });
    }
  };

  const openEditor = () => {
    const suggestions = current.data.suggestions.filter((item) => picked.has(item.id));
    try {
      localStorage.setItem(
        `${UPDATE_STORAGE_PREFIX}${match.id}`,
        JSON.stringify({ createdAt: Date.now(), sourceTitle: source.title, suggestions })
      );
    } catch {
      setState({ ...current, error: "Tarayıcı depolaması kullanılamıyor; öneriler editöre aktarılamadı." });
      return;
    }
    window.open(`/admin/blog/${match.id}?oneriler=1`, "_blank", "noopener");
  };

  if (!current || current.status === "error") {
    return (
      <div className={styles.updateBox}>
        <p className={styles.hint}>“{match.title}” için kaynaktaki yeni bilgilere dayanan ekleme önerileri hazırlanır. Bu adım yazıyı değiştirmez.</p>
        {current?.error ? <p className={styles.errorBox} role="alert">{current.error}</p> : null}
        <button type="button" className={styles.secondary} onClick={prepare}>Güncelleme önerilerini hazırla</button>
      </div>
    );
  }
  if (current.status === "loading") {
    return (
      <div className={styles.loading} role="status" aria-live="polite">
        <LoaderCircle size={20} className={styles.spin} aria-hidden="true" />
        <p>Öneriler hazırlanıyor…</p>
      </div>
    );
  }

  const { suggestions, post } = current.data;
  if (!suggestions.length) return <p className={styles.notice}>Kaynakta bu yazıya eklenecek yeni bir bilgi bulunamadı.</p>;

  return (
    <div className={styles.updateBox}>
      <p className={styles.hint}>Önizleme — mevcut metin solda, önerilen ekleme sağda. Seçtikleriniz editörde ayrıca onayınızla eklenir.</p>
      <ol className={styles.suggestions}>
        {suggestions.map((item) => (
          <li key={item.id}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={picked.has(item.id)}
                onChange={(event) =>
                  setPicked((set) => {
                    const next = new Set(set);
                    if (event.target.checked) next.add(item.id);
                    else next.delete(item.id);
                    return next;
                  })
                }
              />
              {item.afterHeading ? `“${item.afterHeading}” bölümüne ekle` : "Yazının sonuna ekle"}
            </label>
            <div className={styles.diff}>
              <div>
                <span className={styles.diffLabel}>Mevcut</span>
                <p>{item.afterHeading ? post.sections?.[item.afterHeading] || "(Bu başlığın altında metin yok)" : "—"}</p>
              </div>
              <div data-new>
                <span className={styles.diffLabel}>Önerilen ekleme</span>
                {item.heading ? <p><strong>H{item.level} {item.heading}</strong></p> : null}
                {item.paragraphs.map((text) => <p key={text}>{text}</p>)}
              </div>
            </div>
            {item.reason ? <p className={styles.hint}>Neden: {item.reason}</p> : null}
          </li>
        ))}
      </ol>
      <label className={styles.check}>
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        Önizlemeyi inceledim; seçilen {picked.size} önerinin “{post.title}” editöründe gösterilmesini onaylıyorum.
      </label>
      <p className={styles.hint}>
        Editör yeni sekmede açılır; öneriler orada tek tek “Uygula” ile eklenir ve “Geri al” ile kaldırılabilir.
        {post.state === "draft" ? " Taslaklar uygulandıktan sonra otomatik kaydedilir." : " Yayındaki yazı, editörde “Güncelle” demeden değişmez."}
      </p>
      <button type="button" className={styles.primary} disabled={!confirmed || picked.size === 0} onClick={openEditor}>
        <Check size={16} aria-hidden="true" /> Önerileri editörde aç
      </button>
    </div>
  );
}
