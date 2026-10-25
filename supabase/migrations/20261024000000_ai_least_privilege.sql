-- AI tabloları ve fonksiyonları için en az yetki (savunma derinliği).
-- Supabase'in varsayılan yetkileri public şemasındaki yeni nesneleri anon rolüne
-- de açar. RLS ve is_blog_admin() kontrolü anon'u zaten reddediyor (entegrasyon
-- testiyle doğrulandı); bu migration oturumsuz rolün bu nesnelere hiç
-- erişememesini sağlar. Yalnızca yetki geri alır; veri ve yapı değişmez.

revoke all on table
  public.ai_limit_overrides,
  public.ai_usage_counters,
  public.ai_leases,
  public.ai_jobs,
  public.ai_usage_events
from anon;

revoke execute on function public.ai_reserve(text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from anon;
revoke execute on function public.ai_settle(text, date, date, numeric, numeric, numeric) from anon;
revoke execute on function public.ai_acquire(text, integer, integer) from anon;
revoke execute on function public.ai_begin_job(text, text, uuid, text) from anon;

-- Kullanım kaydı yalnızca eklenir ve okunur; güncelleme/silme yönetici için de gerekmez
-- (temizlik service_role ile yapılır).
revoke update, delete on table public.ai_usage_events from authenticated;

-- DOWN (geri alma):
-- grant select, insert, update, delete on public.ai_limit_overrides, public.ai_usage_counters, public.ai_leases, public.ai_jobs to anon;
-- grant execute on function public.ai_reserve(text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric), public.ai_settle(text, date, date, numeric, numeric, numeric), public.ai_acquire(text, integer, integer), public.ai_begin_job(text, text, uuid, text) to anon;
-- grant update, delete on public.ai_usage_events to authenticated;
