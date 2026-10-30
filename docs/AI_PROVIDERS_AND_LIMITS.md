# AI sağlayıcıları, ücretsiz rotasyon ve limitler

Son doğrulama: **2026-10-30** (görev bazlı gerçek istek, `scripts/ai/probe-tasks.mjs`). Önceki: 2026-10-26 (canlı uçtan uca).

## 2026-10-30 değişiklikleri (kullanıcı kararı)

- **Otomatik görsel üretimi kapatıldı** (`IMAGE_ORDER = []`).
  - ComfyUI ve Cloudflare Workers AI (metin ve görsel) iptal edildi.
  - Pollinations görselinin ücretsiz ve ticari kullanım şartı doğrulanamadı; referanslı düzenleme 402 (ücret) istiyor.
  - Gemini görsel modelleri ücretsiz katmanda yok: [fiyat sayfası](https://ai.google.dev/gemini-api/docs/pricing), tüm görsel modelleri için "Free tier: Not available".
  - Hugging Face ücretsiz hesaplara aylık kredi vermiyor: [fiyat](https://huggingface.co/docs/inference-providers/pricing), "Free Users: None".
- **Yeni görseller elle üretilir.** Kapak ve bölüm görselleri editördeki hazır istemle kullanıcının kendi ChatGPT hesabında üretilip yüklenir. Arayüz bunu "elle üretim" olarak etiketler; otomatik üretim gibi gösterilmez.
- **Kod tarafı.**
  - Adaptör dosyaları duruyor ama hiçbir rota ve arayüz onları çağırmıyor. Açıkça istenen sağlayıcı da sırada değilse çalışmaz (`generateImage({ order })`, birim testli).
  - "Klasik sihirbaz" girişi ve DuckDuckGo arama bağlantısı kaldırıldı.
  - Ollama ve Vercel AI Gateway yok.

### Görev bazlı gerçek yoklama (2026-10-30)

Uygulamanın kendi yönlendiricisi (`generateJsonRouted`) kullanıldı. Her görev için bir kısa istek gönderildi; müşteri verisi yoktu. Sayaçlar bellekteki test deposuna yazıldı.

| Görev | Gemini (gemini-3.6-flash) | OVH (Llama-3.3-70B, anonim) |
|---|---|---|
| Kaynak analizi | ✓ 11,6 sn | ✓ 2,3 sn |
| Taslak (başlık, SEO, gövde; hedef 220 sözcük) | ✓ 156 sözcük, meta 143 kr | ✗ iki denemede de kısa: 117 ve 118 sözcük. Yalnızca **yedek**; genişletme turu tamamlar, açık taslak notunda görünür. |
| Genişletme | ✓ | ✓ (hedefin altında ama kabul aralığında) |
| Benzerlik | ✓ | ✓ yanıt verdi; ama **kullanılmıyor**. Preview gerçek testinde arşiv karşılaştırması (2 çağrı) dakikalık 2 isteği tüketti ve ardından gelen taslak hız sınırına takıldı. Gemini yoksa karşılaştırma yerel ölçümle yapılır. |
| Görsel planı | ✓ 6,2 sn | ✓ 5,3 sn. İlk denemede anonim hız sınırı (dakikada 2 istek), 75 sn sonra geçti. |

**Sıra:** Gemini birincil, OVH yedek. LLM7 ve Pollinations metin varsayılan olarak kapalı (şartlar doğrulanmadı). Groq ve OpenRouter'ın anahtarı yok, istek gönderilmez.

Kodda tek doğruluk kaynağı vardır:

- `lib/ai/freePolicy.js`: sağlayıcılar, modeller, koşullar ve Türkçe test sonucu.
- `lib/ai/limits.js`: uygulama limitleri, varsayılanlar, resmî üst sınırlar ve geçiş sırası.

Bu belge onların özetidir. Bir değer değişecekse önce kod güncellenir.

## Politika

- **Yalnızca ücretsiz (FREE_ONLY) kilitlidir.** Ücretli modele ya da plana otomatik geçiş hiçbir koşulda yoktur.
  - Ücret isteyen yanıt (HTTP 402) sağlayıcıyı 24 saat devre dışı bırakır.
  - OpenRouter'da `:free` olmayan bir modelden gelen yanıt da aynı şekilde işlenir.
- **Ücretsizliği doğrulanmayan model çağrılmaz.** Ortam değişkeniyle verilen ücretli model kimlikleri yok sayılır.
- **Hesaba bağlı ücret riski.** Hesap ayarına göre ücret çıkabilecek servislerde (Gemini, Groq, Cloudflare) yönetici "Hesabın ücretsiz planda olduğunu doğruladım" onayını vermeden servis rotasyona girmez.
  - Gemini için bu onay, kullanıcının 2026-10-24 tarihli beyanıyla varsayılan olarak açıktır. AI Studio'da Free tier, faturalandırma kapalı.
- **Limitler uygulamanındır.** Admin → *AI Servisleri* ekranından değiştirilir. Sunucu her değeri sağlayıcının resmî üst sınırıyla kırpar.
- **Günlük dönem Europe/Istanbul'dur.** Cloudflare Neuron tahmini ise sağlayıcının sıfırlamasına (00:00 UTC) uyar.
- **Bilinmeyen değer uydurulmaz.** Sağlayıcı kalan kotayı bildirmiyorsa ekranda "bilinmiyor" yazar.

## Ücret risk sınıfları

| Sınıf | Anlamı | Servisler |
|---|---|---|
| **Doğrulandı: ücret oluşamaz** | Hesap yok ya da yalnızca ücretsiz model istenir | OVHcloud anonim, Pollinations görsel, OpenRouter (yalnızca `:free`), ComfyUI (kendi sunucunuz) |
| **Doğrulandı: kullanıcı beyanı** | Hesap ücretsiz planda; kullanıcı doğruladı | Gemini (2026-10-24) |
| **Risk var** | Hesap ücretli plandaysa ücret çıkabilir, uygulama bunu göremez | Groq, Cloudflare. Panelde onay verilmeden kullanılmaz. |
| **Bilinmiyor** | Çalışıyor ama şartlar ve veri politikası doğrulanamadı | LLM7, Pollinations metin. Varsayılan **kapalı**. |
| **Deneme / ücretli** | Sürekli ücretsiz değil | Cohere Trial, Stability AI, Hugging Face kredisi, Gemini görsel modelleri. **Kullanılmaz.** |

## Metin sağlayıcıları ve gerçek test sonuçları

Testler `scripts/ai/probe-providers.mjs` ile yapıldı: her adaya tek bir kısa Türkçe JSON isteği, müşteri verisi kullanılmadı.

| Sıra | Sağlayıcı | Model | Ücretsiz koşul | Gerçek test (2026-10-26) | Varsayılan |
|---|---|---|---|---|---|
| 1 | Google Gemini | gemini-3.8/3.6-flash, 3-flash-preview, 3.5/3.1-flash-lite | Ücretsiz katman, kota hesap bazlı ([fiyat](https://ai.google.dev/gemini-api/docs/pricing)) | ✓ gemini-3.6-flash, doğru Türkçe (11,6 sn). 3.8-flash ilk bayt sınırında (10 sn) kesildi | Açık |
| 2 | Groq | gpt-oss-120b, qwen3.8-27b, gpt-oss-20b | Model başına 30 RPM, 1.000 RPD, 8K TPM ([limitler](https://console.groq.com/docs/rate-limits)) | Anahtar eksik, test edilemedi | Açık ama onay bekliyor |
| — | Cloudflare Workers AI | — | — | **İptal (2026-10-30, kullanıcı kararı)** | Sırada yok |
| 4 | OpenRouter | `openrouter/free` | `:free` modeller, model başına günde 50 istek | Anahtar eksik, test edilemedi | Açık (anahtar gerekir) |
| 5 | OVHcloud AI Endpoints (anonim) | **Llama-3.3-70B önce**, gpt-oss-120b | IP ve model başına dakikada 2 istek ([belge](https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-getting-started)) | ✓ kısa istem 8 sn. Görsel planı: Llama 29,8 sn ✓, gpt-oss-120b 45–55 sn (zaman aşımı riski) | **Açık (yedek)** |
| 6 | LLM7.io (anonim) | default (yanıt: mistral-Nemo) | Anonim sınır yayımlanmamış | ✓ çalıştı. Site kendini ücretli API olarak tanıtıyor; şart ve gizlilik metni yok | Kapalı |
| 7 | Pollinations metin (anonim) | openai (yanıt: gpt-oss-20b) | Topluluk servisi, sıkı hız sınırı | ✓ çalıştı; şartlar sayfası okunabilir metin vermiyor | Kapalı |

Dışlananlar:

- **Kilo Code ücretsiz havuzu.** Ücretsiz plan tek bir gerçek kişiye veriliyor ve gönderilen veri hizmeti geliştirmede kullanılabiliyor. Testte JSON yanıtı yarıda kesildi.
- `EXCLUDED` listesindeki diğer servisler (gerekçeleri `lib/ai/freePolicy.js` içinde).

Veri notları:

- **Gemini:** ücretsiz katmanda istemler Google ürünlerini geliştirmek için kullanılabilir.
- **OpenRouter:** ücretsiz model sağlayıcıları istemleri kaydedebilir.
- **OVHcloud:** "we do not store user data" diyor, sunucular AB'de. Anonim katmanın ticari kullanımı ayrıca belirtilmemiş, bu yüzden yalnızca yedek olarak kullanılır.

## Görsel sağlayıcıları

**Otomatik ücretsiz görsel üretimi yok** (2026-10-30, yukarıya bakın).

Eski kayıtlar (yalnızca tarihçe):
- Pollinations 2026-10-26'ya kadar filigranlı ve düşük çözünürlüklü üretiyordu; aralıklı `HTTP 503` veriyordu.
- ComfyUI ve Cloudflare hiç yapılandırılmadı.

## Rotasyon nasıl çalışır

1. **Sıra:** Etkin ve yapılandırılmış servisler, panelde ayarlanan *Geçiş sırası* değerine (1 = önce) göre sıralanır.
2. **Görev uygunluğu:** Her sağlayıcı yalnızca desteklediği görevlerde denenir.
   - Örneğin Groq 8K TPM sınırı yüzünden yalnızca kısa görevlerde kullanılır.
   - Türkçe içerik görevlerinde (`draft`, `draft-expand`, `article`) Türkçe testi zayıf çıkan modeller atlanır.
3. **Limit ve ücret kontrolü:** Her çağrıdan önce günlük istek ve token hakkı atomik olarak ayrılır.
   - Limit doluysa sıradaki servise geçilir.
   - Hesaba bağlı servislerde onay yoksa servis atlanır.
4. **Hata sonrası bekleme:** Hata türüne göre sağlayıcı bir süre çağrılmaz.

   | Hata | Bekleme |
   |---|---|
   | 429 | 15 dk ya da `Retry-After` |
   | Sunucu hatası, zaman aşımı | 2 dk |
   | Kota / kredi bitti | 6 sa |
   | Ücret istendi | 24 sa |
   | Anahtar geçersiz | 1 sa |

   Bu bekleme süreleri sunucu örneğinin belleğindedir. Günlük sayaçlar ise kalıcı depodadır.
5. **Ücretsiz aday kalmazsa:** İşlem durur ve kullanıcıya anlaşılır hata gösterilir. Ücretli servise geçilmez.
   - *AI Servisleri* ekranı ve görsel stüdyosu, etkin metin ya da görsel servisi kalmadığında uyarı gösterir.
6. **Süre bütçesi:**
   - "Yedek var" yalnızca o görevde gerçekten kullanılabilecek servisler (açık, onaylı, görevi destekleyen) için geçerlidir. Kapalı servisler yedek sayılmaz.
   - Görsel planında toplam bütçe 80 sn'dir ve yedeğe (OVH) en az 30 sn ayrılır (`backupReserveMs`).
   - Gerekçe: 2026-10-26'da canlıda Gemini yoğunken dört model ~30 sn harcamış, OVH'ye 9 sn kalmış ve plan üretilememişti.
7. **İsteğe bağlı adımlar akışı bozmaz:** AI Blog Stüdyosu'nda "kısa bölümleri genişletme" turu başarısız olursa hazır taslak atılmaz; notla incelemeye geçilir.

### Yeniden doğrulama (2026-10-28, gerçek kısa istek, anahtar değeri yazdırılmadı)

| Sağlayıcı | Sonuç |
|---|---|
| Gemini | `gemini-3.8-flash` yoğun ("high demand"); `gemini-3.6-flash` yanıt verdi (4,6 sn, Türkçe uygun). Görsel tarifi (`image-describe`) gerçek testte çalıştı. |
| OVHcloud AI Endpoints (anonim) | `gpt-oss-120b` yanıt verdi (6,8 sn, Türkçe uygun); 22 model listelendi. |
| LLM7 (anonim) | Yanıt verdi (1 sn) ama ticari kullanım şartları resmî olarak doğrulanamadı → **kapalı**. |
| Pollinations metin (anonim) | Yanıt verdi (0,4 sn) ama şartlar doğrulanamadı → **kapalı**. |
| Pollinations görsel | Tarif modunda gerçek üretim: 21 sn, 1344×768, filigranlı, düşük kalite. Görselden görsele ücretsiz değil (402). |
| Groq, Cloudflare, OpenRouter, ComfyUI, Design Arena | Anahtar tanımlı değil (yerel ve Vercel): istek gönderilmez; panelde yalnızca kapalı "Anahtarı tanımlı olmayan servisler" bölümünde. |

Vercel'de yalnızca `GEMINI_API_KEY` (Production) tanımlı; Preview'da Gemini yoktur, anahtarsız servisler kullanılır.

**Zaman sınırı:** Gemini akışı ilk veriden sonra durursa istek eskiden 15 dakika takılıyordu (gerçek testte görüldü). Artık fetch ve her okuma son tarihle yarışır; bütçe aşılmaz ve sıradaki model/servis denenir.

### Canlı gözlemler (2026-10-26)

- **Gemini:**
  - `gemini-3.8-flash` gözlenen tüm çağrılarda ilk bayt sınırında (10 sn) kesildi; plan bir sonraki modelle (3.6-flash, 3–8 sn) üretildi. Bu her çağrıya yaklaşık 10 sn ekliyor. Öneri: model sırası canlı ölçümle yeniden değerlendirilmeli.
  - Gün içinde Google tarafında "high demand" dönemleri yaşandı: tüm modeller meşgul ya da zaman aşımında. Bu dönemlerde AI Blog Stüdyosu taslak üretemedi. Uygulama anlaşılır hata verdi ve ücretli modele geçmedi.
- **OVH:** Yedek olarak görsel planında çalışıyor (Llama). Uzun makale üretiminde Gemini'nin yerini tutması beklenmemeli.
- **Kalıcı sayaç:** Canlıda her AI çağrısı `ai_usage_counters` tablosuna yazılıyor (`AI_USAGE_STORE=supabase`, doğrulandı).

## Varsayılan uygulama limitleri

Paneldeki değerler bu varsayılanların üzerine yazar ve resmî üst sınırla kırpılır.

| Servis | Günlük istek | Günlük token / görsel | Aynı anda | Deneme | Resmî üst sınır |
|---|---|---|---|---|---|
| text:gemini | 300 | 3.000.000 token | 3 | 5 | yayımlanmamış |
| text:groq | 900 | 180.000 token | 2 | 2 | 1.000 istek, 200K token |
| text:cloudflare | 150 | 150.000 token | 2 | 2 | 10.000 Neuron (ortak) |
| text:openrouter | 45 | 300.000 token | 2 | 1 | 50 istek |
| text:ovh | 200 | 400.000 token | 1 | 1 | 2.880 istek (2/dk) |
| text:llm7 (kapalı) | 100 | 200.000 token | 1 | 1 | yayımlanmamış |
| text:pollinations (kapalı) | 50 | 100.000 token | 1 | 1 | yayımlanmamış |
| image:comfyui | 200 | 200 görsel | 1 | 1 | – |
| image:cloudflare | 100 | 100 görsel | 2 | 1 | 10.000 Neuron (ortak) |
| image:pollinations | 40 | 40 görsel | 1 | 1 | yayımlanmamış |

Cloudflare Neuron bütçesi varsayılan olarak 9.000'dir, en fazla 10.000 olabilir. `CLOUDFLARE_NEURON_BUDGET` ile ya da panelden değiştirilir. Neuron API'de bildirilmez; resmî fiyatla hesaplanmış **tahmindir**.

## Kalıcı limit deposu

| Ortam | Depo | Kalıcı | Örnekler arası atomik |
|---|---|---|---|
| Birim testleri | memory | – | – |
| Yerel geliştirme | file (`.data/ai-usage.json`, git dışında) | ✓ | tek süreç |
| Test sunucusu (`scripts/supabase/dev-test.mjs`) | supabase (test projesi) | ✓ | ✓ |
| Canlı, `AI_USAGE_STORE=supabase` ile | supabase | ✓ | ✓ (`ai_reserve`, `FOR UPDATE`) |
| Canlı, değişken yoksa | memory | – | – |

Migration (`20261023000000_ai_usage_jobs.sql` ve `20261024000000_ai_least_privilege.sql`) canlıya **2026-10-24'te uygulandı**.

`AI_USAGE_STORE=supabase`, Vercel'de Production ve Preview için **2026-10-26'da tanımlandı**. Canlıda çalıştığı doğrulandı: yönetim paneli "Depo: supabase" gösteriyor ve gerçek bir görsel planı sonrasında canlı sayaç arttı. Değişken bir gün kaldırılırsa:

- Hesaba bağlı servisler (Gemini, Groq, Cloudflare) canlıda güvenlik için **çağrılmaz**.
- Metin yalnızca OVH yedeğiyle (dakikada 2 istek) üretilir.
- Sayaçlar kalıcı olmaz ve panelden limit düzenlenemez.

## Sağlayıcı eklemek için

| Servis | Gerekenler |
|---|---|
| Groq | `GROQ_API_KEY`. Ardından panelde "Hesabın ücretsiz planda olduğunu doğruladım". |
| OpenRouter | `OPENROUTER_API_KEY`. Kredi alınmamış hesapta yalnızca `:free`. |
| Cloudflare | **İptal edildi (2026-10-30).** Anahtar eklense bile sıraya girmez. |
| ComfyUI | `COMFYUI_URL`, `COMFYUI_CHECKPOINT`, canlıda `COMFYUI_TOKEN` |
| Design Arena | `DESIGN_ARENA_API_KEY` (başvuruyla). Resmî belgeye göre ([API](https://docs.designarena.ai/api-reference/overview.md), [başvuru](https://designarena.ai/developers/apply)) yalnızca sıralama verisi sunar (`/api/v1/models`, Bearer anahtar, atıf zorunlu, anahtar yalnızca sunucuda). Uygulama da yalnızca panelde atıflı bilgi gösterir; görsel üretmez. Anahtar olmadığı için gerçek istek yapılmadı; yalnızca sahte yanıtla test edildi. |

Anahtarlar yerelde `.env.local`'a, canlıda Vercel → Environment Variables'a (Sensitive) yazılır. Ekledikten sonra:

```bash
node --import ./tests/register.mjs scripts/ai/probe-providers.mjs --only groq,openrouter,cloudflare
```

Bu komut her sağlayıcıya tek gerçek istek atar ve Türkçe sonucu raporlar. Sonucu `freePolicy.js` içindeki `turkish` alanına işleyin.

Gerçek görev süresini ölçmek için (görsel planı istemi, tek sağlayıcı, bellek içi sayaç):

```bash
node --import ./tests/register.mjs scripts/ai/probe-visual-plan.mjs ovh Meta-Llama-3_3-70B-Instruct
```

## Yeniden doğrulama (3 ayda bir ya da sağlayıcı değişikliğinde)

1. Resmî fiyat, limit, ticari kullanım ve veri koşulu sayfalarını açın.
2. `lib/ai/freePolicy.js` içindeki modelleri, notları ve `VERIFIED_AT` tarihini güncelleyin.
   - Doğrulanamayan sağlayıcıyı `EXCLUDED` listesine taşıyın.
3. Resmî sınırlar değiştiyse `lib/ai/limits.js` içindeki `CEILINGS` ve `DEFAULT_LIMITS` değerlerini güncelleyin.
4. `probe-providers.mjs` ile gerçek yoklama yapın, sonra `npm test` çalıştırın.
5. *AI Servisleri* ekranında "Erişimi kontrol et" düğmesini kullanın. Bu kontrol üretim yapmaz, kota harcamaz.

[awesome-free-llm-apis](https://github.com/mnfst/awesome-free-llm-apis) yalnızca keşif için okundu; betikleri çalıştırılmadı. Depoya 2026-10-10'da kimlik bilgisi çalan bir iş akışı eklenmiş, ertesi gün kaldırılmıştı.
