// Gizli anahtar sızıntı taraması (SALT OKUNUR). Değer ASLA yazdırılmaz; yalnızca
// değişken adı / desen adı ve dosya yolu (git geçmişinde commit kısaltması) raporlanır.
//   node scripts/security/scan-secrets.mjs              → çalışma dizini + git geçmişi + .next/static
//   node scripts/security/scan-secrets.mjs --supabase   → ek olarak iki projenin service-role
//                                                         anahtarını Yönetim API'sinden bellekte alıp arar
// Aranan gerçek değerler: .env.local ve supabase/.env.test.local içindeki NEXT_PUBLIC_ olmayan
// anahtar/token/şifre değişkenleri, Supabase CLI erişim token'ı ve (--supabase ile) service-role anahtarları.
// Ayrıca bilinen anahtar biçimleri (Google, Groq, OpenRouter, Supabase gizli anahtarı, JWT
// service_role, özel anahtar başlığı) desenle aranır; .env* dosyaları git dışında olduğu için atlanır.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const secrets = new Map(); // ad → değer (yalnızca bellekte)

function readEnvFile(path, label) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    // Proje kimliği gibi gizli olmayan değerler aranmaz; yalnızca anahtar/token/şifre.
    if (!match || match[1].startsWith("NEXT_PUBLIC_") || !/KEY|TOKEN|SECRET|PASSWORD/.test(match[1])) continue;
    const value = match[2].replace(/^["']|["']$/g, "");
    if (value.length >= 12) secrets.set(`${label}:${match[1]}`, value);
  }
}
readEnvFile(join(root, ".env.local"), ".env.local");
readEnvFile(join(root, "supabase/.env.test.local"), "test");
const tokenPath = join(homedir(), ".supabase/access-token");
if (existsSync(tokenPath)) secrets.set("supabase-cli:access-token", readFileSync(tokenPath, "utf8").trim());

if (process.argv.includes("--supabase")) {
  const { projectKeys, linkedProject } = await import("../supabase/_api.mjs");
  const { resolveRef } = await import("../supabase/project.mjs");
  for (const [label, ref] of [["canlı", linkedProject(root).ref], ["test", resolveRef("test")]]) {
    const keys = await projectKeys(ref);
    if (keys.serviceRole) secrets.set(`${label}:service_role`, keys.serviceRole);
  }
}

const PATTERNS = [
  ["Google API anahtarı", /AIza[0-9A-Za-z_-]{35}/],
  ["Groq anahtarı", /gsk_[0-9A-Za-z]{40,}/],
  ["OpenRouter anahtarı", /sk-or-v1-[0-9a-f]{40,}/],
  ["OpenAI biçimli anahtar", /sk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ["Supabase gizli anahtarı", /sb_secret_[A-Za-z0-9_-]{20,}/],
  ["Supabase erişim token'ı", /sbp_[0-9a-f]{40}/],
  ["Firecrawl anahtarı", /fc-[0-9a-f]{32}/],
  ["Jina anahtarı", /jina_[0-9a-f]{32}[A-Za-z0-9_-]{10,}/],
  ["Özel anahtar", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
];
const isServiceRoleJwt = (text) => {
  for (const token of text.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) ?? []) {
    try {
      if (JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).role === "service_role") return true;
    } catch {
      // JWT değil
    }
  }
  return false;
};

const findings = [];
function scanText(text, where) {
  for (const [name, value] of secrets) if (text.includes(value)) findings.push({ where, what: `gerçek değer: ${name}` });
  for (const [name, pattern] of PATTERNS) if (pattern.test(text)) findings.push({ where, what: `desen: ${name}` });
  if (isServiceRoleJwt(text)) findings.push({ where, what: "desen: service_role JWT" });
}

// 1) Çalışma dizini: git'te izlenen + izlenmeyen ama yok sayılmayan dosyalar.
const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: root }).toString().split("\0").filter(Boolean);
let scannedFiles = 0;
for (const file of files) {
  const path = join(root, file);
  if (!existsSync(path) || statSync(path).size > 5_000_000 || file === "scripts/security/scan-secrets.mjs") continue;
  scanText(readFileSync(path, "utf8"), `dosya ${file}`);
  scannedFiles++;
}

// 2) Git geçmişi: tüm dallardaki her commit'in değişiklikleri.
const commits = execFileSync("git", ["rev-list", "--all"], { cwd: root }).toString().trim().split("\n").filter(Boolean);
for (const commit of commits) {
  const patch = execFileSync("git", ["show", "--no-color", "--format=%H%n%B", commit], { cwd: root, maxBuffer: 256 * 1024 * 1024 }).toString();
  scanText(patch, `commit ${commit.slice(0, 7)}`);
}

// 3) İstemci paketi: tarayıcıya giden dosyalar (.next/static), varsa.
let bundleFiles = 0;
const walk = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)])) : []);
for (const path of walk(join(root, ".next/static"))) {
  if (!/\.(js|css|json|html|txt|map)$/.test(path)) continue;
  scanText(readFileSync(path, "utf8"), `istemci ${relative(root, path)}`);
  bundleFiles++;
}

console.log(JSON.stringify({
  aranan_gercek_degerler: [...secrets.keys()],
  taranan: { dosya: scannedFiles, commit: commits.length, istemci_dosyasi: bundleFiles },
  bulgular: findings,
  sonuc: findings.length ? "SIZINTI ŞÜPHESİ — yukarıdaki yerleri incele" : "temiz",
}, null, 1));
process.exitCode = findings.length ? 1 : 0;
