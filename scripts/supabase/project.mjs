// Supabase bakım betiği (yerel; uygulama kodu kullanmaz).
//
//   node scripts/supabase/project.mjs status   <linked|test>
//   node scripts/supabase/project.mjs create-test            # ücretsiz "portfolio-test" projesi
//   node scripts/supabase/project.mjs migrate  <linked|test> [--dry-run]
//
// migrate: supabase/migrations/ ile uzak migration geçmişini karşılaştırır.
// Bekleyen her migration önce BEGIN … ROLLBACK içinde denenir (hiçbir şey
// kalıcı olmaz). --dry-run verilmediyse Supabase CLI'ın `db push` ile yaptığı
// gibi uygulanır: migration SQL'i ve DOSYA ADINDAKİ sürümle geçmiş satırı
// (supabase_migrations.schema_migrations) TEK işlemde yazılır; biri başarısız
// olursa ikisi de geri alınır. (Yönetim API'sinin migration ucu sürümü uygulama
// anıyla yazdığı için CLI geçmişiyle uyuşmaz; bu yüzden kullanılmaz.)
// Test projesinin veritabanı şifresi yalnızca supabase/.env.test.local (git dışı, 0600).

import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { api, linkedProject, sleep, sql } from "./_api.mjs";

const TEST_NAME = "portfolio-test";
const TEST_REGION = "eu-central-1";
const TEST_ENV = join("supabase", ".env.test.local");

function readTestEnv() {
  if (!existsSync(TEST_ENV)) return {};
  return Object.fromEntries(readFileSync(TEST_ENV, "utf8").split("\n").filter((line) => line.includes("=")).map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
}

export function resolveRef(target) {
  if (target === "linked" || target === "production") return linkedProject().ref;
  if (target === "test") {
    const ref = readTestEnv().TEST_PROJECT_REF;
    if (!ref) throw new Error("Test projesi yok: önce `create-test` çalıştır.");
    return ref;
  }
  throw new Error("Hedef 'linked' ya da 'test' olmalı.");
}

async function waitHealthy(ref, timeoutMs = 10 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const project = await api(`/v1/projects/${ref}`);
    if (project.status === "ACTIVE_HEALTHY") return project;
    await sleep(10_000);
  }
  throw new Error("Proje zamanında hazır olmadı.");
}

const localMigrations = () =>
  readdirSync(join("supabase", "migrations"))
    .filter((file) => /^\d{14}_.+\.sql$/.test(file))
    .sort()
    .map((file) => ({ version: file.slice(0, 14), name: file.slice(15, -4), file }));

// Geçmiş okunamazsa (zaman aşımı, ağ) boş SAYILMAZ: tüm migration'lar bekliyor
// sanılıp eski migration'lar yeniden çalıştırılmaya kalkılırdı. Yalnızca geçmiş
// tablosu hiç yoksa (yeni proje) boş kabul edilir.
async function remoteMigrations(ref) {
  try {
    const rows = await sql(ref, "select version, name from supabase_migrations.schema_migrations order by version");
    return rows.map((row) => ({ version: row.version, name: row.name }));
  } catch (error) {
    if (/does not exist|42P01|3F000/.test(String(error.message))) return [];
    throw new Error(`Migration geçmişi okunamadı; güvenlik için durduruldu (${String(error.message).slice(0, 160)})`);
  }
}

const TAG = "$migration_body$";

async function status(target) {
  const ref = resolveRef(target);
  const project = await api(`/v1/projects/${ref}`);
  const remote = await remoteMigrations(ref);
  const local = localMigrations();
  const pending = local.filter((migration) => !remote.some((row) => row.version === migration.version));
  const unknown = remote.filter((row) => !local.some((migration) => migration.version === row.version));
  console.log(JSON.stringify({ target, name: project.name, status: project.status, region: project.region, postgres: project.database?.version, applied: remote.map((row) => `${row.version}_${row.name}`), pending: pending.map((row) => row.file), remoteOnly: unknown }, null, 1));
  return { ref, pending, unknown };
}

async function createTest() {
  const existing = readTestEnv().TEST_PROJECT_REF;
  if (existing) {
    console.log("Test projesi zaten var.");
    return status("test");
  }
  const { organization } = linkedProject();
  const projects = await api("/v1/projects");
  const found = projects.find((project) => project.name === TEST_NAME);
  if (found) throw new Error("Aynı adlı proje var ama şifresi bu makinede yok; panelden kontrol et.");
  const password = randomBytes(24).toString("base64url");
  const created = await api("/v1/projects", { method: "POST", body: { name: TEST_NAME, organization_slug: organization, region: TEST_REGION, db_pass: password } });
  writeFileSync(TEST_ENV, `TEST_PROJECT_REF=${created.id}\nTEST_DB_PASSWORD=${password}\n`);
  chmodSync(TEST_ENV, 0o600);
  console.log(`Test projesi oluşturuldu (${TEST_REGION}); hazır olması bekleniyor…`);
  await waitHealthy(created.id);
  return status("test");
}

// `only`: yalnızca bu sürüm uygulanır (ör. birbirinden bağımsız ve ayrı onay
// gerektiren migration'lar). Diğer bekleyenlere dokunulmaz.
async function migrate(target, { dryRun, only = null }) {
  const status_ = await status(target);
  const { ref, unknown } = status_;
  const pending = only ? status_.pending.filter((migration) => migration.version === only) : status_.pending;
  if (only && !pending.length) throw new Error(`${only} bekleyenler arasında değil (zaten uygulanmış ya da yok).`);
  if (unknown.length) throw new Error("Uzakta yerelde olmayan migration var; geçmiş tahminle düzeltilmez. Durduruldu.");
  for (const migration of pending) {
    const body = readFileSync(join("supabase", "migrations", migration.file), "utf8");
    // Kuru deneme: aynı SQL geri alınan bir işlemde çalıştırılır.
    await sql(ref, `begin;\n${body}\nrollback;`, { write: true });
    console.log(`kuru deneme başarılı: ${migration.file}`);
    if (dryRun) continue;
    if (body.includes(TAG)) throw new Error("Migration gövdesi ayraç etiketini içeriyor.");
    await sql(
      ref,
      // Yalnızca tüm CLI sürümlerinde ortak sütunlar (version, name, statements) yazılır.
      `begin;\ncreate schema if not exists supabase_migrations;\n${body}\ninsert into supabase_migrations.schema_migrations (version, name, statements) values ('${migration.version}', '${migration.name.replace(/'/g, "")}', array[${TAG}${body}${TAG}]);\ncommit;`,
      { write: true }
    );
    console.log(`uygulandı: ${migration.file}`);
  }
  if (!pending.length) console.log("Bekleyen migration yok.");
  if (!dryRun && pending.length) await status(target);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [command, target = "linked", ...rest] = process.argv.slice(2);
  if (command === "status") await status(target);
  else if (command === "create-test") await createTest();
  else if (command === "migrate") await migrate(target, { dryRun: rest.includes("--dry-run"), only: rest.includes("--only") ? rest[rest.indexOf("--only") + 1] : null });
  else console.log("Komutlar: status <linked|test> · create-test · migrate <linked|test> [--dry-run]");
}
