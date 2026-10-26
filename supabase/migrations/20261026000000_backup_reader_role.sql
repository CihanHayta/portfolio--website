-- Otomatik yedekleme için SALT OKUNUR rol (GitHub Actions, gizli "persona-yedek" deposu).
-- - Yalnızca SELECT: public şeması (blog + AI tabloları), Storage nesne listesi,
--   migration geçmişi. Yazma, silme, şema değiştirme yetkisi yoktur.
-- - Varsayılan işlem salt okunurdur (default_transaction_read_only).
-- - RLS'i atlar (BYPASSRLS): taslaklar ve yönetici kayıtları da yedeklenebilsin.
-- - Rol NOLOGIN oluşturulur. Giriş yetkisi ve şifre bu dosyada DEĞİL, Yönetim
--   API'siyle ayrıca verilir (yalnızca SCRAM özeti; düz şifre hiçbir yere yazılmaz).
-- Görsel dosyaları herkese açık kovadan indirilir; bu rol Storage'a yazamaz.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'persona_backup') then
    create role persona_backup nologin noinherit nocreatedb nocreaterole noreplication bypassrls;
  end if;
end
$$;

alter role persona_backup set default_transaction_read_only = on;
alter role persona_backup set statement_timeout = '60s';

grant usage on schema public to persona_backup;
grant select on all tables in schema public to persona_backup;
alter default privileges in schema public grant select on tables to persona_backup;

grant usage on schema storage to persona_backup;
grant select on storage.objects, storage.buckets to persona_backup;

grant usage on schema supabase_migrations to persona_backup;
grant select on supabase_migrations.schema_migrations to persona_backup;

-- DOWN (gerekirse, önce GitHub'daki BACKUP_DB_URL silinir):
--   alter default privileges in schema public revoke select on tables from persona_backup;
--   drop owned by persona_backup;
--   drop role persona_backup;
