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

### AI ile blog oluşturma

Blok editörünün sol panelinin altındaki **AI ile Blog Oluştur** düğmesi, verilen
bir makale bağlantısından yazıyı bloklar halinde doldurur. Akış sırayla ilerler ve her adım onay bekler:

1. **Kaynak analizi** — sayfa sunucuda güvenli biçimde okunur (`lib/ai/safeFetch.js`:
   özel/yerel IP, DNS, yönlendirme, süre ve boyut denetimleri) ve ana içerik
   çıkarılır (`lib/ai/extract.js`). İçerik yetersizse hata verir, içerik uydurulmaz.
2. **Görsel planı** — Gemini yalnızca kapak ve yazı içi görsellerin konseptini,
   alt metnini ve konumunu önerir. Makale bu aşamada yazılmaz.
3. **Görseller** — plan onaylanınca hazırlanır ve mevcut medya kütüphanesine
   (Supabase Storage + `blog_media`) kaydedilir.
4. **Makale** — görseller hazır olduktan sonra SEO alanları ve özgün Türkçe yazı
   üretilir (`lib/ai/tiptap.js`) ve editörün blok biçimine dönüştürülür
   (`sanitizeContent`).
5. **Önizleme ve yayın** — yazı, yayındaki blog sayfasının bileşenleriyle masaüstü
   ve mobil genişlikte gösterilir; alanlar düzenlenebilir, kalite denetimi
   (`lib/ai/quality.js`) çalışır. “Onayla ve Blogumu Yayınla” içeriği tek bir
   güncellemeyle kaydedip yayınlar (`publishGeneratedPost`) ve yazının herkese
   açık olduğunu doğrulamadan başarı bildirmez.

Maliyet ve servisler:

- **Metin:** Gemini API'nin ücretsiz katmanındaki modeller kullanılır
  (`FREE_TEXT_MODELS`). Kota ya da yoğunluk hatasında sıradaki ücretsiz modele
  geçilir; ücretli modele asla geçilmez. Bir yazı iki Gemini çağrısı harcar
  (plan + makale). Ücretsiz katmanda gönderilen içerik Google tarafından ürün
  geliştirmede kullanılabilir.
- **Görsel:** Gemini'nin görsel modellerinin ücretsiz katmanı yoktur, bu yüzden
  entegre edilmemiştir. Varsayılan, sunucuda çizilen **marka grafiğidir**
  (`lib/ai/graphics.js`; ücretsiz, sınırsız, yapay zekâ görseli değil). İsteğe
  bağlı olarak anahtarsız **Pollinations** seçilebilir: ücretsizdir ama düşük
  çözünürlüklüdür ve görsele kendi filigranını ekler.

Gerekli ortam değişkeni: `GEMINI_API_KEY` (yalnızca sunucu). Testler: `npm test`.

Gemini dışındaki ücretsiz sağlayıcılar (OVHcloud anonim yedek; anahtarla Groq,
OpenRouter, Cloudflare FLUX, ComfyUI), panelden yönetilen sıra ve limitler ile
canlıda gereken `AI_USAGE_STORE=supabase` için: `docs/AI_PROVIDERS_AND_LIMITS.md`.

### Operasyon belgeleri (`docs/`)

| Belge | İçerik |
|---|---|
| `PRODUCT_READINESS.md` | Genel durum, test sonuçları, açık konular |
| `DEPLOYMENT.md` | Vercel, ortam değişkenleri, canlıya alma ve geri alma |
| `SUPABASE_SETUP.md` | Projeler, şema, Auth, bakım betikleri, entegrasyon testi |
| `BACKUP_AND_RESTORE.md` | Yedek alma, test projesine geri yükleme, felaket adımları |
| `AI_PROVIDERS_AND_LIMITS.md` | Ücretsiz AI sağlayıcıları, ücret risk sınıfları, rotasyon, limitler |
| `SECURITY_CHECKLIST.md` | Güvenlik kontrolleri ve düzenli tekrar komutları |
| `COMMERCIAL_READINESS.md` | Lisanslar, platform şartları, KVKK, maliyet |

Panelde deneme yapmak için canlı yerine test veritabanına bağlı sunucuyu kullanın:
`node scripts/supabase/dev-test.mjs` (http://localhost:3100).

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
