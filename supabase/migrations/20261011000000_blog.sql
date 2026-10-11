-- Blog sistemi: yazılar, kategoriler, etiketler, medya ve yönetici yetkisi.
-- Supabase SQL Editor'da ya da `psql "$SUPABASE_DB_URL" -f` ile bir kez çalıştırılır.
-- Mevcut hiçbir tabloyu değiştirmez veya silmez.

-- ---------------------------------------------------------------------------
-- Yönetici yetkisi
-- ---------------------------------------------------------------------------

create table public.blog_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

alter table public.blog_admins enable row level security;

-- RLS politikalarının içinden çağrılır; security definer olduğu için
-- blog_admins tablosunun kendi RLS'ine takılmaz.
create function public.is_blog_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blog_admins where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_blog_admin() from public;
grant execute on function public.is_blog_admin() to anon, authenticated;

create policy "Yöneticiler yönetici listesini görür"
  on public.blog_admins for select
  to authenticated
  using (public.is_blog_admin());

-- ---------------------------------------------------------------------------
-- Kategoriler ve etiketler
-- ---------------------------------------------------------------------------

create table public.blog_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '',
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.blog_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Medya
-- ---------------------------------------------------------------------------

create table public.blog_media (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  url text not null,
  mime_type text not null,
  size_bytes int not null check (size_bytes > 0),
  width int not null check (width > 0),
  height int not null check (height > 0),
  alt_text text not null default '',
  caption text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Yazılar
-- ---------------------------------------------------------------------------

create type public.blog_post_status as enum ('draft', 'published');

create table public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null default '' check (char_length(title) <= 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  excerpt text not null default '' check (char_length(excerpt) <= 200),
  -- Tiptap (ProseMirror) JSON belgesi.
  content jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  -- Arama ve okuma süresi için içerikten türetilen düz metin.
  content_text text not null default '',
  reading_minutes int not null default 1 check (reading_minutes > 0),
  cover_media_id uuid references public.blog_media (id) on delete set null,
  cover_alt text not null default '',
  category_id uuid references public.blog_categories (id) on delete set null,
  author_id uuid references auth.users (id) on delete set null,
  author_name text not null default '',
  status public.blog_post_status not null default 'draft',
  -- Gelecekteki bir published_at "planlanmış" yazı demektir; zamanı gelince
  -- herkese açık politikaya kendiliğinden girer.
  published_at timestamptz,
  is_featured boolean not null default false,
  seo_title text not null default '' check (char_length(seo_title) <= 70),
  seo_description text not null default '' check (char_length(seo_description) <= 160),
  canonical_url text not null default '',
  -- İyimser eşzamanlılık: her kayıtta bir artar.
  revision int not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint published_needs_date check (status = 'draft' or published_at is not null)
);

create index blog_posts_public_idx
  on public.blog_posts (published_at desc)
  where status = 'published' and deleted_at is null;
create index blog_posts_category_idx on public.blog_posts (category_id);
create index blog_posts_updated_idx on public.blog_posts (updated_at desc);

create table public.blog_post_tags (
  post_id uuid not null references public.blog_posts (id) on delete cascade,
  tag_id uuid not null references public.blog_tags (id) on delete cascade,
  primary key (post_id, tag_id)
);

create index blog_post_tags_tag_idx on public.blog_post_tags (tag_id);

-- Yayımlanmış bir yazının slug'ı değişirse eski adres yenisine yönlenir.
create table public.blog_slug_redirects (
  old_slug text primary key,
  post_id uuid not null references public.blog_posts (id) on delete cascade,
  created_at timestamptz not null default now()
);

create function public.blog_posts_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger blog_posts_before_update
  before update on public.blog_posts
  for each row execute function public.blog_posts_before_update();

create function public.blog_posts_track_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Yeni slug daha önce yönlendirme olarak kayıtlıysa o kayıt artık geçersiz.
  delete from public.blog_slug_redirects where old_slug = new.slug;
  if old.published_at is not null then
    insert into public.blog_slug_redirects (old_slug, post_id)
    values (old.slug, new.id)
    on conflict (old_slug) do update set post_id = excluded.post_id;
  end if;
  return null;
end;
$$;

create trigger blog_posts_track_slug
  after update of slug on public.blog_posts
  for each row
  when (old.slug is distinct from new.slug)
  execute function public.blog_posts_track_slug();

-- Bir medya dosyasının kaç yazıda (kapak ya da içerik) kullanıldığını döndürür.
create function public.blog_media_usage(media_id uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select count(*)::int
  from public.blog_posts p
  join public.blog_media m on m.id = media_id
  where p.cover_media_id = m.id
     or position(m.storage_path in p.content::text) > 0;
$$;

-- ---------------------------------------------------------------------------
-- Satır düzeyi güvenlik
-- ---------------------------------------------------------------------------

alter table public.blog_categories enable row level security;
alter table public.blog_tags enable row level security;
alter table public.blog_media enable row level security;
alter table public.blog_posts enable row level security;
alter table public.blog_post_tags enable row level security;
alter table public.blog_slug_redirects enable row level security;

create policy "Herkes kategorileri okur" on public.blog_categories
  for select to anon, authenticated using (true);
create policy "Yöneticiler kategorileri yönetir" on public.blog_categories
  for all to authenticated
  using (public.is_blog_admin()) with check (public.is_blog_admin());

create policy "Herkes etiketleri okur" on public.blog_tags
  for select to anon, authenticated using (true);
create policy "Yöneticiler etiketleri yönetir" on public.blog_tags
  for all to authenticated
  using (public.is_blog_admin()) with check (public.is_blog_admin());

create policy "Herkes medya kayıtlarını okur" on public.blog_media
  for select to anon, authenticated using (true);
create policy "Yöneticiler medyayı yönetir" on public.blog_media
  for all to authenticated
  using (public.is_blog_admin()) with check (public.is_blog_admin());

-- Taslaklar, planlanmış ve çöp kutusundaki yazılar ziyaretçiye hiç dönmez.
create policy "Herkes yayımlanmış yazıları okur" on public.blog_posts
  for select to anon, authenticated
  using (status = 'published' and deleted_at is null and published_at <= now());
create policy "Yöneticiler yazıları yönetir" on public.blog_posts
  for all to authenticated
  using (public.is_blog_admin()) with check (public.is_blog_admin());

create policy "Herkes yayımlanmış yazıların etiketlerini okur" on public.blog_post_tags
  for select to anon, authenticated
  using (exists (select 1 from public.blog_posts p where p.id = post_id));
create policy "Yöneticiler yazı etiketlerini yönetir" on public.blog_post_tags
  for all to authenticated
  using (public.is_blog_admin()) with check (public.is_blog_admin());

create policy "Herkes slug yönlendirmelerini okur" on public.blog_slug_redirects
  for select to anon, authenticated using (true);
create policy "Yöneticiler slug yönlendirmelerini yönetir" on public.blog_slug_redirects
  for all to authenticated
  using (public.is_blog_admin()) with check (public.is_blog_admin());

grant select on public.blog_categories, public.blog_tags, public.blog_media,
  public.blog_posts, public.blog_post_tags, public.blog_slug_redirects to anon;
grant select, insert, update, delete on public.blog_categories, public.blog_tags,
  public.blog_media, public.blog_posts, public.blog_post_tags,
  public.blog_slug_redirects to authenticated;
grant select on public.blog_admins to authenticated;
grant execute on function public.blog_media_usage(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Dosya depolama: herkese açık okunan, yalnızca yöneticinin yazdığı kova
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blog-media', 'blog-media', true, 4194304, array['image/webp'])
on conflict (id) do nothing;

create policy "Yöneticiler blog görseli yükler" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'blog-media' and public.is_blog_admin());
create policy "Yöneticiler blog görselini günceller" on storage.objects
  for update to authenticated
  using (bucket_id = 'blog-media' and public.is_blog_admin());
create policy "Yöneticiler blog görselini siler" on storage.objects
  for delete to authenticated
  using (bucket_id = 'blog-media' and public.is_blog_admin());
create policy "Yöneticiler blog görsellerini listeler" on storage.objects
  for select to authenticated
  using (bucket_id = 'blog-media' and public.is_blog_admin());

-- ---------------------------------------------------------------------------
-- Başlangıç kategorileri
-- ---------------------------------------------------------------------------

insert into public.blog_categories (name, slug, position) values
  ('Teknoloji', 'teknoloji', 1),
  ('Dijital Pazarlama', 'dijital-pazarlama', 2),
  ('Ürün Geliştirme', 'urun-gelistirme', 3),
  ('Girişimcilik', 'girisimcilik', 4),
  ('Yaşam', 'yasam', 5);
