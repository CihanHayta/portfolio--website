// CANLI güvenlik kontrolleri — SALT OKUNUR. Hiçbir anahtar/değer yazdırılmaz.
//   node tests/e2e/live-security.e2e.mjs
// - Ziyaretçi (anon, herkese açık anahtar) taslakları, stüdyo oturumlarını, AI tablolarını
//   ve yönetici listesini okuyamaz; yazamaz (RLS).
// - Özel "studio-sources" kovası dışarıdan okunamaz; "blog-media" herkese açık.
// - Canlı HTML ve JavaScript paketlerinde gizli anahtar kalıbı yok (yalnızca sayı raporlanır).
// - Yönetim API'leri oturumsuz istekleri reddeder.
import { createClient } from "@supabase/supabase-js";
import { linkedProject, projectKeys } from "../../scripts/supabase/_api.mjs";

const base = process.env.BASE_URL ?? "https://personadijitalpazarlama.com";
const results = [];
const check = (ok, label, note = "") => {
  results.push(ok);
  console.log(`  ${ok ? "PASS" : "FAIL"}       ${label}${note ? ` — ${note}` : ""}`);
};
const keys = await projectKeys(linkedProject().ref);
const anon = createClient(keys.url, keys.anon, { auth: { persistSession: false } });

// RLS: ziyaretçi
const drafts = await anon.from("blog_posts").select("id").eq("status", "draft");
check(!drafts.error && drafts.data.length === 0, "RLS: ziyaretçi taslak yazı göremez", `${drafts.data?.length ?? "hata"} satır`);
const published = await anon.from("blog_posts").select("id").eq("status", "published");
check(!published.error && published.data.length >= 1, "RLS: ziyaretçi yayımlanmış yazıyı görür");
for (const table of ["blog_studio_sessions", "blog_admins", "ai_jobs", "ai_usage_counters", "ai_usage_events", "ai_limit_overrides"]) {
  const result = await anon.from(table).select("*").limit(1);
  check(Boolean(result.error) || result.data.length === 0, `RLS: ziyaretçi ${table} okuyamaz`, result.error ? `reddedildi (${result.error.code})` : "0 satır");
}
const write = await anon.from("blog_posts").insert({ title: "anon yazma denemesi", slug: `anon-${Date.now()}` });
check(Boolean(write.error), "RLS: ziyaretçi yazı ekleyemez", write.error?.code ?? "EKLEDİ!");
const sessionWrite = await anon.from("blog_studio_sessions").insert({ post_id: "00000000-0000-4000-8000-000000000000", data: {} });
check(Boolean(sessionWrite.error), "RLS: ziyaretçi stüdyo oturumu yazamaz", sessionWrite.error?.code ?? "YAZDI!");

// Storage
const privateList = await anon.storage.from("studio-sources").list("", { limit: 1 });
check(Boolean(privateList.error) || privateList.data.length === 0, "Storage: özel studio-sources kovası ziyaretçiye listelenmez");
const privatePublicUrl = await fetch(`${keys.url}/storage/v1/object/public/studio-sources/deneme.png`);
check(privatePublicUrl.status >= 400, "Storage: studio-sources herkese açık adresle okunamaz", `HTTP ${privatePublicUrl.status}`);
const upload = await anon.storage.from("blog-media").upload(`anon-${Date.now()}.webp`, new Uint8Array([1, 2, 3]), { contentType: "image/webp" });
check(Boolean(upload.error), "Storage: ziyaretçi blog-media'ya yükleyemez", upload.error ? "reddedildi" : "YÜKLEDİ!");

// Canlı HTML + JS paketlerinde gizli anahtar kalıbı
const pages = ["/", "/blog", "/admin/login"];
const scripts = new Set();
let scanned = 0;
const patterns = [
  ["Google API anahtarı", /AIza[0-9A-Za-z_-]{35}/g],
  ["OpenAI/benzeri gizli anahtar", /\bsk-[A-Za-z0-9_-]{20,}/g],
  ["service_role JWT", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*c2VydmljZV9yb2xl[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+/g],
  ["Supabase gizli anahtarı", /sb_secret_[A-Za-z0-9_-]{10,}/g],
  ["Jina/Firecrawl anahtarı", /\b(jina_[A-Za-z0-9]{20,}|fc-[a-f0-9]{24,})/g],
];
const hits = {};
const scan = (text) => {
  scanned += 1;
  for (const [name, pattern] of patterns) {
    const count = (text.match(pattern) ?? []).length;
    if (count) hits[name] = (hits[name] ?? 0) + count;
  }
  if (text.includes(keys.serviceRole)) hits["canlı service-role anahtarının kendisi"] = (hits["canlı service-role anahtarının kendisi"] ?? 0) + 1;
};
for (const path of pages) {
  const html = await (await fetch(base + path)).text();
  scan(html);
  for (const match of html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)) scripts.add(match[1]);
}
for (const src of scripts) scan(await (await fetch(base + src)).text());
check(Object.keys(hits).length === 0, `Tarayıcıya giden ${scanned} dosyada gizli anahtar kalıbı yok`, Object.keys(hits).length ? Object.entries(hits).map(([name, count]) => `${name}: ${count}`).join(", ") : "");

// Yönetim API'leri oturumsuz
for (const [method, path] of [["GET", "/api/admin/media?folder=maskot"], ["GET", "/api/admin/media?coverUse=00000000-0000-4000-8000-000000000000"], ["GET", "/api/admin/studio/session?postId=00000000-0000-4000-8000-000000000000"], ["POST", "/api/admin/ai/source"], ["POST", "/api/admin/ai/template"], ["POST", "/api/admin/ai/visual-plan"], ["GET", "/api/admin/ai/services"]]) {
  const response = await fetch(base + path, { method, headers: method === "POST" ? { "content-type": "application/json", origin: base } : {}, body: method === "POST" ? "{}" : undefined, redirect: "manual" });
  check([401, 403, 307, 308].includes(response.status), `Oturumsuz ${method} ${path.split("?")[0]} reddedildi`, `HTTP ${response.status}`);
}
const headers = (await fetch(`${base}/blog`)).headers;
check(headers.get("x-content-type-options") === "nosniff" && Boolean(headers.get("referrer-policy")) && /frame-ancestors/.test(headers.get("content-security-policy") ?? ""), "Güvenlik başlıkları gönderiliyor");
console.log(`\nÖZET ${results.filter(Boolean).length}/${results.length} geçti`);
process.exitCode = results.every(Boolean) ? 0 : 1;
