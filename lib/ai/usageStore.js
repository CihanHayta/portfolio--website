// AI kullanım sayaçları, eşzamanlı iş kilitleri, admin limitleri ve güvenli
// kullanım kaydı. Tek arayüz, üç arka uç:
//
//  - "file"     : yerel geliştirme (varsayılan, Vercel dışında). .data/ai-usage.json
//                 dosyasında kalıcıdır: sayfa yenilense ya da sunucu yeniden
//                 başlasa da sayaçlar korunur. Tek süreç içinde atomiktir.
//  - "supabase" : canlı ortam için kalıcı ve örnekler arası atomik depo.
//                 supabase/migrations/20261023000000_ai_usage_jobs.sql (canlıya
//                 2026-10-24'te uygulandı) + AI_USAGE_STORE=supabase ile etkinleşir.
//  - "memory"   : testler ve migration'sız canlı ortam. KALICI DEĞİLDİR; panel bunu
//                 açıkça gösterir ve limit düzenlemeyi kapatır.
//
// Atomiklik (file/memory): kontrol ve güncelleme araya `await` girmeden aynı
// senkron adımda yapılır; JavaScript tek iş parçacıklı olduğu için eşzamanlı iki
// istek aynı ücretsiz hakkı iki kez kullanamaz.
//
// Kayıtlara asla istem, yanıt metni, API anahtarı ya da oturum çerezi yazılmaz.

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { SERVICES, SHARED_NEURONS, effectiveLimits, limitDay, limitWindow, sanitizeNeuronBudget, sanitizeOverride, utcDay } from "./limits.js";

const EVENT_LIMIT = 400;
const KEEP_DAYS = 35;
const LEASE_TTL_MS = 3 * 60_000;
const JOB_LIMIT = 200;
export const JOB_STATUSES = ["queued", "running", "retrying", "completed", "failed", "cancelled"];

// Uygulama limit günü (Europe/Istanbul).
export const dayKey = limitDay;

export function storeMode(env = process.env) {
  const requested = env.AI_USAGE_STORE;
  if (requested === "supabase" || requested === "memory" || requested === "file") return requested;
  return env.VERCEL ? "memory" : "file";
}

const emptyState = () => ({ version: 1, overrides: {}, counters: {}, neurons: {}, events: [], health: {}, jobs: {} });
const EMPTY_USAGE = () => ({ requests: 0, tokens: 0, images: 0 });

// --- Süreç içi durum (file + memory) ------------------------------------------------
function createLocalStore({ mode, filePath, now = Date.now }) {
  let state = null;
  let writing = Promise.resolve();
  const leases = new Map(); // key → Map(leaseId → expiresAt)

  const load = () => {
    if (state) return state;
    state = emptyState();
    if (mode === "file") {
      try {
        const saved = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (saved?.version === 1) state = { ...emptyState(), ...saved };
      } catch {
        // dosya yok ya da bozuk: boş durumla başlanır
      }
    }
    return state;
  };

  const prune = () => {
    const cutoff = dayKey(now() - KEEP_DAYS * 86_400_000);
    for (const day of Object.keys(state.counters)) if (day < cutoff) delete state.counters[day];
    for (const day of Object.keys(state.neurons)) if (day < cutoff) delete state.neurons[day];
    if (state.events.length > EVENT_LIMIT) state.events.splice(0, state.events.length - EVENT_LIMIT);
  };

  // Yazmalar sıraya girer; dosya önce geçici adla yazılıp yeniden adlandırılır.
  const persist = () => {
    if (mode !== "file") return Promise.resolve();
    prune();
    const snapshot = JSON.stringify(state);
    writing = writing.then(async () => {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      const temp = `${filePath}.${process.pid}.tmp`;
      await fs.promises.writeFile(temp, snapshot);
      await fs.promises.rename(temp, filePath);
    }).catch(() => {});
    return writing;
  };

  const usageFor = (key, day) => (load().counters[day]?.[key] ? { ...state.counters[day][key] } : EMPTY_USAGE());

  return {
    mode,
    persistent: mode === "file",

    async getOverrides() {
      return structuredClone(load().overrides);
    },
    async limits() {
      return effectiveLimits(load().overrides);
    },
    async setOverride(key, values) {
      load();
      if (key === SHARED_NEURONS.key) {
        const value = sanitizeNeuronBudget(values?.dailyNeurons);
        if (value === null) return null;
        state.overrides[key] = { dailyNeurons: value };
      } else {
        const clean = sanitizeOverride(key, values);
        if (!clean) return null;
        state.overrides[key] = { ...(state.overrides[key] ?? {}), ...clean };
      }
      await persist();
      return effectiveLimits(state.overrides);
    },

    // Atomik "ya hepsi ya hiçbiri" rezervasyonu. `amounts`: { requests, tokens, images, neurons }.
    async reserve(key, amounts) {
      load();
      const day = dayKey(now());
      const limits = effectiveLimits(state.overrides);
      const limit = limits[key];
      if (!limit) return { ok: false, blockedBy: "unknown" };
      if (!limit.enabled) return { ok: false, blockedBy: "disabled" };
      const used = usageFor(key, day);
      const checks = [
        ["requests", amounts.requests ?? 0, limit.dailyRequests],
        ["tokens", amounts.tokens ?? 0, limit.dailyTokens],
        ["images", amounts.images ?? 0, limit.dailyImages],
      ];
      for (const [metric, amount, max] of checks) {
        if (amount > 0 && typeof max === "number" && used[metric] + amount > max) return { ok: false, blockedBy: metric, used, limit };
      }
      const neurons = amounts.neurons ?? 0;
      const neuronDay = utcDay(now());
      const neuronsUsed = state.neurons[neuronDay] ?? 0;
      if (neurons > 0 && neuronsUsed + neurons > limits[SHARED_NEURONS.key].dailyNeurons) return { ok: false, blockedBy: "neurons", used, limit };

      state.counters[day] ??= {};
      state.counters[day][key] = { requests: used.requests + (amounts.requests ?? 0), tokens: used.tokens + (amounts.tokens ?? 0), images: used.images + (amounts.images ?? 0) };
      if (neurons > 0) state.neurons[neuronDay] = neuronsUsed + neurons;
      await persist();
      return { ok: true, used: state.counters[day][key], limit };
    },

    // Gerçek kullanım tahminden farklıysa düzeltme (limit uygulanmaz, sıfırın altına inmez).
    async settle(key, deltas) {
      load();
      const day = dayKey(now());
      const used = usageFor(key, day);
      state.counters[day] ??= {};
      state.counters[day][key] = {
        requests: used.requests,
        tokens: Math.max(0, used.tokens + (deltas.tokens ?? 0)),
        images: Math.max(0, used.images + (deltas.images ?? 0)),
      };
      if (deltas.neurons) {
        const neuronDay = utcDay(now());
        state.neurons[neuronDay] = Math.max(0, (state.neurons[neuronDay] ?? 0) + deltas.neurons);
      }
      await persist();
    },

    // Aynı anda çalışan iş sınırı. Kilitler süre aşımıyla kendiliğinden düşer.
    async acquire(key, max) {
      const map = leases.get(key) ?? new Map();
      for (const [id, expires] of map) if (expires <= now()) map.delete(id);
      if (map.size >= max) return { ok: false, active: map.size };
      const id = randomUUID();
      map.set(id, now() + LEASE_TTL_MS);
      leases.set(key, map);
      return { ok: true, lease: id, active: map.size };
    },
    async release(key, lease) {
      leases.get(key)?.delete(lease);
    },

    async record(event) {
      load();
      state.events.push(event);
      if (!event.skipped && event.service) {
        const entry = state.health[event.service] ?? {};
        if (event.ok) entry.lastOkAt = event.at;
        else {
          entry.lastErrorAt = event.at;
          entry.lastErrorKind = event.kind;
        }
        state.health[event.service] = entry;
      }
      await persist();
    },
    async noteHealth(service, values) {
      load();
      state.health[service] = { ...(state.health[service] ?? {}), ...values };
      await persist();
    },

    // İş kaydı: aynı idempotency anahtarıyla ikinci iş açılmaz.
    async beginJob(key, kind, meta = {}) {
      load();
      const existing = state.jobs[key];
      if (existing && ["queued", "running", "retrying", "completed"].includes(existing.status)) return { job: structuredClone(existing), created: false };
      const at = new Date(now()).toISOString();
      state.jobs[key] = { key, kind, status: "running", stage: meta.stage ?? null, attempts: (existing?.attempts ?? 0) + 1, createdAt: existing?.createdAt ?? at, updatedAt: at, ...(meta.postId ? { postId: meta.postId } : {}) };
      const keys = Object.keys(state.jobs);
      if (keys.length > JOB_LIMIT) for (const old of keys.slice(0, keys.length - JOB_LIMIT)) delete state.jobs[old];
      await persist();
      return { job: structuredClone(state.jobs[key]), created: true };
    },
    async updateJob(key, patch) {
      load();
      const job = state.jobs[key];
      if (!job) return null;
      if (patch.status && !JOB_STATUSES.includes(patch.status)) return null;
      Object.assign(job, patch, { updatedAt: new Date(now()).toISOString() });
      await persist();
      return structuredClone(job);
    },
    async getJob(key) {
      load();
      return state.jobs[key] ? structuredClone(state.jobs[key]) : null;
    },

    async snapshot() {
      load();
      const day = dayKey(now());
      const month = day.slice(0, 7);
      const monthTotals = {};
      for (const [date, rows] of Object.entries(state.counters)) {
        if (!date.startsWith(month)) continue;
        for (const [key, usage] of Object.entries(rows)) {
          const total = (monthTotals[key] ??= EMPTY_USAGE());
          total.requests += usage.requests;
          total.tokens += usage.tokens;
          total.images += usage.images;
        }
      }
      const active = {};
      for (const [key, map] of leases) active[key] = [...map.values()].filter((expires) => expires > now()).length;
      return {
        mode,
        persistent: mode === "file",
        day,
        today: structuredClone(state.counters[day] ?? {}),
        month: monthTotals,
        neuronsToday: state.neurons[utcDay(now())] ?? 0,
        window: limitWindow(now()),
        active,
        health: structuredClone(state.health),
        events: state.events.slice(-60).reverse(),
        limits: effectiveLimits(state.overrides),
      };
    },

    flush: () => writing,
  };
}

// --- Supabase (migration sonrası) -----------------------------------------------------
function createSupabaseStore({ db, now = Date.now }) {
  const rpc = async (name, args) => {
    const { data, error } = await db.rpc(name, args);
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  };
  const overrides = async () => {
    const { data, error } = await db.from("ai_limit_overrides").select("key, values");
    if (error) throw error;
    return Object.fromEntries((data ?? []).map((row) => [row.key, row.values]));
  };
  return {
    mode: "supabase",
    persistent: true,
    getOverrides: overrides,
    async limits() {
      return effectiveLimits(await overrides());
    },
    async setOverride(key, values) {
      const clean = key === SHARED_NEURONS.key ? { dailyNeurons: sanitizeNeuronBudget(values?.dailyNeurons) } : sanitizeOverride(key, values);
      if (!clean || Object.values(clean).some((value) => value === null)) return null;
      const current = await overrides();
      const { error } = await db.from("ai_limit_overrides").upsert({ key, values: { ...(current[key] ?? {}), ...clean }, updated_at: new Date(now()).toISOString() });
      if (error) throw error;
      return effectiveLimits({ ...current, [key]: { ...(current[key] ?? {}), ...clean } });
    },
    async reserve(key, amounts) {
      const limits = effectiveLimits(await overrides());
      const limit = limits[key];
      if (!limit) return { ok: false, blockedBy: "unknown" };
      if (!limit.enabled) return { ok: false, blockedBy: "disabled" };
      try {
        const row = await rpc("ai_reserve", {
          p_key: key,
          p_day: limitDay(now()),
          p_neuron_day: utcDay(now()),
          p_requests: amounts.requests ?? 0,
          p_tokens: amounts.tokens ?? 0,
          p_images: amounts.images ?? 0,
          p_neurons: amounts.neurons ?? 0,
          p_max_requests: limit.dailyRequests ?? null,
          p_max_tokens: limit.dailyTokens ?? null,
          p_max_images: limit.dailyImages ?? null,
          p_max_neurons: limits[SHARED_NEURONS.key].dailyNeurons,
        });
        return { ok: Boolean(row?.ok), blockedBy: row?.blocked_by ?? null, limit };
      } catch {
        // Depo hatasında güvenli taraf: istek yapılmaz.
        return { ok: false, blockedBy: "store" };
      }
    },
    async settle(key, deltas) {
      await rpc("ai_settle", { p_key: key, p_day: limitDay(now()), p_neuron_day: utcDay(now()), p_tokens: deltas.tokens ?? 0, p_images: deltas.images ?? 0, p_neurons: deltas.neurons ?? 0 }).catch(() => {});
    },
    async acquire(key, max) {
      try {
        const row = await rpc("ai_acquire", { p_key: key, p_max: max, p_ttl_seconds: LEASE_TTL_MS / 1000 });
        return row?.lease ? { ok: true, lease: row.lease } : { ok: false };
      } catch {
        return { ok: false };
      }
    },
    async release(key, lease) {
      await db.from("ai_leases").delete().eq("id", lease).then(() => {}, () => {});
    },
    async record(event) {
      await db
        .from("ai_usage_events")
        .insert({ op_id: event.opId ?? null, service: event.service, task: event.task, provider: event.provider, model: event.model ?? null, ok: Boolean(event.ok), kind: event.kind, input_tokens: event.inputTokens ?? null, output_tokens: event.outputTokens ?? null, images: event.images ?? 0, neurons_estimate: event.neuronsEstimate ?? null, latency_ms: event.ms ?? null, attempt: event.attempt ?? null, fallback: Boolean(event.fallback), skipped: event.skipped ?? null })
        .then(() => {}, () => {});
    },
    async noteHealth() {},
    async beginJob(key, kind, meta = {}) {
      const row = await rpc("ai_begin_job", { p_key: key, p_kind: kind, p_post_id: meta.postId ?? null, p_stage: meta.stage ?? null });
      return { job: row?.job ?? null, created: Boolean(row?.created) };
    },
    async updateJob(key, patch) {
      const { data, error } = await db
        .from("ai_jobs")
        .update({ ...(patch.status ? { status: patch.status } : {}), ...(patch.stage !== undefined ? { stage: patch.stage } : {}), ...(patch.errorKind !== undefined ? { error_kind: patch.errorKind } : {}), ...(patch.result !== undefined ? { result: patch.result } : {}), updated_at: new Date(now()).toISOString() })
        .eq("idempotency_key", key)
        .select("idempotency_key, kind, status, stage, attempts, error_kind, created_at, updated_at")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async getJob(key) {
      const { data } = await db.from("ai_jobs").select("idempotency_key, kind, status, stage, attempts, error_kind, result, created_at, updated_at").eq("idempotency_key", key).maybeSingle();
      return data ?? null;
    },
    async snapshot() {
      const day = dayKey(now());
      const [{ data: counters }, { data: events }, limits] = await Promise.all([
        db.from("ai_usage_counters").select("key, day, requests, tokens, images, neurons").gte("day", `${day.slice(0, 7)}-01`),
        db.from("ai_usage_events").select("created_at, service, task, provider, model, ok, kind, latency_ms, input_tokens, output_tokens, images, neurons_estimate, fallback, skipped").order("created_at", { ascending: false }).limit(60),
        this.limits(),
      ]);
      const today = {};
      const month = {};
      let neuronsToday = 0;
      for (const row of counters ?? []) {
        if (row.key === SHARED_NEURONS.key) {
          if (row.day === utcDay(now())) neuronsToday = Number(row.neurons);
          continue;
        }
        const usage = { requests: Number(row.requests), tokens: Number(row.tokens), images: Number(row.images) };
        if (row.day === day) today[row.key] = usage;
        const total = (month[row.key] ??= EMPTY_USAGE());
        total.requests += usage.requests;
        total.tokens += usage.tokens;
        total.images += usage.images;
      }
      const health = {};
      for (const event of [...(events ?? [])].reverse()) {
        if (event.skipped) continue;
        const entry = (health[event.service] ??= {});
        if (event.ok) entry.lastOkAt = event.created_at;
        else {
          entry.lastErrorAt = event.created_at;
          entry.lastErrorKind = event.kind;
        }
      }
      return {
        mode: "supabase",
        persistent: true,
        day,
        today,
        month,
        neuronsToday,
        window: limitWindow(now()),
        active: {},
        health,
        events: (events ?? []).map((event) => ({ at: event.created_at, service: event.service, task: event.task, provider: event.provider, model: event.model, ok: event.ok, kind: event.kind, ms: event.latency_ms, inputTokens: event.input_tokens, outputTokens: event.output_tokens, images: event.images, neuronsEstimate: event.neurons_estimate, fallback: event.fallback, skipped: event.skipped })),
        limits,
      };
    },
    flush: () => Promise.resolve(),
  };
}

// --- Seçim ------------------------------------------------------------------------------
const localStores = new Map();
export function getUsageStore({ env = process.env, db = null, now = Date.now } = {}) {
  const mode = storeMode(env);
  if (mode === "supabase" && db) return createSupabaseStore({ db, now });
  const effective = mode === "supabase" ? "memory" : mode; // db yoksa güvenli geri dönüş
  const filePath = env.AI_USAGE_FILE || path.join(/*turbopackIgnore: true*/ process.cwd(), ".data", "ai-usage.json");
  const cacheKey = `${effective}|${filePath}`;
  if (!localStores.has(cacheKey)) localStores.set(cacheKey, createLocalStore({ mode: effective, filePath, now }));
  return localStores.get(cacheKey);
}

// Testler için: yalıtılmış depo.
export function createTestStore(options = {}) {
  const store = createLocalStore({ mode: options.filePath ? "file" : "memory", ...options });
  // Bellek deposunda atama eşzamanlıdır; testler başlangıç limitlerini böyle verir.
  for (const [key, values] of Object.entries(options.overrides ?? {})) store.setOverride(key, values);
  return store;
}
export const resetUsageStores = () => localStores.clear();

const SAFE_FIELDS = ["service", "task", "provider", "model", "ok", "kind", "ms", "attempt", "fallback", "mode", "opId", "inputTokens", "outputTokens", "images", "neuronsEstimate", "rateLimited", "detail", "skipped", "remaining"];

// Olay kaydı: yalnızca güvenli alanlar.
export function safeEvent(event, now = Date.now()) {
  const safe = { at: new Date(now).toISOString() };
  for (const field of SAFE_FIELDS) if (event[field] !== undefined && event[field] !== null) safe[field] = event[field];
  if (typeof safe.detail === "string") safe.detail = safe.detail.slice(0, 120);
  if (typeof safe.skipped === "string") safe.skipped = safe.skipped.slice(0, 160);
  return safe;
}

// --- Ücret koruması -------------------------------------------------------------------
// Canlı ortamda kalıcı ve atomik depo yokken, hesap ayarına göre ücret
// oluşturabilecek sağlayıcılar (billing: "account") çağrılmaz.
export function billingGuard(service, store, env = process.env, limits = null) {
  const info = SERVICES[service];
  if (!info) return { allowed: false, reason: "Bilinmeyen servis." };
  // Hesap ayarına göre ücret çıkabilecek servis, hesabın ücretsiz planda olduğu
  // doğrulanmadan otomatik rotasyona girmez.
  if (info.billing === "account" && limits && limits[service]?.billingVerified !== true) {
    return { allowed: false, reason: "Ücret riski doğrulanmadı: hesabın ücretsiz planda (faturalandırma kapalı) olduğunu AI Servisleri ekranında onayla." };
  }
  const production = env.VERCEL_ENV === "production" || env.AI_ENFORCE_PERSISTENT_LIMITS === "1";
  // Dosya deposu tek süreçlidir; çok örnekli canlı ortamda atomik sayılmaz.
  if (production && store.mode !== "supabase" && info.billing !== "none") {
    return { allowed: false, reason: "Canlı ortamda kalıcı limit deposu etkin değil; ücret riski taşıyan bu servis durduruldu (migration gerekli)." };
  }
  return { allowed: true, reason: "" };
}
