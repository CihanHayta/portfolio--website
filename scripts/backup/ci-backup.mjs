// Otomatik yedek (GitHub Actions; yerelde de çalışır). SALT OKUNUR.
//   BACKUP_DB_URL=… SUPABASE_URL=… node scripts/backup/ci-backup.mjs <çıktı-klasörü>
// - Veritabanına persona_backup (salt okunur) rolüyle psql üzerinden bağlanır.
// - public şemasındaki TÜM tablolar tables/<tablo>.json (satır dizisi) olarak yazılır;
//   biçim scripts/supabase/restore.mjs ile uyumludur.
// - blog-media kovasındaki TÜM dosyalar (yalnızca medya kaydı olanlar değil) herkese
//   açık adresten indirilir, boyutları Storage kaydıyla karşılaştırılır: storage/<yol>.
// - manifest.json: satır sayıları, her tablonun ve dosyanın sha256 özeti, migration geçmişi.
// - Günlüğe yalnızca sayılar yazılır; içerik ve bağlantı adresi yazılmaz.
// - Bir dosya inmezse ya da blog_posts boş gelirse çıkış kodu 1'dir (iş başarısız sayılır).

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const out = process.argv[2];
const { BACKUP_DB_URL: dbUrl, SUPABASE_URL: supabaseUrl } = process.env;
if (!out || !dbUrl || !supabaseUrl) throw new Error("Kullanım: BACKUP_DB_URL ve SUPABASE_URL ile: ci-backup.mjs <klasör>");

// Bağlantı adresindeki şifre psql'e ortam değişkeniyle verilir (süreç listesinde görünmez).
const parsed = new URL(dbUrl);
const password = decodeURIComponent(parsed.password);
parsed.password = "";
const connection = parsed.toString();
function query(text) {
  const result = spawnSync("psql", [connection, "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", text], {
    env: { ...process.env, PGPASSWORD: password, PGCONNECT_TIMEOUT: "30" },
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Sorgu başarısız: ${String(result.stderr).replaceAll(password, "<gizli>").slice(0, 300)}`);
  return result.stdout.trim();
}
const sha = (data) => createHash("sha256").update(data).digest("hex");

mkdirSync(join(out, "tables"), { recursive: true });
const manifest = { createdAt: new Date().toISOString(), format: 1, tables: {}, storage: { files: 0, bytes: 0, items: [], failed: [] }, migrations: [] };

const tables = JSON.parse(query("select coalesce(json_agg(table_name order by table_name), '[]') from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'"));
for (const table of tables) {
  const body = query(`select coalesce(json_agg(t), '[]'::json) from public.${JSON.stringify(table)} t`);
  const rows = JSON.parse(body);
  const text = JSON.stringify(rows, null, 1);
  writeFileSync(join(out, "tables", `${table}.json`), text);
  manifest.tables[table] = { rows: rows.length, sha256: sha(text) };
}
manifest.migrations = JSON.parse(query("select coalesce(json_agg(version || '_' || coalesce(name, '') order by version), '[]') from supabase_migrations.schema_migrations"));

// Storage meta verisi (tüm kovalar). Özel "studio-sources" kovasındaki ekran görüntüleri
// yalnızca analiz girdisidir; dosyaları bu salt okunur rolle indirilemez ve yedeğe
// girmez, listeleri storage_objects.json'da kayıtlıdır (bkz. docs/BACKUP_AND_RESTORE.md).
const allObjects = query("select coalesce(json_agg(json_build_object('bucket', bucket_id, 'name', name, 'size', (metadata->>'size')::bigint) order by bucket_id, name), '[]') from storage.objects");
writeFileSync(join(out, "tables", "storage_objects.json"), allObjects);
manifest.tables.storage_objects = { rows: JSON.parse(allObjects).length, sha256: sha(allObjects) };

const objects = JSON.parse(query("select coalesce(json_agg(json_build_object('name', name, 'size', (metadata->>'size')::bigint) order by name), '[]') from storage.objects where bucket_id = 'blog-media'"));
for (const object of objects) {
  try {
    const response = await fetch(`${supabaseUrl}/storage/v1/object/public/blog-media/${object.name.split("/").map(encodeURIComponent).join("/")}`, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (object.size && bytes.length !== Number(object.size)) throw new Error(`boyut farklı (${bytes.length} ≠ ${object.size})`);
    const path = join(out, "storage", object.name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    manifest.storage.files += 1;
    manifest.storage.bytes += bytes.length;
    manifest.storage.items.push({ path: object.name, bytes: bytes.length, sha256: sha(bytes) });
  } catch (error) {
    manifest.storage.failed.push({ path: object.name, error: error.message });
  }
}

writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
const summary = { tablolar: Object.fromEntries(Object.entries(manifest.tables).map(([name, info]) => [name, info.rows])), dosya: manifest.storage.files, bayt: manifest.storage.bytes, inmeyen: manifest.storage.failed.length, migration: manifest.migrations.length };
console.log(JSON.stringify(summary));
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = ["### Yedek özeti", "", `- Zaman (UTC): ${manifest.createdAt}`, `- Dosya: ${summary.dosya} (${(summary.bayt / 1024).toFixed(1)} KB), inmeyen: ${summary.inmeyen}`, `- Migration: ${summary.migration}`, "", "| Tablo | Satır |", "|---|---|", ...Object.entries(summary.tablolar).map(([name, rows]) => `| ${name} | ${rows} |`)];
  writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`, { flag: "a" });
}
if (manifest.storage.failed.length || !manifest.tables.blog_posts?.rows) {
  console.error("Yedek eksik: dosya indirilemedi ya da blog_posts boş.");
  process.exitCode = 1;
}
