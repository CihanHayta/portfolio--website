-- AI kullanım limitleri, sayaçlar, eşzamanlı iş kilitleri, idempotent işler ve
-- güvenli kullanım kaydı. Yalnızca YENİ nesneler ekler; mevcut blog tablolarına
-- dokunmaz (ai_jobs.post_id yalnızca yabancı anahtar). Kod: lib/ai/usageStore.js
-- (createSupabaseStore); etkinleştirmek için uygulama ortamında AI_USAGE_STORE=supabase.
--
--   ai_limit_overrides : admin panelinde değiştirilen limitler (varsayılanlar kodda tek yerde)
--   ai_usage_counters  : (servis, gün) başına istek/token/görsel; 'cloudflare' satırında
--                        paylaşılan Neuron TAHMİNİ (UTC günü)
--   ai_leases          : aynı anda çalışan iş kilitleri (süre aşımıyla düşer)
--   ai_jobs            : idempotency anahtarlı iş durumu
--   ai_usage_events    : güvenli kullanım kaydı (istem/yanıt/anahtar/çerez YOK)
--
-- Doğrulama: scripts/supabase/verify-local-pg.sh (gerçek Postgres, paralel bağlantı),
-- test projesi, ardından `node scripts/supabase/project.mjs migrate linked`.
-- Tüm erişim RLS ve is_blog_admin() ile yalnızca yöneticilere açıktır.
-- Geri alma: dosyanın sonundaki DOWN bölümü.

create table public.ai_limit_overrides (
  key text primary key,
  values jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table public.ai_usage_counters (
  key text not null,
  day date not null, -- servis satırları: Europe/Istanbul günü; 'cloudflare' Neuron satırı: UTC günü
  requests numeric not null default 0,
  tokens numeric not null default 0,
  images numeric not null default 0,
  neurons numeric not null default 0,
  primary key (key, day)
);

create table public.ai_leases (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  expires_at timestamptz not null
);
create index ai_leases_key_idx on public.ai_leases (key, expires_at);

create table public.ai_jobs (
  idempotency_key text primary key,
  kind text not null, -- blog-draft | visual-plan | image
  post_id uuid references public.blog_posts (id) on delete cascade,
  status text not null check (status in ('queued', 'running', 'retrying', 'completed', 'failed', 'cancelled')),
  stage text,
  attempts integer not null default 1,
  error_kind text,
  result jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_usage_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  op_id text,
  service text,
  task text not null,
  provider text not null,
  model text,
  ok boolean not null,
  kind text not null,
  skipped text,
  input_tokens integer,
  output_tokens integer,
  images integer not null default 0,
  neurons_estimate numeric, -- sağlayıcı bildirmez: resmî fiyatla TAHMİN
  latency_ms integer,
  attempt integer,
  fallback boolean not null default false
);
create index ai_usage_events_created_idx on public.ai_usage_events (created_at desc);

-- Atomik rezervasyon: ilgili satırlar FOR UPDATE ile kilitlenir; kontrol ve artış
-- tek işlemde yapılır. Eşzamanlı iki istek aynı ücretsiz hakkı iki kez kullanamaz.
-- Kilit sırası sabittir (önce servis, sonra paylaşılan Neuron satırı): kilitlenme olmaz.
create function public.ai_reserve(
  p_key text, p_day date, p_neuron_day date,
  p_requests numeric, p_tokens numeric, p_images numeric, p_neurons numeric,
  p_max_requests numeric, p_max_tokens numeric, p_max_images numeric, p_max_neurons numeric
)
returns table (ok boolean, blocked_by text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  c public.ai_usage_counters;
  n public.ai_usage_counters;
begin
  if not public.is_blog_admin() then
    raise exception 'yetkisiz' using errcode = '42501';
  end if;

  insert into public.ai_usage_counters (key, day) values (p_key, p_day) on conflict do nothing;
  select * into c from public.ai_usage_counters where key = p_key and day = p_day for update;
  if p_neurons > 0 then
    insert into public.ai_usage_counters (key, day) values ('cloudflare', p_neuron_day) on conflict do nothing;
    select * into n from public.ai_usage_counters where key = 'cloudflare' and day = p_neuron_day for update;
  end if;

  if p_requests > 0 and p_max_requests is not null and c.requests + p_requests > p_max_requests then
    return query select false, 'requests'::text; return;
  end if;
  if p_tokens > 0 and p_max_tokens is not null and c.tokens + p_tokens > p_max_tokens then
    return query select false, 'tokens'::text; return;
  end if;
  if p_images > 0 and p_max_images is not null and c.images + p_images > p_max_images then
    return query select false, 'images'::text; return;
  end if;
  if p_neurons > 0 and p_max_neurons is not null and n.neurons + p_neurons > p_max_neurons then
    return query select false, 'neurons'::text; return;
  end if;

  update public.ai_usage_counters
     set requests = requests + p_requests, tokens = tokens + p_tokens, images = images + p_images
   where key = p_key and day = p_day;
  if p_neurons > 0 then
    update public.ai_usage_counters set neurons = neurons + p_neurons where key = 'cloudflare' and day = p_neuron_day;
  end if;
  return query select true, null::text;
end;
$$;

-- Gerçek kullanımla uzlaştırma (limit uygulanmaz, sıfırın altına inmez).
create function public.ai_settle(p_key text, p_day date, p_neuron_day date, p_tokens numeric, p_images numeric, p_neurons numeric)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_blog_admin() then
    raise exception 'yetkisiz' using errcode = '42501';
  end if;
  insert into public.ai_usage_counters (key, day) values (p_key, p_day) on conflict do nothing;
  update public.ai_usage_counters
     set tokens = greatest(0, tokens + p_tokens), images = greatest(0, images + p_images)
   where key = p_key and day = p_day;
  if p_neurons <> 0 then
    insert into public.ai_usage_counters (key, day) values ('cloudflare', p_neuron_day) on conflict do nothing;
    update public.ai_usage_counters set neurons = greatest(0, neurons + p_neurons) where key = 'cloudflare' and day = p_neuron_day;
  end if;
end;
$$;

-- Eşzamanlı iş kilidi: servis başına danışma kilidiyle sayım + ekleme atomiktir.
create function public.ai_acquire(p_key text, p_max integer, p_ttl_seconds integer)
returns table (lease uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_active integer;
  v_id uuid;
begin
  if not public.is_blog_admin() then
    raise exception 'yetkisiz' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('ai_lease:' || p_key));
  delete from public.ai_leases where key = p_key and expires_at <= now();
  select count(*) into v_active from public.ai_leases where key = p_key;
  if v_active >= p_max then
    return query select null::uuid; return;
  end if;
  insert into public.ai_leases (key, expires_at) values (p_key, now() + make_interval(secs => p_ttl_seconds)) returning id into v_id;
  return query select v_id;
end;
$$;

-- İdempotent iş başlatma: aynı anahtarla çalışan/tamamlanmış iş varsa yenisi açılmaz;
-- yalnızca başarısız ya da iptal edilmiş iş yeniden başlatılır.
create function public.ai_begin_job(p_key text, p_kind text, p_post_id uuid, p_stage text)
returns table (job jsonb, created boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_job jsonb;
begin
  if not public.is_blog_admin() then
    raise exception 'yetkisiz' using errcode = '42501';
  end if;
  insert into public.ai_jobs (idempotency_key, kind, post_id, status, stage)
  values (p_key, p_kind, p_post_id, 'running', p_stage)
  on conflict (idempotency_key) do update
     set status = 'running', attempts = public.ai_jobs.attempts + 1, error_kind = null, stage = excluded.stage, updated_at = now()
   where public.ai_jobs.status in ('failed', 'cancelled')
  returning to_jsonb(public.ai_jobs.*) into v_job;
  if v_job is not null then
    return query select v_job, true; return;
  end if;
  return query select to_jsonb(j.*), false from public.ai_jobs j where j.idempotency_key = p_key;
end;
$$;

alter table public.ai_limit_overrides enable row level security;
alter table public.ai_usage_counters enable row level security;
alter table public.ai_leases enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.ai_usage_events enable row level security;

create policy "Yöneticiler AI limitlerini yönetir" on public.ai_limit_overrides
  for all to authenticated using (public.is_blog_admin()) with check (public.is_blog_admin());
create policy "Yöneticiler AI sayaçlarını yönetir" on public.ai_usage_counters
  for all to authenticated using (public.is_blog_admin()) with check (public.is_blog_admin());
create policy "Yöneticiler AI kilitlerini yönetir" on public.ai_leases
  for all to authenticated using (public.is_blog_admin()) with check (public.is_blog_admin());
create policy "Yöneticiler AI işlerini yönetir" on public.ai_jobs
  for all to authenticated using (public.is_blog_admin()) with check (public.is_blog_admin());
create policy "Yöneticiler AI kullanım kaydını yönetir" on public.ai_usage_events
  for all to authenticated using (public.is_blog_admin()) with check (public.is_blog_admin());

grant select, insert, update, delete on public.ai_limit_overrides, public.ai_usage_counters, public.ai_leases, public.ai_jobs to authenticated;
grant select, insert on public.ai_usage_events to authenticated;

revoke all on function public.ai_reserve(text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public;
revoke all on function public.ai_settle(text, date, date, numeric, numeric, numeric) from public;
revoke all on function public.ai_acquire(text, integer, integer) from public;
revoke all on function public.ai_begin_job(text, text, uuid, text) from public;
grant execute on function public.ai_reserve(text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.ai_settle(text, date, date, numeric, numeric, numeric) to authenticated;
grant execute on function public.ai_acquire(text, integer, integer) to authenticated;
grant execute on function public.ai_begin_job(text, text, uuid, text) to authenticated;

-- DOWN (geri alma):
-- drop function public.ai_begin_job(text, text, uuid, text);
-- drop function public.ai_acquire(text, integer, integer);
-- drop function public.ai_settle(text, date, date, numeric, numeric, numeric);
-- drop function public.ai_reserve(text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric);
-- drop table public.ai_usage_events;
-- drop table public.ai_jobs;
-- drop table public.ai_leases;
-- drop table public.ai_usage_counters;
-- drop table public.ai_limit_overrides;
