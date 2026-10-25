#!/usr/bin/env bash
# Tüm migration'ları GEÇİCİ bir yerel Postgres kümesinde (gerçek sunucu, gerçek
# paralel bağlantılar) doğrular. Canlıya ya da test projesine bağlanmaz.
# Supabase'e özgü auth/storage nesneleri en küçük taklitlerle hazırlanır.
# Gerekli: Homebrew postgresql (initdb, pg_ctl, psql). Küme iş bitince silinir.
#
#   bash scripts/supabase/verify-local-pg.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/persona-pg.XXXXXX")"
PORT="${PERSONA_PG_PORT:-54329}"
ADMIN="11111111-1111-4111-8111-111111111111"
OTHER="22222222-2222-4222-8222-222222222222"
FAIL=0

cleanup() {
  pg_ctl -D "$WORK/data" -m fast stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

initdb -D "$WORK/data" -U postgres --auth=trust -E UTF8 >/dev/null
pg_ctl -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses='' -c max_connections=60" -l "$WORK/log" -w start >/dev/null
psqlq() { psql -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X "$@"; }
check() { if [ "$1" = "$2" ]; then echo "  ok   $3"; else echo "  FAIL $3 (beklenen $2, gelen $1)"; FAIL=1; fi; }

psqlq <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
grant usage on schema public to anon, authenticated;
SQL

for file in "$ROOT"/supabase/migrations/*.sql; do
  psqlq -f "$file"
  echo "  ok   uygulandı: $(basename "$file")"
done

psqlq -c "insert into auth.users values ('$ADMIN'), ('$OTHER'); insert into public.blog_admins (user_id, display_name) values ('$ADMIN', 'QA');"

as_user() { # $1 = kullanıcı, $2 = SQL (tek sonuç satırı)
  psql -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X -t -A \
    -c "begin" -c "set local role authenticated" -c "select set_config('request.jwt.claim.sub', '$1', true)" \
    -c "$2" -c "commit" 2>&1 | grep -v '^$' | tail -1
}
export -f as_user
export WORK PORT ADMIN

# 1) 20 eşzamanlı bağlantı, günlük istek limiti 5: tam 5 rezervasyon başarılı olmalı.
seq 1 20 | xargs -P 20 -I{} bash -c 'as_user "$ADMIN" "select ok from public.ai_reserve('"'"'text:race'"'"', '"'"'2026-10-24'"'"', '"'"'2026-10-23'"'"', 1, 0, 0, 0, 5, null, null, 9000)"' > "$WORK/race.txt"
check "$(grep -c '^t$' "$WORK/race.txt")" "5" "20 paralel istek, limit 5 → 5 başarılı"
check "$(psqlq -t -A -c "select requests::int from public.ai_usage_counters where key = 'text:race'")" "5" "sayaç limiti aşmadı (5)"

# 2) Paylaşılan Neuron: metin + görsel aynı anda; toplam 100 sınırı aşılmaz (60 + 60 → biri reddedilir).
( as_user "$ADMIN" "select ok from public.ai_reserve('text:cloudflare', '2026-10-24', '2026-10-23', 1, 0, 0, 60, null, null, null, 100)" > "$WORK/n1.txt" ) &
( as_user "$ADMIN" "select ok from public.ai_reserve('image:cloudflare', '2026-10-24', '2026-10-23', 1, 0, 1, 60, null, null, null, 100)" > "$WORK/n2.txt" ) &
wait
check "$(cat "$WORK/n1.txt" "$WORK/n2.txt" | grep -c '^t$')" "1" "paylaşılan Neuron: eşzamanlı iki istekten yalnızca biri"
check "$(psqlq -t -A -c "select neurons::int from public.ai_usage_counters where key = 'cloudflare'")" "60" "Neuron sayacı 60"

# 3) Eşzamanlı iş kilidi: 10 paralel istek, en fazla 2 iş.
seq 1 10 | xargs -P 10 -I{} bash -c 'as_user "$ADMIN" "select lease is not null from public.ai_acquire('"'"'image:comfyui'"'"', 2, 180)"' > "$WORK/lease.txt"
check "$(grep -c '^t$' "$WORK/lease.txt")" "2" "10 paralel kilit isteği, sınır 2 → 2 kilit"

# 4) İdempotent iş: aynı anahtarla 10 paralel başlatma → yalnızca 1 iş oluşur.
seq 1 10 | xargs -P 10 -I{} bash -c 'as_user "$ADMIN" "select created from public.ai_begin_job('"'"'op-race-0001'"'"', '"'"'image'"'"', null, null)"' > "$WORK/job.txt"
check "$(grep -c '^t$' "$WORK/job.txt")" "1" "aynı işlem kimliğiyle 10 paralel başlatma → 1 iş"

# 5) Yetkisiz kullanıcı: rezervasyon reddedilir, tablolar görünmez.
DENIED="$(psql -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X -t -A -c "begin" -c "set local role authenticated" \
  -c "select set_config('request.jwt.claim.sub', '$OTHER', true)" \
  -c "select ok from public.ai_reserve('text:x', '2026-10-24', '2026-10-23', 1, 0, 0, 0, 5, null, null, 9000)" 2>&1 || true)"
check "$(printf '%s' "$DENIED" | grep -c 'yetkisiz')" "1" "yönetici olmayan rezervasyon yapamaz (hata: yetkisiz)"
check "$(as_user "$OTHER" "select count(*) from public.ai_usage_counters")" "0" "yönetici olmayan sayaçları göremez (RLS)"
check "$(as_user "$OTHER" "select count(*) from public.blog_posts")" "0" "blog RLS bozulmadı (yönetici olmayan taslak göremez)"

# 6) Mevcut blog yapısı değişmedi: AI migration yalnızca yeni nesne ekledi.
check "$(psqlq -t -A -c "select count(*) from information_schema.tables where table_schema = 'public' and table_name like 'blog_%'")" "7" "blog tabloları: 7 (değişmedi)"

if [ "$FAIL" -ne 0 ]; then echo "YEREL POSTGRES DOĞRULAMASI BAŞARISIZ"; exit 1; fi
echo "YEREL POSTGRES DOĞRULAMASI GEÇTİ (Postgres $(psqlq -t -A -c 'show server_version'))"
