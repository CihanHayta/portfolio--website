# Ticari kullanım hazırlığı

Durum tarihi: **2026-10-26**.

Bu belge, sitenin ve blog/AI stüdyosunun ticari olarak kullanılması ya da devredilmesi öncesindeki lisans, platform şartı, veri ve maliyet durumunu özetler. Hukuki görüş değildir. Satış modeli ve çok müşterili yapı bu aşamanın kapsamı dışındadır.

## 1. Platform şartları: satıştan önce çözülmesi gerekenler

| Konu | Durum | Gereken |
|---|---|---|
| **Vercel Hobby planı** | Site Hobby planda. Vercel: *"Hobby teams are restricted to non-commercial personal use only. All commercial usage of the platform requires either a Pro or Enterprise plan."* Ürün ya da hizmet satışının reklamı da ticari kullanım sayılır. ([Fair Use](https://vercel.com/docs/limits/fair-use-guidelines)) | Ajans sitesi için **Vercel Pro** gerekir. Plan 2026-10-26'da Vercel API'siyle **Hobby** olarak doğrulandı; ücretli plana geçiş kararı site sahibinindir, bu çalışmada yapılmadı. |
| **Supabase Free planı** | Otomatik yedek yok. Bir hafta yeterli etkinlik olmazsa proje duraklatılır. ([Backups](https://supabase.com/docs/guides/platform/backups), [Pausing](https://supabase.com/docs/guides/platform/free-project-pausing)) | Kalıcı ticari kullanım için **Supabase Pro** önerilir. Ücretsiz alternatif: gizli GitHub deposunda şifreli günlük yedek (hazır, son adım onay bekliyor; `BACKUP_AND_RESTORE.md`). |
| **Gemini API ücretsiz katmanı** | Google içerikleri ürün geliştirmede kullanır; *"human reviewers may read, annotate, and process your API input and output"*. *"Do not submit sensitive, confidential, or personal information to the Unpaid Services."* AB/AEA, İsviçre ve Birleşik Krallık'taki kullanıcılara sunulan uygulamalarda yalnızca ücretli hizmet kullanılabilir. 18 yaş sınırı var. ([Gemini API şartları](https://ai.google.dev/gemini-api/terms)) | Müşterinin gizli ya da kişisel verisi AI'a **gönderilmemeli**. Panel yalnızca yöneticiye açık (Türkiye). AB'deki bir müşteriye devredilirse ücretli katman gerekir. |

Fiyatlar değişebilir; güncel tutarlar resmî fiyat sayfalarından teyit edilmeli.

## 2. Yazılım lisansları

Doğrudan bağımlılıklar `node_modules` içindeki paket bilgilerinden okundu.

| Paket | Lisans | Not |
|---|---|---|
| next 16.4.3, react 19.2.4, react-dom, @supabase/*, @tiptap/*, framer-motion, eslint | MIT | Ticari kullanım serbest; telif bildirimi korunur |
| lucide-react | ISC | Serbest |
| sharp 0.35.5 | Apache-2.0 | Serbest |
| libvips (sharp'ın yerel kitaplığı, `@img/sharp-libvips-*`) | LGPL-3.0-or-later | Değiştirilmeden, ayrı ve dinamik kitaplık olarak kullanılıyor. Ticari kullanım serbest; kitaplığın lisans metni korunur. |
| playwright-core | Apache-2.0 | Yalnızca yerel okuyucu ve testlerde kullanılıyor |
| Montserrat, Playfair Display (`next/font/google`) | SIL Open Font License 1.1 | Ticari kullanım serbest |
| **Remotion 4** (`video/` klasörü, proje videolarını üretir; siteye dahil değil) | Remotion License | Ücretsiz lisans: birey, **en fazla 3 çalışanlı** kâr amaçlı şirket ya da kâr amacı gütmeyen kuruluş. Daha büyük bir şirkete devredilirse **şirket lisansı** gerekir. Remotion kodunu satmak veya alt lisanslamak yasak. |

Instagram, LinkedIn ve WhatsApp simgeleri (`components/icons.jsx`) ilgili şirketlerin marka kurallarına tabidir. Yalnızca bağlantı simgesi olarak kullanılmalı.

## 3. AI çıktıları ve içerik hakları

**Metin:**

- Gemini şartlarına göre Google üretilen içerik üzerinde hak iddia etmez. Kullanımın sorumluluğu kullanıcıdadır.
- OVHcloud anonim katmanının ticari kullanım şartı ayrıca belirtilmemiş; yalnızca yedek olarak kullanılıyor.
- LLM7 ve Pollinations metin varsayılan kapalı.

**Görseller:**

| Kaynak | Ticari kullanım |
|---|---|
| Cloudflare FLUX.1 [schnell] ve FLUX.2 [klein] 4B | Apache-2.0: uygun (anahtar eklenince) |
| Pollinations | **Filigranlı, ticari şartı doğrulanmadı.** Stüdyo eklemeden önce açık onay istiyor. Müşteri teslimatında kullanılmamalı. |
| "Kaynak görsel" (alıntılanan sayfadan) | Üçüncü tarafın telif hakkı. Stüdyo "lisans doğrulanmadı" diye uyarıyor. İzin alınmadan kullanılmamalı. |
| Kendi yüklenen görseller | Hak sahibi yükleyendir |

**Kaynaktan makale:** AI Blog Stüdyosu bir URL'deki yazıyı analiz edip özgün Türkçe metin üretir. Türev eser riski için:

- yayından önce editör incelemesi yapılmalı;
- gerekirse kaynağa atıf verilmeli;
- birebir alıntı yapılmamalı.

Kalite denetimi (`lib/ai/quality.js`) yardımcıdır, hukuki güvence değildir.

## 4. Kişisel veri (KVKK)

- **Ziyaretçi verisi:** Site ziyaretçiden form verisi saklamıyor. İletişim penceresi e-posta (`mailto:`) ya da WhatsApp bağlantısı açar. Analitik ya da izleme kodu yok. Gömülü videolar çerezsiz modda yüklenir (`/gizlilik`).
  - Barındırma sağlayıcısının (Vercel) erişim günlükleri ayrıca geçerlidir.
- **Yönetici verisi:** E-posta, görünen ad ve oturum bilgileri Supabase'de, **Güney Kore (Seul)** bölgesinde durur. Vercel fonksiyonları ABD'de çalışır.
  - Bu, KVKK kapsamında yurt dışına aktarımdır. Gizlilik metninde belirtilmesi ve gerekli hukuki dayanağın değerlendirilmesi önerilir.
- **AI'a gönderilen içerik:** Blog taslakları ve kaynak sayfalar ücretsiz katmanda Google'a gider. Müşteri ya da hasta verisi gibi kişisel ve gizli içerik gönderilmemeli.
- **Portföy görselleri** (`public/projects/`: diyetisyen ve fizyoterapist CRM, KPI paneli): ekran görüntülerinde yalnızca kurgusal demo verisi olduğu teslimden önce elle doğrulanmalı. Bu çalışmada doğrulanmadı.

## 5. Maliyet

| Kalem | Şu an | Ticari kullanımda |
|---|---|---|
| Vercel | Hobby, 0 $ | Pro gerekir (üye başına aylık ücret) |
| Supabase | Free, 0 $ | Pro önerilir (aylık ücret; günlük yedek dahil) |
| AI | 0 $: yalnızca ücretsiz katmanlar, ücretli servise otomatik geçiş yok | Değişmez. Hacim artarsa ücretsiz kotalar yetmeyebilir; uygulama ücretli servise geçmez, durur ve uyarır. |
| Alan adı | Mevcut | Yenileme ücreti |

## 6. Yapı ve devir

- **Tek kiracılı:** Tek site, tek yönetici grubu, tek veritabanı. Başka bir müşteri için ayrı kurulum gerekir: ayrı Vercel projesi, ayrı Supabase projesi ve kendi anahtarları. Çok müşterili SaaS dönüşümü kapsam dışı ve başlatılmadı.
- **Devirde sahiplik aktarılmalı:** GitHub deposu, Vercel projesi, Supabase organizasyonu, alan adı ve AI anahtarları.
  - Anahtarlar yeni sahibe **yeniden oluşturularak** verilmeli; mevcut anahtarlar paylaşılmamalı.
- **Yedek deposu:** `CihanHayta/persona-yedek` (gizli, ücretsiz). Devirde sahipliği aktarılmalı. Şifre çözme anahtarı ayrıca ve güvenli biçimde teslim edilmeli.
- **Belgeler:** `PRODUCT_READINESS.md`, `DEPLOYMENT.md`, `SUPABASE_SETUP.md`, `AI_PROVIDERS_AND_LIMITS.md`, `BACKUP_AND_RESTORE.md`, `SECURITY_CHECKLIST.md`. Ayrıca yerel ve git dışındaki `docs/private/SECURITY_NOTES.md`.
