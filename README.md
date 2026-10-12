# Cihan Hayta — Portfolio

Next.js (App Router) + vanilla CSS portfolio, with Framer Motion for
animation and Lucide icons. Built to showcase SaaS products.

## Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Where everything lives

- `data/content.js` — **the only file you need to edit for content.**
  Name, bio, contact info, socials, nav links, gallery items, services,
  process steps, and projects all live here as plain data.
- `components/` — one folder-free component + CSS Module pair per
  section (`Hero`, `Gallery`, `Services`, `Process`, `Work`, `Contact`,
  `Header`). Each `X.jsx` pairs with `X.module.css`.
- `components/MediaFrame.jsx` — renders a project/service image if you
  give it one, otherwise falls back to a placeholder tile (icon +
  label). This is what shows up as the dotted tiles right now.
- `app/globals.css` — theme variables at the top (`--color-accent`,
  fonts, radii) plus shared `.btn`, `.eyebrow` utility classes used
  across sections.

## Adding your own projects / screenshots

1. Drop an image in `public/images/` (e.g. `taskflow.png`).
2. In `data/content.js`, set that project's (or service's, or gallery
   item's) `image` field to `"/images/taskflow.png"`. The placeholder
   tile is automatically replaced with your image.
3. Add more entries to the `projects` array freely — the Work section
   paginates automatically once there are more than 4.

## Blog ve yönetim paneli

- `/blog` — yazı listesi (arama, kategori filtresi, sayfalama)
- `/blog/[slug]` — yazı sayfası (içindekiler, ilgili yazılar, JSON-LD)
- `/admin/blog` — giriş gerektiren yönetim paneli (editör, medya, kategoriler, etiketler)

Yazılar blok tabanlı bir editörle hazırlanır (`components/admin/builder/`):
solda blok kütüphanesi ve şablonlar, ortada tuval, sağda seçili bloğun
ayarları. Blok türleri ve alanları tek bir şemada tanımlıdır
(`lib/blog/blocks/registry.js`); ayar paneli, sunucu doğrulaması ve yayındaki
görünüm (`components/blog/Blocks.jsx`) aynı şemadan beslenir. İçerik
`blog_posts.content` sütununda `{ type: "blocks", blocks: [...] }` olarak
saklanır; eski (Tiptap) biçimindeki yazılar da okunur ve editörde açıldığında
bloklara çevrilir. Blok modelinin birim testleri: `npm test`.

Veriler Supabase'de durur (Postgres + Storage + Auth). Yetkilendirmenin tamamı
`supabase/migrations/` içindeki RLS politikalarıyla yapılır; uygulama yalnızca
anon anahtarı kullanır, `service_role` anahtarına ihtiyaç yoktur.

### Kurulum

Canlı site `portfollio` adlı Supabase projesine bağlıdır; şema Supabase CLI
ile yönetilir:

```bash
npx supabase login
npx supabase link --project-ref <proje-ref>
npx supabase db push        # supabase/migrations içindekileri uygular
npx supabase config push    # supabase/config.toml (kayıt kapalı, site adresi)
```

Yönetici eklemek için: Dashboard → Authentication → Users → **Add user**
(Auto Confirm açık), ardından SQL Editor'da:

```sql
insert into public.blog_admins (user_id, display_name)
select id, 'Ad Soyad' from auth.users where email = 'eposta@ornek.com';
```

Yeni kullanıcı kaydı kapalıdır (`[auth] enable_signup = false`); yalnızca
`blog_admins` tablosundaki hesaplar panele girebilir.

Ortam değişkenleri `.env.example` dosyasında listelidir; yerelde `.env.local`
içine, canlıda Vercel → Settings → Environment Variables'a yazılır.

Blog başlığı, alıntı, üst görsel ve yazar kartı metinleri `data/content.js`
içindeki `blog` nesnesinden düzenlenir.

## Project videos

A project with `video` + `poster` fields in `data/content.js` shows a muted
product video preview on its card (`components/ProjectVideo.jsx`): poster
first, plays only while visible, one card at a time, never autoplays under
`prefers-reduced-motion` or data saver. The videos are generated from real
app screenshots in `public/projects/` by the Remotion project in `video/` —
see `video/README.md`.

## Customizing the look

- Accent color: `--color-accent` in `app/globals.css` (currently a
  lime/yellow-green to match the reference design).
- Fonts: set in `app/layout.js` via `next/font/google`
  (`Playfair Display` for headings, `Manrope` for body/nav).
- Favicon: replace `app/favicon.ico`.

## Stack

- Next.js 16 (App Router, JavaScript)
- Vanilla CSS via CSS Modules — no Tailwind/UI kit
- Framer Motion — scroll reveals, accordion, shared-element hover on
  the process circles, page-transition on project pagination
- lucide-react — icon set (GitHub/LinkedIn/X marks are small local SVGs
  in `components/icons.jsx` since lucide dropped brand logos)
