// Önerilen migration'ı geçici bir Postgres'te (PGlite, WebAssembly) doğrular.
// Supabase'e özgü auth.uid(), roller ve blog tabloları en küçük taklitlerle hazırlanır.
// Canlı veritabanına bağlanmaz. PGlite projeye bağımlılık olarak eklenmez:
//   mkdir -p /tmp/pgcheck && npm --prefix /tmp/pgcheck i @electric-sql/pglite@0.3.7
//   PGLITE_PATH=/tmp/pgcheck/node_modules/@electric-sql/pglite/dist/index.js \
//     node scripts/supabase/check-migration-pglite.mjs supabase/migrations/20261023000000_ai_usage_jobs.sql
// Not: PGlite tek bağlantılıdır; FOR UPDATE kilitlerinin gerçek paralel davranışı
// burada değil, standart Postgres garantisiyle sağlanır.
import { readFileSync } from "node:fs";
const { PGlite } = await import(process.env.PGLITE_PATH ?? "@electric-sql/pglite");

const migration = readFileSync(process.argv[2], "utf8");
const db = new PGlite();
let failures = 0;
const check = (ok, label) => { if (!ok) failures++; console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`); };
const ADMIN = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const as = (uid) => db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false);`);

await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  create table public.blog_admins (user_id uuid primary key);
  create table public.blog_posts (id uuid primary key);
  insert into public.blog_admins values ('${ADMIN}');
  create function public.is_blog_admin() returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.blog_admins where user_id = (select auth.uid())) $$;
  grant execute on function public.is_blog_admin() to anon, authenticated;
  grant usage on schema public to authenticated, anon;
`);
await db.exec(migration);
check(true, "migration hatasız uygulandı");
await db.exec("set role authenticated;");

const reserve = async (args) => (await db.query(`select * from public.ai_reserve($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, args)).rows[0];
const R = (requests, tokens, images, neurons, maxR, maxT, maxI, maxN, key = "text:groq") => [key, "2026-10-24", "2026-10-23", requests, tokens, images, neurons, maxR, maxT, maxI, maxN];

await as(OTHER);
try { await reserve(R(1, 0, 0, 0, 2, null, null, 9000)); check(false, "yönetici olmayan reddedilmeli"); } catch (error) { check(/yetkisiz/.test(error.message), "yönetici olmayan rezervasyon yapamaz"); }
check((await db.query("select count(*)::int as n from public.ai_usage_counters")).rows[0].n === 0, "yönetici olmayan sayaçları göremez (RLS)");

await as(ADMIN);
const r = [];
for (let i = 0; i < 3; i += 1) r.push(await reserve(R(1, 100, 0, 0, 2, null, null, 9000)));
check(r.map((row) => row.ok).join() === "true,true,false" && r[2].blocked_by === "requests", `istek limiti: ${r.map((row) => `${row.ok}/${row.blocked_by}`).join(" ")}`);
const t = await reserve(R(0, 500, 0, 0, null, 600, null, 9000));
check(t.ok === false && t.blocked_by === "tokens", "token limiti (200 + 500 > 600)");
const imageKey = "image:cloudflare";
check((await reserve(R(1, 0, 1, 60, null, null, 5, 100, imageKey))).ok === true, "görsel + Neuron rezervasyonu");
const neuron = await reserve(R(1, 0, 1, 60, null, null, 5, 100, "text:cloudflare"));
check(neuron.ok === false && neuron.blocked_by === "neurons", "paylaşılan Neuron limiti metin+görsel toplamında uygulanır");
const counters = Object.fromEntries((await db.query("select key, day::text as day, requests::int, tokens::int, images::int, neurons::int from public.ai_usage_counters order by key")).rows.map((row) => [`${row.key}@${row.day}`, row]));
check(counters["text:groq@2026-10-24"].requests === 2 && counters["text:groq@2026-10-24"].tokens === 200, "başarısız rezervasyon sayaçları değiştirmez (ya hepsi ya hiçbiri)");
check(counters["cloudflare@2026-10-23"].neurons === 60, "Neuron UTC gününe yazılır");
await db.query("select public.ai_settle($1,$2,$3,$4,$5,$6)", ["text:groq", "2026-10-24", "2026-10-23", -1000, 0, 0]);
check((await db.query("select tokens::int from public.ai_usage_counters where key='text:groq'")).rows[0].tokens === 0, "uzlaştırma sıfırın altına inmez");
const nextDay = await reserve(["text:groq", "2026-10-25", "2026-10-24", 1, 0, 0, 0, 2, null, null, 9000]);
check(nextDay.ok === true, "yeni gün yeni sayaç (günlük sıfırlama)");

const lease1 = (await db.query("select * from public.ai_acquire('image:comfyui', 1, 180)")).rows[0].lease;
const lease2 = (await db.query("select * from public.ai_acquire('image:comfyui', 1, 180)")).rows[0].lease;
check(Boolean(lease1) && lease2 === null, "eşzamanlı iş sınırı 1: ikinci kilit verilmez");
await db.query("update public.ai_leases set expires_at = now() - interval '1 second'");
check(Boolean((await db.query("select * from public.ai_acquire('image:comfyui', 1, 180)")).rows[0].lease), "süresi dolan kilit düşer");

const job1 = (await db.query("select * from public.ai_begin_job('op-1234567890', 'visual-plan', null, 'plan')")).rows[0];
const job2 = (await db.query("select * from public.ai_begin_job('op-1234567890', 'visual-plan', null, 'plan')")).rows[0];
check(job1.created === true && job2.created === false && job2.job.status === "running", "aynı anahtarla ikinci iş açılmaz");
await db.query("update public.ai_jobs set status = 'failed' where idempotency_key = 'op-1234567890'");
const job3 = (await db.query("select * from public.ai_begin_job('op-1234567890', 'visual-plan', null, 'plan')")).rows[0];
check(job3.created === true && job3.job.attempts === 2, "başarısız iş yeniden başlatılabilir (deneme 2)");
try { await db.query("update public.ai_jobs set status = 'uydurma'"); check(false, "geçersiz durum reddedilmeli"); } catch { check(true, "geçersiz iş durumu reddedilir (check)"); }

await as(OTHER);
check((await db.query("select count(*)::int as n from public.ai_jobs")).rows[0].n === 0, "yönetici olmayan işleri göremez (RLS)");
try { await db.query("insert into public.ai_limit_overrides (key, values) values ('text:groq', '{}')"); check(false, "yönetici olmayan limit yazamamalı"); } catch { check(true, "yönetici olmayan limit değiştiremez (RLS)"); }

console.log(failures ? `\n${failures} kontrol başarısız` : "\nMIGRATION DOĞRULAMASI GEÇTİ");
process.exitCode = failures ? 1 : 0;
