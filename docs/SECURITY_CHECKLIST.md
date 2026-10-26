# Güvenlik kontrol listesi

Son kontrol: **2026-10-26** (canlı: `31a1dc6`).

Depo herkese açık olduğu için giriş güvenliği ayarlarının ayrıntısı ve açık risklerin listesi yerel `docs/private/SECURITY_NOTES.md` dosyasındadır. O dosya git'e girmez.

## Kontroller

| # | Kontrol | Durum | Kanıt / komut |
|---|---|---|---|
| 1 | Bağımlılık açıkları | ✓ | `npm audit`: 0. Next.js **16.4.3** canlıda (tarayıcıda `window.next.version`). GitHub Advisory veritabanında 16.4.3'ü etkileyen danışma yok (2026-10-26). Next'e gömülü React 19.3.0-canary, Temmuz 2026 React danışmasından daha yeni. |
| 2 | Gizli anahtar sızıntısı | ✓ | `node scripts/security/scan-secrets.mjs --supabase`: çalışma dizini, tüm git geçmişi ve istemci paketi taranır; canlı ve test service-role anahtarları da aranır. Sonuç temiz. Değer yazdırılmaz; sahte anahtarla yakaladığı doğrulandı. |
| 3 | Dağıtım günlükleri | ✓ | Canlı Vercel günlüklerinde anahtar biçimli içerik yok, 5xx yok (2026-10-26). AI günlükleri istem ve anahtar içermez (birim testi). |
| 4 | Service-role anahtarı | ✓ | Uygulama kodunda yok. Yalnızca yerel bakım betikleri bellekte kullanır. |
| 5 | İstemciye gizli değişken | ✓ | `"use client"` dosyalarında `NEXT_PUBLIC_` dışı değişken yok; istemci paketi taraması temiz. |
| 6 | Veritabanı yetkileri | ✓ | 12 tablonun hepsinde RLS; `anon` AI nesnelerine erişemez. Entegrasyon testi yetkisiz yazma, okuma, AI ve yüklemenin reddini doğruluyor (7/7). |
| 7 | Yönetim sayfaları ve API | ✓ | `proxy.js` + `requireAdmin`. Oturumsuz POST 401 döner (canlıda test edildi). Çıkıştan sonra panel giriş ekranına döner (canlıda test edildi). |
| 8 | Giriş | ✓ | Yanlış şifre anlaşılır mesajla reddediliyor; doğru şifreyle panel açılıyor (canlı). Giriş yavaşlatma var. Ayarların ayrıntısı yerel notta. |
| 9 | Preview yalıtımı | ✓ | Preview dağıtımları **test** Supabase projesine bağlı; Vercel Authentication ile korunuyor. Testler otomasyon atlatma anahtarıyla girer; anahtar yazdırılmaz. |
| 10 | Güvenlik başlıkları | ✓ | Canlıda gönderiliyor: `nosniff`, `X-Frame-Options: SAMEORIGIN`, `CSP frame-ancestors 'self'`, `Referrer-Policy`, `Permissions-Policy`. Tam bir CSP (script-src) yok. |
| 11 | SSRF (URL okuyucu) | ✓ | `tests/netguard.test.mjs` (8 test). |
| 12 | Yükleme | ✓ | webp'ye dönüştürme, 4 MB sınırı, kova türü kısıtı, kullanılan görsel silinemez (entegrasyon testi). |
| 13 | XSS | ✓ | JSON-LD kaçışlı; içerik blok şemasıyla doğrulanır. |
| 14 | AI maliyeti | ✓ | Yalnızca ücretsiz servisler (FREE_ONLY) kilitli. Hesaba bağlı servisler onaysız kullanılmaz. Canlıda kalıcı depo etkin. 402 yanıtı servisi 24 saat kapatır. Ücretli servise hiçbir koşulda geçilmez. |
| 15 | Yedek erişimi | ✓ (hazır) | Ayrı ve salt okunur `persona_backup` rolü; şifre yalnızca SCRAM özeti olarak veritabanında. Yedekler şifreli; çözme anahtarı yalnızca site sahibinde. Canlıya bağlama adımı onay bekliyor (`BACKUP_AND_RESTORE.md`). |
| 16 | Erişilebilirlik (bilgi) | ✓ | `tests/e2e/a11y.e2e.mjs`: 9 ekran × 2 görünüm, kritik ya da ciddi bulgu yok. |

## Her dağıtımdan önce

```bash
npm audit
node scripts/security/scan-secrets.mjs --supabase
npm run lint && npm test && npm run build
INTEGRATION_TARGET=test npm run test:integration
BASE_URL=https://personadijitalpazarlama.com node tests/e2e/public-seo.e2e.mjs
```

Next.js danışmaları için:

```bash
gh api "/advisories?ecosystem=npm&affects=next@$(node -p 'require("next/package.json").version')"
```
