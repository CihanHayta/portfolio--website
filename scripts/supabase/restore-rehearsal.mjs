// Geri yükleme PROVASI — geçici, izole bir PostgreSQL'de (PGlite, bellekte). Hiçbir
// Supabase projesine (canlı ya da test) YAZMAZ.
//   PGLITE_PATH=<…>/@electric-sql/pglite/dist/index.js \
//     node scripts/supabase/restore-rehearsal.mjs <yedek-klasörü> [--verify-live-files]
// 1) Supabase'e özgü en küçük taklitler (auth, storage, roller) kurulur.
// 2) supabase/migrations altındaki TÜM migration'lar sırayla uygulanır.
// 3) Yedek (tables/*.json) scripts/supabase/restore.mjs ile aynı kurallarla yüklenir.
// 4) Doğrulama: satır sayıları = manifest; her yazının slug, başlık ve İÇERİĞİ (bloklar,
//    sırası, kaynakça/tema = content.meta) birebir; kapak ilişkileri; etiket bağları;
//    içerikteki her görsel adresinin medya kaydı ve yedekte dosyası var mı;
//    --verify-live-files: yedekteki her dosyanın SHA-256'sı kaynaktaki (herkese açık)
//    dosyayla aynı mı (salt okunur indirme).
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const { PGlite } = await import(process.env.PGLITE_PATH ?? "@electric-sql/pglite");
const [dir, ...flags] = process.argv.slice(2);
if (!dir || !existsSync(join(dir, "manifest.json"))) throw new Error("Yedek klasörü (manifest.json) bulunamadı.");
const verifyLive = flags.includes("--verify-live-files");
const read = (table) => (existsSync(join(dir, "tables", `${table}.json`)) ? JSON.parse(readFileSync(join(dir, "tables", `${table}.json`), "utf8")) : []);
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
const sha = (data) => createHash("sha256").update(data).digest("hex");
let failures = 0;
const check = (ok, label) => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`);
};

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, metadata jsonb);
  alter table storage.objects enable row level security;
  create schema supabase_migrations;
  create table supabase_migrations.schema_migrations (version text primary key, name text);
`);
const migrations = readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql")).sort();
for (const name of migrations) {
  try {
    await db.exec(readFileSync(join("supabase/migrations", name), "utf8"));
    check(true, `migration uygulandı: ${name}`);
  } catch (error) {
    check(false, `migration uygulanamadı: ${name} — ${error.message.slice(0, 160)}`);
  }
}

// Yükleme (restore.mjs ile aynı kurallar: kullanıcıya bağlı alanlar boş, kategoriler yedektekiyle değişir)
const insert = async (table, rows) => {
  if (!rows.length) return;
  await db.query(`insert into public.${table} select * from json_populate_recordset(null::public.${table}, $1::json)`, [JSON.stringify(rows)]);
};
const media = read("blog_media").map((row) => ({ ...row, created_by: null }));
const posts = read("blog_posts").map((row) => ({ ...row, author_id: null }));
const sessions = read("blog_studio_sessions").map((row) => ({ ...row, updated_by: null }));
await db.exec("begin; delete from public.blog_categories;");
await insert("blog_categories", read("blog_categories"));
await insert("blog_tags", read("blog_tags"));
await insert("blog_media", media);
await insert("blog_posts", posts);
await insert("blog_post_tags", read("blog_post_tags"));
await insert("blog_slug_redirects", read("blog_slug_redirects"));
await insert("blog_studio_sessions", sessions);
await db.exec("commit;");

const count = async (table) => (await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n;
for (const table of ["blog_categories", "blog_tags", "blog_media", "blog_posts", "blog_post_tags", "blog_slug_redirects", "blog_studio_sessions"]) {
  if (!manifest.tables[table]) continue;
  const n = await count(table);
  check(n === manifest.tables[table].rows, `${table}: ${n} satır (yedek ${manifest.tables[table].rows})`);
}
const one = async (text) => (await db.query(text)).rows[0];
check((await one("select count(*)::int as n from public.blog_post_tags pt left join public.blog_posts p on p.id = pt.post_id left join public.blog_tags t on t.id = pt.tag_id where p.id is null or t.id is null")).n === 0, "etiket bağlarında sahipsiz kayıt yok");
check((await one("select count(*)::int as n from public.blog_posts p where p.cover_media_id is not null and not exists (select 1 from public.blog_media m where m.id = p.cover_media_id)")).n === 0, "her kapak bir medya kaydına bağlı");

// İçerik birebir (anahtar sırasından bağımsız): slug, başlık, bloklar ve sırası, meta.
const canonical = (value) => (Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value);
const restored = new Map((await db.query("select id, slug, title, status, published_at, content from public.blog_posts")).rows.map((row) => [row.id, row]));
const mismatched = posts.filter((post) => {
  const row = restored.get(post.id);
  return !row || row.slug !== post.slug || row.title !== post.title || row.status !== post.status || JSON.stringify(canonical(row.content)) !== JSON.stringify(canonical(post.content));
});
check(mismatched.length === 0, `${posts.length} yazının slug, başlık, durum ve içeriği (blok sırası, kaynakça, tema) birebir${mismatched.length ? ` — farklı: ${mismatched.map((post) => post.slug).join(", ")}` : ""}`);
const headingsOf = (content) => (content?.blocks ?? []).filter((block) => block.type === "heading").map((block) => block.props?.text);
check(posts.every((post) => JSON.stringify(headingsOf(restored.get(post.id)?.content)) === JSON.stringify(headingsOf(post.content))), "başlıklar ve sırası korunuyor");
const metaInfo = (list) => ({ sources: list.reduce((sum, post) => sum + (post.content?.meta?.sources?.length ?? 0), 0), waived: list.filter((post) => post.content?.meta?.sourcesWaived).length, dark: list.filter((post) => post.content?.meta?.theme === "dark").length });
check(JSON.stringify(metaInfo([...restored.values()])) === JSON.stringify(metaInfo(posts)), `kaynakça/tema özeti aynı ${JSON.stringify(metaInfo(posts))}`);

// Görsel ilişkileri ve dosyalar
const mediaUrls = new Set(media.map((row) => row.url));
const contentUrls = new Set();
for (const post of posts) for (const match of JSON.stringify(post.content).matchAll(/https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/blog-media\/[^"\\]+/g)) contentUrls.add(match[0]);
const unknown = [...contentUrls].filter((url) => !mediaUrls.has(url));
check(unknown.length === 0, `içerikteki ${contentUrls.size} görsel adresinin hepsi medya kaydında${unknown.length ? ` — eksik: ${unknown.length}` : ""}`);
const missingFiles = media.filter((row) => !existsSync(join(dir, "storage", row.storage_path)));
check(missingFiles.length === 0, `${media.length} medya kaydının dosyası yedekte var${missingFiles.length ? ` — eksik: ${missingFiles.map((row) => row.storage_path).join(", ")}` : ""}`);
if (verifyLive) {
  let same = 0;
  const diff = [];
  for (const row of media) {
    const response = await fetch(row.url, { signal: AbortSignal.timeout(30_000) });
    const remote = response.ok ? sha(Buffer.from(await response.arrayBuffer())) : null;
    const local = existsSync(join(dir, "storage", row.storage_path)) ? sha(readFileSync(join(dir, "storage", row.storage_path))) : "yok";
    if (remote === local) same += 1;
    else diff.push(row.storage_path);
  }
  check(diff.length === 0, `dosya bütünlüğü (SHA-256, kaynakla): ${same}/${media.length}${diff.length ? ` — farklı: ${diff.join(", ")}` : ""}`);
}
console.log(failures ? `\n${failures} kontrol başarısız` : "\nPROVA BAŞARILI: yedek geçici veritabanına eksiksiz geri yüklendi");
process.exitCode = failures ? 1 : 0;
