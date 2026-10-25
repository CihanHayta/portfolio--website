"use client";

import { useState } from "react";
import { Activity, CircleAlert, LoaderCircle, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import styles from "./AiServicesPanel.module.css";

const STATE = {
  active: ["Aktif", "ok"],
  "missing-key": ["Anahtar yok", "muted"],
  disabled: ["Pasif", "muted"],
  blocked: ["Ücret koruması", "warn"],
  cooldown: ["Bekleme süresinde", "warn"],
  quota: ["Sağlayıcı kotası doldu", "warn"],
  limit: ["Uygulama limiti doldu", "warn"],
};
const KIND = { ok: "başarılı", quota: "kota", rate: "hız sınırı", timeout: "zaman aşımı", server: "sunucu hatası", auth: "geçersiz anahtar", forbidden: "yetki", invalid: "geçersiz çıktı", capability: "yetenek yok", limit: "uygulama limiti", disabled: "pasif", billing: "ücret koruması", store: "depo hatası", paid: "ücretli istendi", config: "yapılandırma", concurrency: "eşzamanlı sınır", busy: "yoğun", truncated: "yarım yanıt", missing: "model yok", badrequest: "geçersiz istek", blocked: "içerik reddi", error: "hata" };

const number = (value) => (typeof value === "number" ? value.toLocaleString("tr-TR") : "—");
const time = (value) => (value ? new Date(value).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "—");

function Meter({ label, used, limit, note }) {
  const ratio = typeof limit === "number" && limit > 0 ? Math.min(1, used / limit) : null;
  return (
    <div className={styles.meter}>
      <div className={styles.meterHead}>
        <span>{label}</span>
        <span>
          <strong>{number(used)}</strong> / {typeof limit === "number" ? number(limit) : "limitsiz"}
        </span>
      </div>
      {ratio !== null ? (
        <div className={styles.bar} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}>
          <span style={{ width: `${ratio * 100}%` }} data-full={ratio >= 1 || undefined} />
        </div>
      ) : null}
      {note ? <span className={styles.note}>{note}</span> : null}
    </div>
  );
}

function LimitForm({ service, fields, editable, onSaved }) {
  const [values, setValues] = useState(() => ({ ...service.limit }));
  const [state, setState] = useState({ saving: false, error: "", ok: "" });
  const visible = Object.entries(fields).filter(([field, spec]) => (!spec.requires || service.reports.includes(spec.requires)) && (!spec.requiresBilling || service.billing === spec.requiresBilling));

  const save = async (event) => {
    event.preventDefault();
    setState({ saving: true, error: "", ok: "" });
    try {
      const response = await fetch("/api/admin/ai/services", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: service.key, values }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Kaydedilemedi.");
      setValues({ ...data.limit });
      setState({ saving: false, error: "", ok: "Kaydedildi. Değerler sunucuda doğrulandı ve sağlayıcı üst sınırına göre kırpıldı." });
      onSaved();
    } catch (error) {
      setState({ saving: false, error: error instanceof TypeError ? "Sunucuya ulaşılamadı." : error.message, ok: "" });
    }
  };

  return (
    <form className={styles.form} onSubmit={save}>
      <fieldset disabled={!editable || state.saving} className={styles.fields}>
        {visible.map(([field, spec]) => (
          <label key={field} className={spec.type === "boolean" ? styles.switch : styles.field}>
            {spec.type === "boolean" ? (
              <>
                <input type="checkbox" checked={Boolean(values[field])} onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.checked }))} />
                <span>{spec.label}</span>
              </>
            ) : (
              <>
                <span>{spec.label}</span>
                <input type="number" inputMode="numeric" min={spec.min ?? 0} max={service.ceilings?.[field] ?? undefined} value={values[field] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value === "" ? null : Number(event.target.value) }))} />
                <small>{typeof service.ceilings?.[field] === "number" ? `Sağlayıcı üst sınırı: ${number(service.ceilings[field])}` : "Sağlayıcı üst sınırı yayımlanmamış"}</small>
              </>
            )}
          </label>
        ))}
        <p className={styles.locked}>
          <Lock size={14} aria-hidden="true" /> Ücretsiz mod: açık (kilitli, kapatılamaz)
        </p>
      </fieldset>
      {editable ? (
        <button type="submit" className={styles.primary} disabled={state.saving}>
          {state.saving ? <LoaderCircle size={16} className={styles.spin} aria-hidden="true" /> : null}
          Limitleri kaydet
        </button>
      ) : null}
      {state.error ? <p className={styles.error} role="alert">{state.error}</p> : null}
      {state.ok ? <p className={styles.ok} role="status">{state.ok}</p> : null}
    </form>
  );
}

function ServiceRow({ service, fields, editable, onRefresh }) {
  const [check, setCheck] = useState({ running: false, result: null });
  const [label, tone] = STATE[service.state] ?? [service.state, "muted"];
  const runCheck = async () => {
    setCheck({ running: true, result: null });
    try {
      const response = await fetch("/api/admin/ai/services", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: service.key, action: "check" }) });
      const data = await response.json().catch(() => ({}));
      setCheck({ running: false, result: data.check ?? { ok: false, detail: data.error || "Kontrol yapılamadı." } });
    } catch {
      setCheck({ running: false, result: { ok: false, detail: "Sunucuya ulaşılamadı." } });
    }
  };
  const providerQuota = check.result?.provider
    ? `OpenRouter bildirdi: kullanım ${check.result.provider.usage ?? "—"}, limit ${check.result.provider.limit ?? "yok"}, ücretsiz katman ${check.result.provider.isFreeTier ? "evet" : "hayır"}`
    : service.providerReported
      ? `Sağlayıcı bildirdi: kalan ${number(service.providerReported.remainingRequests)} istek (${time(service.providerReported.at)})`
      : "Sağlayıcının kalan kotası bilinmiyor";

  return (
    <li className={styles.service}>
      <div className={styles.serviceHead}>
        <div>
          <h3 className={styles.serviceTitle}>{service.label}</h3>
          <p className={styles.models}>{service.models.join(" · ") || "model yapılandırılmamış"}</p>
        </div>
        <span className={styles.badge} data-tone={tone}>{label}</span>
      </div>
      {service.stateReason || !service.configured ? (
        <p className={styles.reason}>{service.stateReason || `${service.configuredReason}. Değeri yalnızca sunucu ortam değişkeni olarak ekle; buraya yazılmaz.`}</p>
      ) : null}

      <div className={styles.meters}>
        <Meter label="İstek (uygulama sayacı)" used={service.used.requests} limit={service.limit.dailyRequests} />
        {service.reports.includes("tokens") ? <Meter label="Token (sağlayıcının bildirdiği gerçek değer)" used={service.used.tokens} limit={service.limit.dailyTokens} note="Rezervasyonda muhafazakâr tahmin; yanıt gelince gerçek değerle uzlaştırılır." /> : null}
        {service.category === "image" ? <Meter label="Görsel (uygulama sayacı)" used={service.used.images} limit={service.limit.dailyImages} /> : null}
      </div>

      <dl className={styles.facts}>
        <div><dt>Kalan uygulama limiti</dt><dd>{number(service.remainingApp.requests)} istek{service.category === "image" ? ` · ${number(service.remainingApp.images)} görsel` : ""}</dd></div>
        <div><dt>Sağlayıcı kotası</dt><dd>{providerQuota}</dd></div>
        <div><dt>Bu ay</dt><dd>{number(service.usedMonth.requests)} istek</dd></div>
        <div><dt>Aynı anda / deneme</dt><dd>{service.limit.maxConcurrent} iş · {service.limit.maxAttempts} deneme</dd></div>
        <div><dt>Son başarılı çağrı</dt><dd>{time(service.health.lastOkAt)}</dd></div>
        <div><dt>Son hata</dt><dd>{service.health.lastErrorKind ? `${KIND[service.health.lastErrorKind] ?? service.health.lastErrorKind} · ${time(service.health.lastErrorAt)}` : "—"}</dd></div>
        <div><dt>Görevler</dt><dd>{service.tasks.join(", ")}</dd></div>
        <div><dt>Ücret riski</dt><dd>{service.billingNote}{service.billingVerified === false ? " — ücretsiz plan onayı bekleniyor (rotasyon dışı)" : service.billingVerified ? " — ücretsiz plan onaylandı" : ""}</dd></div>
        <div><dt>Geçiş sırası</dt><dd>{service.priority ?? "—"}</dd></div>
        {service.category === "text" ? <div><dt>Türkçe testi</dt><dd>{service.turkish === "ok" ? "geçti (gerçek istek)" : service.turkish === "weak" ? "zayıf — içerik görevlerine gönderilmez" : "henüz test edilmedi"}</dd></div> : null}
      </dl>
      {service.free || service.privacy || service.terms ? (
        <details className={styles.more}>
          <summary>Ücretsiz kullanım ve veri koşulları</summary>
          {service.free ? <p>{service.free}</p> : null}
          {service.privacy ? <p>{service.privacy}</p> : null}
          {service.terms ? <p>{service.terms}</p> : null}
        </details>
      ) : null}

      <div className={styles.rowActions}>
        <button type="button" className={styles.secondary} disabled={check.running || !service.configured} onClick={runCheck}>
          {check.running ? <LoaderCircle size={16} className={styles.spin} aria-hidden="true" /> : <Activity size={16} aria-hidden="true" />}
          Erişimi kontrol et
        </button>
        <span className={styles.note}>Üretim yapmaz, kota harcamaz.</span>
      </div>
      {check.result ? (
        <p className={check.result.ok ? styles.ok : styles.error} role="status">
          {check.result.detail}
          {check.result.provider ? ` ${providerQuota}` : ""}
        </p>
      ) : null}

      <details className={styles.more}>
        <summary>Limitleri düzenle</summary>
        <LimitForm service={service} fields={fields} editable={editable} onSaved={onRefresh} />
      </details>
    </li>
  );
}

export default function AiServicesPanel({ initial }) {
  const [data, setData] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/ai/services", { cache: "no-store" });
      if (response.ok) setData(await response.json());
    } finally {
      setRefreshing(false);
    }
  };
  const groups = [
    ["Metin servisleri", data.services.filter((service) => service.category === "text")],
    ["Görsel servisleri", data.services.filter((service) => service.category === "image")],
  ];

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>AI Servisleri ve Limitler</h1>
          <p className={styles.lead}>Günlük dönem Europe/Istanbul · sıfırlanma {time(data.nextReset)} · doğrulama tarihi {data.verifiedAt}</p>
        </div>
        <button type="button" className={styles.secondary} disabled={refreshing} onClick={refresh}>
          <RefreshCw size={16} className={refreshing ? styles.spin : undefined} aria-hidden="true" /> Yenile
        </button>
      </div>

      <div className={styles.banners}>
        <p className={styles.banner} data-tone="ok">
          <ShieldCheck size={16} aria-hidden="true" /> Ücretsiz mod (FREE_ONLY) açık: ücretli modele otomatik geçiş yok. Uygulama sayacı, sağlayıcının fatura korumasının yerine geçmez.
        </p>
        <p className={styles.banner} data-tone={data.store.persistent ? "ok" : "warn"}>
          {data.store.persistent ? <ShieldCheck size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />} Depo: {data.store.mode} — {data.store.note}
        </p>
      </div>

      {data.available.text === 0 || data.available.image === 0 ? (
        <p className={styles.banner} data-tone="warn" role="status">
          <CircleAlert size={16} aria-hidden="true" />
          {data.available.text === 0 ? "Şu anda kullanılabilir ücretsiz METİN servisi yok. " : ""}
          {data.available.image === 0 ? "Şu anda kullanılabilir ücretsiz GÖRSEL servisi yok. " : ""}
          Ücretli servise geçilmez; taslaklar korunur. Limitleri, anahtarları ya da ücret onaylarını kontrol et.
        </p>
      ) : null}

      <section className={styles.neurons} aria-label="Cloudflare Neuron">
        <Meter label="Cloudflare Neuron (TAHMİN; metin + görsel ortak, UTC gününe göre)" used={Math.round(data.neurons.used)} limit={data.neurons.limit} note={`Cloudflare Neuron'u API'de bildirmez; resmî fiyatla hesaplanır. Ücretsiz üst sınır ${number(data.neurons.ceiling)}/gün.`} />
      </section>

      {groups.map(([title, list]) => (
        <section key={title} aria-label={title}>
          <h2 className={styles.groupTitle}>{title}</h2>
          <ul className={styles.services}>
            {list.map((service) => (
              <ServiceRow key={service.key} service={service} fields={data.fields} editable={data.store.editable} onRefresh={refresh} />
            ))}
          </ul>
        </section>
      ))}

      <section className={styles.neurons} aria-label="Design Arena">
        <h2 className={styles.groupTitle}>Model keşfi — Design Arena</h2>
        {!data.designArena.configured ? (
          <p className={styles.note}>
            Yapılandırılmamış. Erişim başvurusu: <a href={data.designArena.apply} target="_blank" rel="noopener noreferrer">designarena.ai/developers/apply</a>. Onaylanan anahtar sunucuya DESIGN_ARENA_API_KEY olarak eklenir. Yalnızca model sıralaması gösterilir; içerik ya da görsel üretiminde kullanılmaz.
          </p>
        ) : data.designArena.ok ? (
          <>
            <ol className={styles.plainList}>
              {data.designArena.top.map((item) => (
                <li key={item.name}>{item.name}{item.elo ? ` · ELO ${item.elo}` : ""}{item.arena ? ` · ${item.arena}` : ""}</li>
              ))}
            </ol>
            <p className={styles.note}>{data.designArena.attribution} — <a href="https://designarena.ai" target="_blank" rel="noopener noreferrer">designarena.ai</a></p>
          </>
        ) : (
          <p className={styles.error}>{data.designArena.error}</p>
        )}
      </section>

      <details className={styles.more}>
        <summary>Değerlendirilip kullanılmayan servisler</summary>
        <ul className={styles.plainList}>
          {data.excluded.map((entry) => (
            <li key={entry.name}><strong>{entry.name}:</strong> {entry.reason}</li>
          ))}
        </ul>
      </details>

      <details className={styles.more}>
        <summary>Son AI çağrıları ({data.events.length})</summary>
        <ul className={styles.events}>
          {data.events.map((event, index) => (
            <li key={`${event.at}-${index}`}>
              <span>{time(event.at)}</span>
              <span>{event.service}</span>
              <span>{event.task}</span>
              <span data-ok={event.ok || undefined}>{event.skipped ? `atlandı: ${event.skipped}` : KIND[event.kind] ?? event.kind}</span>
              <span>{event.ms ? `${(event.ms / 1000).toFixed(1)} sn` : ""}{event.fallback ? " · yedek" : ""}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
