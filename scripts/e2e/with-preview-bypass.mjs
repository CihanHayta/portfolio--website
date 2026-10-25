// Korumalı Vercel Preview'a karşı E2E çalıştırır.
//   BASE_URL=https://<preview>.vercel.app node scripts/e2e/with-preview-bypass.mjs node tests/e2e/public-seo.e2e.mjs
// Vercel CLI oturumuyla projenin "Protection Bypass for Automation" anahtarı
// Vercel API'sinden YALNIZCA belleğe alınır ve çocuk sürece VERCEL_BYPASS olarak
// verilir; hiçbir yere yazılmaz, yazdırılmaz. Anahtarı yalnızca tests/e2e/_target.mjs
// kullanır ve yalnızca BASE_URL'e gönderir.

import { spawn, spawnSync } from "node:child_process";

const project = process.env.VERCEL_PROJECT ?? "portfolio-website";
const team = process.env.VERCEL_TEAM ?? "cihans-projects-077e9445";
const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("Kullanım: node scripts/e2e/with-preview-bypass.mjs <komut> [argümanlar]");
if (!/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(process.env.BASE_URL ?? "")) throw new Error("BASE_URL bir *.vercel.app Preview adresi olmalı.");

const result = spawnSync("vercel", ["api", `/v9/projects/${project}?teamId=${team}`], { encoding: "utf8" });
if (result.status !== 0) throw new Error("Vercel proje bilgisi alınamadı (vercel login gerekli olabilir).");
const bypass = Object.entries(JSON.parse(result.stdout).protectionBypass ?? {}).find(([, value]) => value.scope === "automation-bypass")?.[0];
if (!bypass) throw new Error("Projede 'Protection Bypass for Automation' anahtarı yok.");

const child = spawn(command, args, { stdio: "inherit", env: { ...process.env, VERCEL_BYPASS: bypass } });
child.on("exit", (code) => process.exit(code ?? 1));
