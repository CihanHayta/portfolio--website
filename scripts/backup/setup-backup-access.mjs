// Yedekleme rolüne (persona_backup) giriş yetkisi ve yeni şifre verir, bağlantıyı
// sınar; istenirse bağlantı adresini GitHub deposunun gizli değişkenine yazar.
//   node scripts/backup/setup-backup-access.mjs test
//   node scripts/backup/setup-backup-access.mjs linked --github CihanHayta/persona-yedek
//   node scripts/backup/setup-backup-access.mjs test --backup <klasör>   # yerelde elle yedek
// - Şifre rastgele üretilir ve YALNIZCA bellekte tutulur: ekrana, diske, git'e yazılmaz.
// - Veritabanına düz şifre değil SCRAM-SHA-256 özeti gönderilir (sunucu günlüklerinde
//   de düz şifre görünmez). Her çalıştırma şifreyi yeniler (eski adres geçersiz olur).
// - Bağlantı Supabase havuzu (Supavisor, session modu, IPv4) üzerinden yapılır;
//   GitHub Actions makineleri IPv6 doğrudan bağlantıyı desteklemez.
// Önkoşul: supabase/migrations/20261026000000_backup_reader_role.sql uygulanmış olmalı.

import { spawnSync } from "node:child_process";
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { api, linkedProject, projectKeys, sql } from "../supabase/_api.mjs";
import { resolveRef } from "../supabase/project.mjs";

const target = process.argv[2];
if (!["test", "linked"].includes(target)) throw new Error("Kullanım: setup-backup-access.mjs <test|linked> [--github sahip/depo]");
const repo = process.argv.includes("--github") ? process.argv[process.argv.indexOf("--github") + 1] : null;
const backupDir = process.argv.includes("--backup") ? process.argv[process.argv.indexOf("--backup") + 1] : null;
const ref = target === "test" ? resolveRef("test") : linkedProject().ref;

function scramVerifier(password) {
  const salt = randomBytes(16);
  const iterations = 4096;
  const salted = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

const [role] = await sql(ref, "select count(*)::int as var from pg_roles where rolname = 'persona_backup'");
if (!role.var) throw new Error("persona_backup rolü yok: önce migration'ı uygula.");

const password = randomBytes(32).toString("base64url");
await sql(ref, `alter role persona_backup with login password '${scramVerifier(password)}'`, { write: true });

const pooler = [await api(`/v1/projects/${ref}/config/database/pooler`)].flat()[0];
const host = pooler.db_host;
const url = `postgresql://persona_backup.${ref}:${password}@${host}:5432/postgres?sslmode=require`;

// Bağlantı sınaması: yalnızca sayılar yazdırılır.
const probe = spawnSync("psql", [url.replace(`:${password}@`, "@"), "-At", "-c", "select json_build_object('yazi', (select count(*) from public.blog_posts), 'medya', (select count(*) from public.blog_media), 'dosya', (select count(*) from storage.objects where bucket_id = 'blog-media'), 'salt_okunur', current_setting('default_transaction_read_only'))"], {
  env: { ...process.env, PGPASSWORD: password, PGCONNECT_TIMEOUT: "20" },
  encoding: "utf8",
});
if (probe.status !== 0) throw new Error(`Bağlantı sınaması başarısız: ${String(probe.stderr).replaceAll(password, "<gizli>").slice(0, 300)}`);
console.log(`${target}: yedek rolü bağlantısı çalışıyor ${probe.stdout.trim()}`);

// Yazma denemesi reddedilmeli (salt okunur rol).
const write = spawnSync("psql", [url.replace(`:${password}@`, "@"), "-At", "-c", "create table public.yedek_yazma_denemesi (id int)"], { env: { ...process.env, PGPASSWORD: password }, encoding: "utf8" });
console.log(`${target}: yazma denemesi ${write.status === 0 ? "BAŞARILI OLDU — HATA!" : "reddedildi (beklenen)"}`);
if (write.status === 0) process.exitCode = 1;

const { url: supabaseUrl } = await projectKeys(ref);
if (backupDir) {
  // Yeni bağlantıyla hemen bir yedek alınır; adres yalnızca alt sürecin ortamındadır.
  const run = spawnSync("node", [new URL("./ci-backup.mjs", import.meta.url).pathname, backupDir], { stdio: "inherit", env: { ...process.env, BACKUP_DB_URL: url, SUPABASE_URL: supabaseUrl } });
  if (run.status !== 0) process.exitCode = 1;
}

if (repo) {
  for (const [name, value] of [["BACKUP_DB_URL", url], ["SUPABASE_URL", supabaseUrl]]) {
    const set = spawnSync("gh", ["secret", "set", name, "-R", repo], { input: value, encoding: "utf8" });
    if (set.status !== 0) throw new Error(`GitHub gizli değişkeni yazılamadı: ${name}`);
    console.log(`${repo}: ${name} gizli değişkeni ayarlandı`);
  }
}
