# Ürün hazırlık durumu

Durum tarihi: **2026-10-26**. Canlı kod: `18bbab7` (`dpl_56NFmG1Afsoye79g8PM9AoJ63wQg`), Next.js 16.4.3.

## Özet

- **Güvenlik:** Next.js 16.4.3 ve güvenlik başlıkları canlıda.
- **Blog sistemi:** oluşturma, kaydetme, düzenleme, önizleme ve yayınlama canlıda tarayıcıdan doğrulandı.
- **AI:** kalıcı kullanım kayıtları canlıda Supabase'e yazılıyor; ücretli servise hiçbir koşulda geçilmiyor.
- **Mobil:**
  - Logo tek dokunuşla giriş ekranını açıyor.
  - Editörde alt işlem çubuğu (Önizle, Kaydet, Yayınla) var.
  - Yayın onaylı ve çift dokunmaya karşı korumalı.
  - Hızlı yazımda karakter kaybı giderildi.
- **Erişilebilirlik:** taranan ekranlarda kritik ya da ciddi bulgu yok.
- **Otomatik yedek:** hazır ve test projesiyle uçtan uca sınandı. Canlıya bağlama adımı site sahibinin onayını bekliyor.

## Bu çalışmada bulunup canlıda düzeltilen hatalar

| Hata | Etki | Düzeltme |
|---|---|---|
| Next.js 16.2.12 kritik açıkları | Görsel optimizasyonu, Server Actions DoS, SSRF | 16.4.3 |
| Hızlı yazımda karakter kaybı | Editörde yazı bozuluyordu (canlı sürümde 399 karakterlik yazımda ölçüldü) | Değer eşitlemesi commit anında (`useLayoutEffect`); regresyon testi |
| Aralıklı React #185 | Yeni yazı ekranında sonsuz güncelleme döngüsü | Tiptap seçenekleri sabit; değişiklikler birleştirilerek iletiliyor |
| Görsel planında yedek yetişmiyordu | Gemini yoğunken plan üretilemiyordu | Yedeğe süre ayrılıyor; kapalı servisler yedek sayılmıyor; OVH'de hızlı model önce |
| AI Servisleri saat dilimi | Vercel'de hydration hatası (#418) | Europe/Istanbul sabit |
| Genişletme turu taslağı siliyordu | Servis yoğunken hazır taslak kayboluyordu | Taslak notla korunuyor (canlıya bu belgeyle birlikte çıkıyor) |
| Özet ipucu kontrastı | 3,1:1 | 5,9:1 |

## Test sonuçları (güncel)

**Geçenler:**

| Test | Tür | Ortam | Sonuç |
|---|---|---|---|
| Birim testleri | Sahte sağlayıcı ve depo | Yerel | 223/223 |
| Lint, production build | Statik / derleme | Yerel ve Vercel | Temiz, başarılı |
| `npm audit` | Statik | Yerel | 0 açık |
| Gizli anahtar taraması | Depo, git geçmişi, istemci paketi | Yerel | Temiz |
| Supabase entegrasyonu | **Gerçek** | Test projesi | 7/7 (2026-10-26) |
| Canlı yönetici akışı (`live-admin`) | **Gerçek**, izole | **Canlı**, 390 px | 22/22: tek dokunuşla logo, giriş, taslak, yenileme, düzenleme, önizleme, gerçek görsel planı, canlı AI sayacı, onaylı yayın, arayüzden yayından kaldırma, 404, çıkış, temizlik |
| Blog akışı (`blog-flow`) | **Gerçek** veritabanı + gerçek AI | Preview ve yerel, 390 px | 46/46 (Preview'da iki tam geçiş; bir çalıştırma yalnızca Pollinations kesintisiyle düştü) |
| Görsel stüdyosu | Gerçek editör, **sahte** AI ve medya | Yerel, 5 genişlik | 115/115 |
| Erişilebilirlik (axe, WCAG 2.2 AA) | 9 ekran × 1440/390 px + klavye odağı | Preview (production derlemesi) | 22/22 |
| Herkese açık sayfalar ve SEO | Salt okunur | **Canlı** | 38/38 (güvenlik başlıkları dahil) |
| Footer / giriş ekranı | Salt okunur | **Canlı** | 150/150 · 175/175 |
| Yedek → şifrele → çöz → geri yükle | **Gerçek** | Test projesi | 2/2 yazı içeriği, 5/5 dosya SHA-256 |
| AI sağlayıcı yoklaması | **Gerçek**, her birine 1 istek | Yerel | Gemini, OVH, LLM7, Pollinations metin ve görsel ✓ |

**Başarısız ya da tamamlanamayanlar:**

| Test | Durum | Neden |
|---|---|---|
| Telefonda "AI ile Yaz" uçtan uca (`ai-write-mobile`) | ✗ (3 deneme) | 1. deneme: taslak üretildi ama genişletme turu hatası akışı durdurdu; düzeltildi. 2. ve 3. deneme: Google Gemini o saatlerde aşırı yükteydi (tüm modeller meşgul ya da zaman aşımında). Uygulama doğru hata verdi, ücretli modele geçmedi. Gemini normale dönünce tekrarlanmalı. |

**Çalıştırılamayanlar:**

- Groq, OpenRouter, Cloudflare ve Design Arena gerçek testleri: anahtar yok. Design Arena yalnızca sahte yanıtla test edildi.
- ComfyUI: yapılandırılmamış.
- Telefon klavyesi açıkken alt çubuğun gizlenmesi: Playwright sanal klavyeyi taklit edemiyor; kod `visualViewport` ile çalışıyor, otomatik testi yok.
- Canlıdan tam geri yükleme provası: bilerek yapılmadı; prova test projesine.
- TypeScript tür kontrolü: proje JavaScript, TypeScript kurulu değil.

## Mobil blog akışı nasıl test edilir

```bash
node scripts/supabase/dev-test.mjs                       # test projesine bağlı yerel sunucu
node tests/e2e/blog-flow.e2e.mjs                         # 390 px: logo, giriş, editör, yazım, alt çubuk, önizleme, onaylı yayın
node tests/e2e/ai-write-mobile.e2e.mjs                   # 390 px: AI ile Yaz → taslak → kaydet (gerçek AI)
node tests/e2e/visual-studio.e2e.mjs                     # görsel stüdyosu, 5 genişlik
node tests/e2e/a11y.e2e.mjs                              # erişilebilirlik
E2E_ALLOW_PRODUCTION=1 node tests/e2e/live-admin.e2e.mjs # canlıda izole kısa akış
```

`E2E_LATENCY_MS=700` yavaş mobil bağlantıyı taklit eder.

## Açık konular

| # | Konu | Durum |
|---|---|---|
| 1 | **Otomatik yedeği canlıya bağlamak** | Tek adım kaldı; `BACKUP_AND_RESTORE.md` → "Son adım". Otomatik izin denetimi durdurduğu için site sahibinin onayını bekliyor. |
| 2 | Vercel Pro (ticari kullanım) | Ücretli karar; site sahibine ait |
| 3 | Gemini yoğunluğu | "AI ile Yaz" bu dönemlerde çalışmıyor. Seçenekler: Groq, OpenRouter ya da Cloudflare anahtarı eklemek (ek ücretsiz yedek) ve Gemini model sırasını ölçümle güncellemek. |
| 4 | Groq, OpenRouter, Cloudflare | Anahtar eklenince gerçek yoklama yapılıp panelde onay verilmeli |
| 5 | Bölge (`icn1`), iş kuyruğu, tam CSP | Öneri |
| 6 | Giriş güvenliği | Site sahibinin kararıyla değiştirilmedi; ayrıntı yerel notta |

## Bilinen sınırlar

- **Tek kiracılı yapı.**
- **Bellekteki sayaçlar:** sağlayıcı bekleme süreleri ve giriş yavaşlatma sunucu örneğinin belleğinde tutulur.
- **Yerel geliştirme canlı veritabanını kullanır.** Deneme için `dev-test.mjs` kullanılmalı.
- **Ücretsiz kotalar ya da servis yoğunluğu:** AI üretimi durur ve uyarı verir; ücretli servise geçilmez.
