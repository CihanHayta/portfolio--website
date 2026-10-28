-- AI Blog Stüdyosu: taslak oturumu, medya kökeni ve kaynak ekran görüntüleri.
-- YALNIZCA EKLEME yapar; mevcut tablo, kayıt ve politikalar değişmez, eski yazılar
-- ve görseller aynen çalışır. Tekrar çalıştırılabilir (if not exists / on conflict).
--
-- 1) blog_media: görselin nereden geldiği (yükleme, kaynak sayfa, AI, ChatGPT ile
--    elle devir, ekran görüntüsü), kaynak adresi, gerçek sağlayıcı/model ve hangi
--    taslak için alındığı. Hepsi boş bırakılabilir (eski kayıtlar için null).
-- 2) blog_studio_sessions: taslağa bağlı stüdyo oturumu (kaynak URL ve metni, ekran
--    görüntüleri, kaynak görsel seçimleri ve hedef bölümleri, AI sonuçları, seçilen
--    içerik yaklaşımları). Tarayıcı belleği tek kaynak değildir; yenileme ve başka
--    cihaz sonrası buradan yüklenir.
-- 3) studio-sources: HERKESE KAPALI kova. Kaynak ekran görüntüleri blog görseli
--    değildir; yayımlanmaz, yalnızca yönetici okuyabilir.

alter table public.blog_media
  add column if not exists origin text,
  add column if not exists source_url text,
  add column if not exists provider text,
  add column if not exists model text,
  -- Bilerek YABANCI ANAHTARSIZ: blog_media → blog_posts ikinci bir ilişki olursa
  -- PostgREST'teki "cover:blog_media(...)" gömmeleri belirsizleşir (PGRST201) ve
  -- mevcut sorgular (canlı blog dâhil) bozulur. Bu yalnızca köken bilgisidir.
  add column if not exists draft_post_id uuid;

-- Önceki bir denemede eklenmiş olabilecek yabancı anahtar kaldırılır (yalnızca kısıt; veri değişmez).
alter table public.blog_media drop constraint if exists blog_media_draft_post_id_fkey;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'blog_media_origin_check') then
    alter table public.blog_media add constraint blog_media_origin_check
      check (origin is null or origin in ('upload', 'source', 'ai', 'handoff', 'screenshot'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'blog_media_meta_length_check') then
    alter table public.blog_media add constraint blog_media_meta_length_check
      check (char_length(coalesce(source_url, '')) <= 2000 and char_length(coalesce(provider, '')) <= 60 and char_length(coalesce(model, '')) <= 160);
  end if;
end
$$;

create index if not exists blog_media_draft_post_idx on public.blog_media (draft_post_id) where draft_post_id is not null;

create table if not exists public.blog_studio_sessions (
  post_id uuid primary key references public.blog_posts (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint blog_studio_sessions_size_check check (pg_column_size(data) <= 1048576)
);

alter table public.blog_studio_sessions enable row level security;
revoke all on table public.blog_studio_sessions from anon;
grant select, insert, update, delete on table public.blog_studio_sessions to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'blog_studio_sessions' and policyname = 'Yöneticiler stüdyo oturumlarını yönetir') then
    create policy "Yöneticiler stüdyo oturumlarını yönetir" on public.blog_studio_sessions
      for all to authenticated
      using (public.is_blog_admin()) with check (public.is_blog_admin());
  end if;
end
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('studio-sources', 'studio-sources', false, 8388608, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Yöneticiler stüdyo kaynaklarını okur') then
    create policy "Yöneticiler stüdyo kaynaklarını okur" on storage.objects
      for select to authenticated using (bucket_id = 'studio-sources' and public.is_blog_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Yöneticiler stüdyo kaynağı yükler') then
    create policy "Yöneticiler stüdyo kaynağı yükler" on storage.objects
      for insert to authenticated with check (bucket_id = 'studio-sources' and public.is_blog_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Yöneticiler stüdyo kaynağını siler') then
    create policy "Yöneticiler stüdyo kaynağını siler" on storage.objects
      for delete to authenticated using (bucket_id = 'studio-sources' and public.is_blog_admin());
  end if;
end
$$;

-- DOWN (gerekirse; önce yedek alınır):
--   drop policy "Yöneticiler stüdyo kaynaklarını okur" on storage.objects;  (ve diğer iki politika)
--   delete from storage.objects where bucket_id = 'studio-sources'; delete from storage.buckets where id = 'studio-sources';
--   drop table public.blog_studio_sessions;
--   alter table public.blog_media drop constraint blog_media_origin_check, drop constraint blog_media_meta_length_check,
--     drop column origin, drop column source_url, drop column provider, drop column model, drop column draft_post_id;
