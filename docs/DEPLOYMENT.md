# Dağıtım (Vercel)

Durum tarihi: **2026-10-31**.

## Özet

| | |
|---|---|
| Vercel projesi | `portfolio-website` → personadijitalpazarlama.com |
| Plan | **Hobby**. Vercel API'siyle doğrulandı. Hobby yalnızca ticari olmayan kullanım içindir; bkz. `COMMERCIAL_READINESS.md`. Plan değiştirilmedi. |
| Fonksiyonlar | Fluid compute, bölge `iad1` |
| Next.js | **16.4.3** (`latest`). Canlı tarayıcıda `window.next.version` ile doğrulandı. |
| Canlıya çıkış | `main`'e push → otomatik production dağıtımı. Diğer dallar korumalı Preview. |
| Son kod dağıtımı | `31a1dc6` → `dpl_38XKSBdiotWabMpHmfUiJsvAi2AJ` (2026-10-26). Bundan sonraki commit'ler yalnızca belge değişikliğidir. |
| Çalışma öncesi canlı | `a576171` → `dpl_BRE4P4mCxpFt7xv8m42F8qjxFToJ` (Next.js 16.2.12) |

### Bu çalışmada yapılan canlı dağıtımlar (2026-10-26)

| Commit | Dağıtım | İçerik |
|---|---|---|
| `f7f25e9` | `dpl_CFcbGNn5o9TN6x57spNeZiThoYsf` | Next.js 16.4.3, güvenlik başlıkları, AI rotasyonu, kalıcı limitler |
| `efd033b` | `dpl_6kNcE3a55C94mXmVvY5zAeRr8swV` | Editörde aralıklı React #185 döngüsü giderildi |
| `70b482b` | `dpl_DE7fLC3Vo1HdL5p8wJv78Q9697aY` | Hızlı yazımda karakter kaybı giderildi; mobil alt çubuk, tek dokunuşla logo, onaylı yayın |
| `8da1c51` | `dpl_GyzSMAVwkNaYK4Hmh8dMfPrh6sE1` | Görsel planında yedek servise süre ayrılır |
| `18bbab7` | `dpl_56NFmG1Afsoye79g8PM9AoJ63wQg` | Erişilebilirlik düzeltmesi ve axe testi |
| `31a1dc6` | `dpl_38XKSBdiotWabMpHmfUiJsvAi2AJ` | Stüdyo: genişletme hatasında taslak korunur; yedek betikleri; belgeler |

### Blog sistemi kapsamlı turu (2026-10-30/31) — durum

| Adım | Durum |
|---|---|
| Kod | `blok-editoru` dalı, `ea1641b` + test kurulumu düzeltmesi. `main` hâlâ `abbed4c` (canlı kod `31a1dc6`). |
| Son Preview | `dpl_GDpiimw2KcTrDVXCH2KUTHz3WHtb` (TEST veritabanı). Geçen takımlar: admin-login, footer, public-seo, public-article (5 genişlik), blog-list, theme, image-sections, sources, block-ai-image, dnd, overlay (WebKit + Chromium), a11y, ai-write-flow, blog-flow (gerçek OVH), ai-write-mobile (Gemini'siz mod). |
| Canlı migration `20261027000000_studio_drafts` | **Site sahibinin komutunu bekliyor.** 2026-10-30: taze yedek (`/Volumes/Hayta-SSD/persona-yedekler/2026-10-29-parti-a-oncesi`), `--dry-run --only` başarılı; uygulama otomatik güvenlik denetiminde yine durduruldu. |
| Canlı kod | Migration'dan SONRA: `git push origin <sha>:main`, ardından `live-admin` (`E2E_ALLOW_PRODUCTION=1`), `public-seo`, `footer`, `admin-login`. |
| Yedek rolü `20261026000000` | `--dry-run --only` başarılı (2026-10-31). Rol + GitHub gizli değişkeni adımı site sahibinde (`BACKUP_AND_RESTORE.md`). |

### Görseller, sürükle-bırak ve kalıcı stüdyo turu (2026-10-29) — durum

| Adım | Durum |
|---|---|
| Kod | `blok-editoru` dalı, `3d90db9` ve sonrası (yalnızca test/belge) |
| Preview | `dpl_2ymM9DDsrMDPMn7KUybGodhopiTf` (TEST veritabanı) — studio-images, dnd, ai-write-flow, overlay (WebKit + Chromium), a11y, visual-studio geçti |
| Canlı migration `20261027000000_studio_drafts` | **Onay bekliyor.** Yedek alındı (`/Volumes/Hayta-SSD/persona-yedekler/2026-10-29-studio-oncesi`, depo dışında), `--dry-run --only` başarılı. Uygulama otomatik güvenlik denetiminde onay istedi. |
| Canlı kod dağıtımı | Migration'dan SONRA: `git push origin <sha>:main` (ileri sarma), ardından live-admin, public-seo, footer, admin-login |

Migration uygulanmadan kod canlıya alınırsa yayın bozulmaz (AI/köken bilgisi atlanarak görseller kaydedilir), ancak taslak oturumu ve ekran görüntüleri yalnızca tarayıcıda kalır ve "Seçimler kaydedilemedi" uyarısı görünür. Bu yüzden sıra: migration → kod.

Komut (canlı, yalnızca bu migration):

```bash
node scripts/supabase/project.mjs migrate linked --dry-run --only 20261027000000
node scripts/supabase/project.mjs migrate linked --only 20261027000000
node scripts/supabase/project.mjs status linked
```

## Ortam değişkenleri

Gerçek değerler bu belgede ve depoda **yer almaz**. Vercel'de tümü *Sensitive* türündedir.

| Değişken | Production | Preview | Not |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Canlı proje | **Test projesi** (`portfolio-test`) | Preview canlı veritabanına yazamaz |
| `NEXT_PUBLIC_SITE_URL` | Alan adı | Alan adı | |
| `GEMINI_API_KEY` | Tanımlı | Yok | Preview'da metin yalnızca OVH yedeğiyle üretilir |
| `AI_USAGE_STORE` | `supabase` | `supabase` | 2026-10-26'da eklendi |
| Groq, OpenRouter, Cloudflare, ComfyUI, Design Arena anahtarları | Yok | Yok | `AI_PROVIDERS_AND_LIMITS.md` |
| `JINA_API_KEY`, `FIRECRAWL_API_KEY` | Yok | Yok | Bilinçli olarak eklenmedi |

**Ekleme ve değiştirme:** Vercel paneli ya da CLI kullanılır. Değer komut satırına yazılmaz; standart girdiden verilir:

```bash
vercel link --project portfolio-website      # geçici bir klasörde; .env.local indirirse hemen silin
printf '%s' "$DEGER" | vercel env add DEGISKEN production
vercel env ls                                # yalnızca adlar ve hedefler
```

Değişiklik **yeni bir dağıtımdan sonra** etkin olur.

**`AI_USAGE_STORE=supabase`'in canlıda çalıştığı nasıl doğrulanır:**
1. Yönetim → *AI Servisleri* ekranında "Depo: supabase" yazmalı.
2. `E2E_ALLOW_PRODUCTION=1 node tests/e2e/live-admin.e2e.mjs`. Bu test bir görsel planı üretir ve canlı `ai_usage_counters` sayacının arttığını doğrular (2026-10-26: geçti).

## Canlıya alma sırası

1. **Kapılar:**

   ```bash
   npm run lint && npm test && npm run build && npm audit
   node scripts/security/scan-secrets.mjs --supabase
   INTEGRATION_TARGET=test npm run test:integration
   ```

   Proje JavaScript ile yazılmış ve TypeScript kurulu değil; ayrı bir tür kontrolü yok.
2. **Preview:** dalı push edin. Vercel Preview'ı derler; Preview test projesine bağlıdır. Korumalı Preview'da testler:

   ```bash
   P=https://<preview>.vercel.app
   BASE_URL=$P node scripts/e2e/with-preview-bypass.mjs node tests/e2e/public-seo.e2e.mjs
   BASE_URL=$P E2E_TEXT_SERVICE=text:ovh node scripts/e2e/with-preview-bypass.mjs node tests/e2e/blog-flow.e2e.mjs
   BASE_URL=$P node scripts/e2e/with-preview-bypass.mjs node tests/e2e/a11y.e2e.mjs
   ```

   Atlatma anahtarı Vercel API'sinden bellekte alınır ve yazdırılmaz.
3. **Canlı:** `git push origin <commit>:main`. Yalnızca ileri sarma yapılır, force push yok.
4. **Doğrulama:**
   - `vercel inspect personadijitalpazarlama.com` yeni dağıtım kimliğini göstermeli.
   - Güvenlik başlıkları gelmeli.
   - Tarayıcıda `window.next.version` doğru sürümü vermeli.
5. **Canlı smoke testleri:**

   ```bash
   BASE_URL=https://personadijitalpazarlama.com node tests/e2e/public-seo.e2e.mjs
   BASE_URL=https://personadijitalpazarlama.com node tests/e2e/footer.e2e.mjs
   BASE_URL=https://personadijitalpazarlama.com node tests/e2e/admin-login.e2e.mjs
   E2E_ALLOW_PRODUCTION=1 node tests/e2e/live-admin.e2e.mjs    # izole, kendini temizler
   vercel logs <dağıtım> --since 30m --json                     # 5xx, Supabase ve ortam değişkeni hataları
   ```

   `live-admin.e2e.mjs` geçici bir yöneticiyle tek bir `e2e-` yazısı oluşturur. Yazıyı birkaç saniye yayınlar, **arayüzden** yayından kaldırır (önbellek tazelenir) ve 404 döndüğünü doğrular. Sonra yazıyı ve kullanıcıyı siler; canlı kayıt sayılarının ve limit ayarlarının değişmediğini doğrular.

## Geri alma

- **Kod:** Vercel paneli → Deployments → önceki dağıtım → *Instant Rollback*, ya da:

  ```bash
  vercel rollback <dağıtım-kimliği>
  ```

  Örnek: `vercel rollback dpl_DE7fLC3Vo1HdL5p8wJv78Q9697aY`. Çalışma öncesine dönmek için `dpl_BRE4P4mCxpFt7xv8m42F8qjxFToJ`; ancak orada Next.js 16.2.12'deki açıklar geri gelir.
- **Veritabanı:** Bu çalışmanın migration'ları yalnızca ekleme yapar. Eski kod onları kullanmaz, geri almak gerekmez. DOWN adımları migration dosyalarının sonundadır.

## Öneriler (uygulanmadı)

- **Bölge:** Veritabanı Seul'de, fonksiyonlar Washington'da. Vercel → Settings → Functions → Region = `icn1`.
- **Plan:** Ticari kullanım için Vercel Pro gerekir. Satın alma kararı site sahibinindir.
- **İş kuyruğu yok:** Uzun AI işleri tek istekte çalışır. Görsel planında üst sınır 90 sn, diğer AI uçlarında 60 sn. Çift başlatma `ai_begin_job` ile engellenir.
