// Yerel geliştirme sunucusunu TEST Supabase projesine bağlı başlatır (varsayılan :3100).
//   node scripts/supabase/dev-test.mjs
// .env.local DEĞİŞMEZ: test projesinin adresi ve herkese açık (anon) anahtarı Yönetim
// API'sinden alınıp yalnızca bu sürecin ortamına verilir (süreç değişkenleri
// .env.local'dan önce gelir). AI kullanım kayıtları test projesinin kalıcı deposuna
// yazılır (AI_USAGE_STORE=supabase). Service-role anahtarı uygulamaya VERİLMEZ.

import { spawn } from "node:child_process";
import { projectKeys } from "./_api.mjs";
import { resolveRef } from "./project.mjs";

const ref = resolveRef("test");
const keys = await projectKeys(ref);
const port = process.env.TEST_PORT ?? "3100";
console.log(`Test projesine bağlı geliştirme sunucusu: http://localhost:${port}`);
const child = spawn("npx", ["next", "dev", "-p", port], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: keys.url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: keys.anon,
    NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`,
    AI_USAGE_STORE: "supabase",
  },
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
