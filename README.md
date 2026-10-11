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

Veriler Supabase'de durur (Postgres + Storage + Auth). Yetkilendirmenin tamamı
`supabase/migrations/` içindeki RLS politikalarıyla yapılır; uygulama yalnızca
anon anahtarı kullanır, `service_role` anahtarına ihtiyaç yoktur.

### Kurulum (bir kez)

1. [supabase.com](https://supabase.com) üzerinde bir proje oluştur.
2. SQL Editor'da `supabase/migrations/20261011000000_blog.sql` dosyasının
   içeriğini çalıştır (tablolar, RLS politikaları, `blog-media` kovası ve
   başlangıç kategorileri oluşur).
3. Authentication → Users → **Add user** ile yönetici hesabını (e-posta +
   parola) oluştur. Authentication → Sign In / Providers altında **Allow new
   users to sign up** seçeneğini kapat.
4. SQL Editor'da hesabı yönetici yap:

   ```sql
   insert into public.blog_admins (user_id, display_name)
   select id, 'Cihan Hayta' from auth.users where email = 'SENIN@EPOSTAN.com';
   ```

5. `.env.example` dosyasını `.env.local` olarak kopyalayıp Supabase URL ve anon
   anahtarını yaz. Aynı üç değişkeni Vercel → Settings → Environment
   Variables'a da ekle.

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
