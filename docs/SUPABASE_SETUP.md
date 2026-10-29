# Supabase kurulumu ve bakım

Durum tarihi: **2026-10-26**.

## Projeler

| | Canlı | Test |
|---|---|---|
| Ad | `portfollio` | `portfolio-test` |
| Bölge | ap-northeast-2 (Seul) | eu-central-1 (Frankfurt) |
| Postgres | 17.11 | 17.11 |
| Plan | Free (otomatik yedek yok) | Free |
| Kullananlar | personadijitalpazarlama.com (Vercel Production) ve yerel `.env.local` | Vercel **Preview**, `scripts/supabase/dev-test.mjs`, entegrasyon ve E2E testleri |
| Migration geçmişi | 4/5 (son migration onay bekliyor; aşağıda) | 5/5 |

> **Dikkat:** Yerel `.env.local` canlı projeyi gösterir. Deneme yapmak için test sunucusunu kullanın:
>
> ```bash
> node scripts/supabase/dev-test.mjs           # http://localhost:3100, geliştirme modu
> node scripts/supabase/dev-test.mjs --prod    # production derlemesi (Vercel'e yakın)
> TZ=UTC GEMINI_API_KEY= node scripts/supabase/dev-test.mjs --prod   # Preview'ı taklit eder
> ```
>
> `.env.local` değişmez; test projesinin adresi ve anon anahtarı yalnızca sürecin ortamına verilir.

Test projesinin kimliği ve veritabanı şifresi git dışındaki `supabase/.env.test.local` dosyasındadır (0600).

## Şema (`supabase/migrations/`)

| Migration | İçerik | Canlı |
|---|---|---|
| `20261011000000_blog.sql` | Blog tabloları, `is_blog_admin()`, RLS, `blog-media` kovası | ✓ |
| `20261011000100_blog_trigger_privileges.sql` | Tetikleyici yetkileri | ✓ |
| `20261023000000_ai_usage_jobs.sql` | AI limit deposu (sayaç, kilit, iş, olay tabloları ve RPC'ler) | ✓ (2026-10-24) |
| `20261024000000_ai_least_privilege.sql` | `anon` rolünden AI yetkileri alındı | ✓ (2026-10-24) |
| `20261026000000_backup_reader_role.sql` | Yedekleme için salt okunur `persona_backup` rolü | **Bekliyor**: `BACKUP_AND_RESTORE.md` → "Son adım" |
| `20261027000000_studio_drafts.sql` | Stüdyo: `blog_media` köken sütunları (`origin`, `source_url`, `provider`, `model`, `draft_post_id`), taslağa bağlı `blog_studio_sessions` (RLS: yalnızca yönetici), HERKESE KAPALI `studio-sources` kovası (ekran görüntüleri) | Test ✓ · **Canlı: onay bekliyor** (yedek 2026-10-29 alındı, kuru deneme başarılı) |

`draft_post_id` bilerek **yabancı anahtarsızdır**: `blog_media → blog_posts` ikinci bir ilişki olursa PostgREST'teki `cover:blog_media(...)` gömmeleri belirsizleşir (PGRST201) ve canlı blog sorguları bozulur. `verify-local-pg.sh` bunu denetler (yazı ↔ medya arasında tek yabancı anahtar).

**Canlıda doğrulanan güvenlik durumu:**
- `public` şemasındaki 12 tablonun hepsinde RLS açık; 18 tablo ve 4 depolama politikası var.
- Yazma ve AI işlemleri yalnızca `is_blog_admin()` oturumlarında çalışır.
- `blog-media` kovası herkese açık okunur; yalnızca `image/webp`, en fazla 4 MB; yazma yalnızca yöneticide.
- Uygulama yalnızca anon anahtarını kullanır; service-role anahtarı uygulama kodunda yoktur.
- Yeni kullanıcı kaydı kapalıdır (canlı ve test).

Auth ayarlarının ayrıntısı ve açık riskler, depo herkese açık olduğu için yerel `docs/private/SECURITY_NOTES.md` dosyasındadır (git dışında).

## Yönetici eklemek

1. Dashboard → Authentication → Users → **Add user** (Auto Confirm açık).
2. SQL Editor'da:

```sql
insert into public.blog_admins (user_id, display_name)
select id, 'Ad Soyad' from auth.users where email = 'eposta@ornek.com';
```

## Bakım betikleri

Kimlik doğrulaması bu makinedeki Supabase CLI oturumuyla yapılır (`npx supabase login`). Anahtarlar yalnızca bellekte tutulur.

```bash
node scripts/supabase/project.mjs status  linked|test
node scripts/supabase/project.mjs migrate test|linked [--dry-run] [--only <sürüm>]
node scripts/supabase/project.mjs create-test
node scripts/supabase/backup.mjs <klasör>        # salt okunur elle yedek
node scripts/supabase/restore.mjs <klasör>       # yalnızca test projesine, doğrulamalı
bash scripts/supabase/verify-local-pg.sh          # geçici yerel Postgres'te migration + paralel yarış testleri
```

`migrate` her migration'ı önce `BEGIN … ROLLBACK` içinde dener. Sonra SQL'i ve geçmiş satırını tek işlemde yazar (Supabase CLI `db push` ile uyumlu). Uzak geçmişte yerelde olmayan bir sürüm varsa durur. Migration geçmişi okunamazsa (zaman aşımı) geçmiş boş sayılmaz, betik durur. `--only <sürüm>` yalnızca o migration'ı uygular (ayrı onay gerektiren bağımsız migration'lar için).

**Yeni migration için güvenli sıra:**
1. Yedek alın.
2. `verify-local-pg.sh` çalıştırın.
3. `migrate test` ve `INTEGRATION_TARGET=test npm run test:integration`.
4. `migrate linked --dry-run`, ardından `migrate linked`, ardından `status linked`.

Canlıda `reset`, kontrolsüz `DROP` ve veri kaybettiren değişiklik yapılmaz.

## Entegrasyon testi (gerçek Supabase)

```bash
INTEGRATION_TARGET=test       npm run test:integration
INTEGRATION_TARGET=production npm run test:integration   # kısa, izole; kendini temizler
```

**Kapsam (7 test):**
- Doğru proje, şema ve migration geçmişi.
- Yetkisiz isteklerin reddi.
- Taslak oluşturma, okuma ve güncelleme; eski sürümle güncellemenin reddi.
- Slug çakışması; SEO, kategori ve etiket alanları.
- Yayınlama. Canlıda yayın tarihi ileridedir, herkese görünmez.
- Görsel yükleme; kullanılan görselin silinememesi; webp olmayan dosyanın reddi.
- AI sayaçlarında eşzamanlılık (8 paralel istekte limit 3) ve aynı işin tek kez başlaması.
- Silme.

**Sonuçlar:**
- Test projesi: 7/7 (2026-10-26).
- Canlı: 7/7 (2026-10-24).
- 2026-10-26'da canlı akış ayrıca tarayıcıdan `tests/e2e/live-admin.e2e.mjs` ile doğrulandı.

## Bölge notu

Veritabanı Seul'de, fonksiyonlar `iad1`'de (Washington). Öneri: Vercel fonksiyon bölgesini `icn1` yapmak. Uygulanmadı.
