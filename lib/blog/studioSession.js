// AI Blog Stüdyosu oturumu: taslağa (blog_posts.id) bağlı kalıcı çalışma durumu.
// blog_studio_sessions.data alanına yazılır; sayfa yenilenince, editörden çıkıp
// dönünce ya da başka cihazda buradan yüklenir. Tarayıcı belleği tek kaynak değildir.
//
// Yalnızca bilinen alanlar ve sınırlı uzunluklar kabul edilir. Geçici tarayıcı
// adresleri (blob:) ve gömülü görsel verisi (data:) ASLA saklanmaz: görsellerin
// kendisi Storage'da, burada yalnızca kalıcı adres/kimlik ve seçim durumu durur.

export const SESSION_VERSION = 1;
export const MAX_SESSION_BYTES = 900_000;
export const IMAGE_KINDS = ["source", "upload", "ai", "handoff"];
// idle: listede · candidate: AI/ChatGPT sonucu, onay bekliyor · archived: medya kütüphanesinde
// placed: yazıya eklendi · cover: kapak · rejected: reddedildi · failed: işlem başarısız.
// "selected" eski kayıtlardan gelir; seçim artık ayrı `selected` alanıdır.
export const IMAGE_STATES = ["idle", "candidate", "archived", "placed", "cover", "rejected", "failed", "selected"];
export const IMAGE_MODES = ["text", "reference", "described", "handoff"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHOT_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/i;
const TARGET = /^(cover|intro|gallery|end|block:[\w-]{1,64})$/;

const str = (value, max) => (typeof value === "string" ? value.slice(0, max) : "");
const num = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.round(Number(value)) : null);
const httpUrl = (value) => (typeof value === "string" && /^https?:\/\//i.test(value) ? value.slice(0, 2000) : "");
const key = (value, max = 80) => (typeof value === "string" ? value.replace(/[^\w:.\-]/g, "").slice(0, max) : "");
const oneOf = (value, list, fallback = null) => (list.includes(value) ? value : fallback);
const list = (value, max) => (Array.isArray(value) ? value.slice(0, max) : []);

export const isTarget = (value) => typeof value === "string" && TARGET.test(value);
export const isShotPath = (value) => typeof value === "string" && SHOT_PATH.test(value);

function sanitizeImage(item) {
  if (!item || typeof item !== "object") return null;
  const kind = oneOf(item.kind, IMAGE_KINDS);
  const id = key(item.id);
  if (!kind || !id) return null;
  const out = {
    id,
    kind,
    state: oneOf(item.state, IMAGE_STATES, "idle"),
    // Seçim, yazıya yerleşmiş olmaktan ayrı tutulur (yerleşen görsel yeniden seçilebilir).
    selected: item.selected === true || item.state === "selected",
    alt: str(item.alt, 300),
    target: isTarget(item.target) ? item.target : null,
  };
  const src = httpUrl(item.src);
  if (src) out.src = src;
  if (UUID.test(String(item.mediaId ?? ""))) out.mediaId = String(item.mediaId);
  const url = httpUrl(item.url);
  if (url) out.url = url;
  const width = num(item.width);
  const height = num(item.height);
  if (width && height) Object.assign(out, { width, height });
  if (item.provider) out.provider = str(item.provider, 60);
  if (item.model) out.model = str(item.model, 160);
  if (item.mode) out.mode = oneOf(item.mode, IMAGE_MODES, "text");
  if (item.referenceId) out.referenceId = key(item.referenceId);
  if (item.section) out.section = str(item.section, 160);
  if (item.role) out.role = item.role === "og" ? "og" : "content";
  if (item.error) out.error = str(item.error, 300);
  return out;
}

function sanitizeSource(source) {
  if (!source || typeof source !== "object") return null;
  const url = httpUrl(source.url);
  const text = str(source.text, 40_000);
  if (!url && !text) return null;
  return {
    url,
    title: str(source.title, 300),
    provider: key(source.provider, 40),
    wordCount: num(source.wordCount) ?? 0,
    truncated: Boolean(source.truncated),
    missingFrom: str(source.missingFrom, 200),
    text,
    images: list(source.images, 40)
      .map((image) => ({ src: httpUrl(image?.src), alt: str(image?.alt, 300), section: str(image?.section, 160), role: image?.role === "og" ? "og" : "content" }))
      .filter((image) => image.src),
  };
}

export function sanitizeSession(input) {
  const value = input && typeof input === "object" ? input : {};
  const brief = value.brief && typeof value.brief === "object" ? value.brief : {};
  const out = {
    version: SESSION_VERSION,
    url: httpUrl(value.url),
    notes: str(value.notes, 20_000),
    method: key(value.method, 40) || "auto",
    templateChoice: key(value.templateChoice, 60) || "auto",
    plan: value.plan && typeof value.plan === "object"
      ? { key: key(value.plan.key, 60) || null, current: Boolean(value.plan.current), label: str(value.plan.label, 120), reason: str(value.plan.reason, 300), by: key(value.plan.by, 20) }
      : null,
    brief: Object.fromEntries(["topic", "keyword", "audience", "goal", "tone", "cta", "length"].map((name) => [name, str(brief[name], 300)])),
    approaches: list(value.approaches, 3).map((item) => key(item, 40)).filter(Boolean),
    similar: {
      decision: key(value.similar?.decision, 20),
      selectedIds: list(value.similar?.selectedIds, 5).filter((id) => UUID.test(String(id))),
      skipArchive: value.similar?.skipArchive === true,
    },
    source: sanitizeSource(value.source),
    shots: list(value.shots, 8)
      .filter((shot) => isShotPath(shot?.path))
      .map((shot) => ({ id: key(shot.id) || shot.path, path: shot.path, name: str(shot.name, 120), width: num(shot.width), height: num(shot.height) })),
    shotSource: value.shotSource && typeof value.shotSource === "object"
      ? { text: str(value.shotSource.text, 40_000), title: str(value.shotSource.title, 300), wordCount: num(value.shotSource.wordCount) ?? 0 }
      : null,
    images: list(value.images, 60).map(sanitizeImage).filter(Boolean),
    phase: key(value.phase, 20),
    draft: value.draft && typeof value.draft === "object" ? value.draft : null,
  };
  // Taslak sonucu büyükse önce o atılır (kaynaklar ve seçimler korunur).
  if (JSON.stringify(out).length > MAX_SESSION_BYTES) out.draft = null;
  if (JSON.stringify(out).length > MAX_SESSION_BYTES) out.source = out.source ? { ...out.source, text: out.source.text.slice(0, 10_000) } : null;
  // Gömülü veri ya da geçici adres hiçbir alanda kalmaz.
  const text = JSON.stringify(out);
  if (/"(blob:|data:image)/.test(text)) return JSON.parse(text.replace(/"(blob:|data:image)[^"]*"/g, '""'));
  return out;
}
