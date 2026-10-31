// Blog veritabanının mantıksal yedeği (SALT OKUNUR).
// Kullanım: node scripts/supabase/backup.mjs [hedef-klasör] [--ref <proje>]
// Varsayılan proje: supabase/.temp/project-ref (bağlı canlı proje).
// Çıktı: tablolar/*.json, storage/<yol> (görsel dosyaları), manifest.json (sayılar + sha256).
// Ücretsiz Supabase planında otomatik yedek olmadığı için migration öncesi zorunludur.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { linkedProject, sql } from "./_api.mjs";

const args = process.argv.slice(2);
const refFlag = args.indexOf("--ref");
const ref = refFlag >= 0 ? args[refFlag + 1] : linkedProject().ref;
const out = args.find((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--ref") ?? `backups/${new Date().toISOString().slice(0, 10)}`;
const TABLES = ["blog_admins", "blog_categories", "blog_tags", "blog_media", "blog_posts", "blog_post_tags", "blog_slug_redirects", "blog_studio_sessions"];
const AI_TABLES = ["ai_limit_overrides", "ai_usage_counters", "ai_jobs", "ai_usage_events"];
const sha = (data) => createHash("sha256").update(data).digest("hex");

mkdirSync(join(out, "tables"), { recursive: true });
const manifest = { createdAt: new Date().toISOString(), project: ref.slice(0, 6) + "…", tables: {}, storage: { files: 0, bytes: 0, failed: [] }, migrations: [] };

const existing = (await sql(ref, "select table_name from information_schema.tables where table_schema = 'public'")).map((row) => row.table_name);
for (const table of [...TABLES, ...AI_TABLES].filter((name) => existing.includes(name))) {
  const [row] = await sql(ref, `select coalesce(json_agg(t), '[]'::json) as rows from public.${table} t`);
  const body = JSON.stringify(row.rows, null, 1);
  writeFileSync(join(out, "tables", `${table}.json`), body);
  manifest.tables[table] = { rows: row.rows.length, sha256: sha(body) };
}
manifest.migrations = (await sql(ref, "select version, name from supabase_migrations.schema_migrations order by version")).map((row) => `${row.version}_${row.name}`);

// Storage meta verisi (tüm kovalar): hangi dosyanın hangi kovada olduğu ve boyutu.
// Özel "studio-sources" kovasındaki ekran görüntülerinin DOSYALARI yedeğe girmez
// (yalnızca analiz girdisi; yayımlanmaz); listeleri burada kayıtlıdır.
const objects = await sql(ref, "select bucket_id, name, (metadata->>'size')::bigint as size, created_at from storage.objects order by bucket_id, name");
writeFileSync(join(out, "tables", "storage_objects.json"), JSON.stringify(objects, null, 1));
manifest.storageObjects = objects.reduce((acc, row) => ({ ...acc, [row.bucket_id]: (acc[row.bucket_id] ?? 0) + 1 }), {});

// Görsel dosyaları: kova herkese açık okunur; medya kayıtlarındaki URL'lerden indirilir.
const media = JSON.parse(JSON.stringify((await sql(ref, "select storage_path, url from public.blog_media"))));
for (const item of media) {
  try {
    const response = await fetch(item.url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const path = join(out, "storage", item.storage_path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    manifest.storage.files += 1;
    manifest.storage.bytes += bytes.length;
  } catch (error) {
    manifest.storage.failed.push({ path: item.storage_path, error: error.message });
  }
}

writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ out, tables: Object.fromEntries(Object.entries(manifest.tables).map(([name, info]) => [name, info.rows])), storage: manifest.storage, migrations: manifest.migrations }, null, 1));
