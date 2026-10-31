# Yedekleme ve geri yükleme

Durum tarihi: **2026-10-31**.

## Özet

| | Durum |
|---|---|
| Supabase'in kendi yedeği | **Yok.** Free plan otomatik yedek almaz, PITR yok ([kaynak](https://supabase.com/docs/guides/platform/backups)). |
| Otomatik günlük yedek | **Hazır, son adım onay bekliyor.** Gizli `CihanHayta/persona-yedek` deposundaki iş akışı yazıldı ve test projesiyle uçtan uca sınandı. Canlıya bağlanması için bir migration ve bir gizli değişken gerekiyor (aşağıda). O zamana kadar iş akışı **devre dışı**. |
| Elle yedekler | `/Volumes/Hayta-SSD/persona-yedekler/` altında: `2026-10-29-parti-a-oncesi`, `2026-10-31-prova-canli` (7 yazı, 24 dosya) ve daha eskiler; ayrıca `/Volumes/Hayta-SSD/portfolio-yedek-2026-10-2x`. Depo dışında. |
| Geri yükleme provası | **2026-10-31, geçici veritabanı (PGlite):** canlı yedek → 6 migration + geri yükleme → 7/7 yazı içeriği, başlık sırası, kapak ve etiket ilişkileri birebir; **24/24 dosya SHA-256 canlıyla aynı**. Kaynakçalı/koyu temalı yazı ve stüdyo oturumu içeren yedek de birebir geldi. 2026-10-26: test projesinde uçtan uca (şifrele → çöz → geri yükle) 2/2 yazı, 5/5 dosya. |

## Otomatik günlük yedek

**Nerede:** `CihanHayta/persona-yedek`. Gizli ve ücretsiz bir GitHub deposu. İş akışı: `.github/workflows/yedek.yml`.

| | |
|---|---|
| Zamanlama | Her gün 03:30 (İstanbul). Ayrıca Actions → *Günlük yedek* → *Run workflow* ile elle. |
| Veritabanı kapsamı | `public` şemasının **tüm** tabloları: blog yazıları ve taslaklar (kaynakça, tema ve blok sırası `content` içinde), kategori, etiket, medya kayıtları (köken bilgisiyle), stüdyo oturumları (`blog_studio_sessions`: kaynak, görsel seçimleri, bölüm eşlemesi), AI kullanım kayıtları ve limit ayarları. Ayrıca migration geçmişi ve **tüm kovaların Storage nesne listesi** (`storage_objects.json`). |
| Görsel kapsamı | `blog-media` kovasındaki **tüm dosyalar** (maskot referansları `maskot/` dahil); medya kaydı olmayanlar da dahil. Her dosyanın boyutu Storage kaydıyla karşılaştırılır, SHA-256 özeti yazılır. **`studio-sources` (özel kova, kaynak ekran görüntüleri) dosyaları yedeğe girmez:** yalnızca analiz girdisidir, yayımlanmaz ve salt okunur rol özel kovadan dosya indiremez; listesi `storage_objects.json`'da durur. |
| Bağlantı | Salt okunur `persona_backup` rolü: yalnızca SELECT, yazamaz, silemez. Supabase havuzu (session modu) üzerinden. |
| Şifreleme | RSA-4096 (OAEP-SHA256) ile sarılmış AES-256-GCM. Depoda yalnızca **açık** anahtar var; Actions yedeği açamaz. GCM, değiştirilmiş dosyayı reddeder. |
| Saklama | Actions artifact: günlük yedek 35 gün, her ayın 1'indeki yedek 90 gün. Kaynak veritabanından ayrı bir yerdedir. |
| Günlük | Yalnızca satır ve dosya sayıları, boyut. İçerik ve bağlantı adresi yazılmaz. Özet, çalışma sayfasında tablo olarak görünür. |
| Başarısızlık | İş başarısız olursa (bağlantı yok, bir dosya inmedi ya da `blog_posts` boş) depoda **"Yedek başarısız: <tarih>" issue'su** açılır. GitHub ayrıca e-posta gönderir. |
| Sınırlar | Gizli depoda ücretsiz Actions: aylık 2.000 dakika (bir yedek yaklaşık 1 dakika) ve 500 MB artifact alanı. Bugünkü bir yedek yaklaşık 0,2 MB; görseller arttıkça çalışma özetindeki boyut izlenmeli. |

**Betikler** (bu depoda; iş akışı salt okunur olarak alır):
- `scripts/backup/ci-backup.mjs`: tablo ve dosya dökümü.
- `scripts/backup/crypt.mjs`: şifreleme, şifre çözme ve anahtar üretimi.
- `scripts/backup/setup-backup-access.mjs`: rol erişimi ve gizli değişken kurulumu.

### Son adım: canlıyı bağlamak (bir kez)

Önce kod `main`'e alınmış olmalı (iş akışı betikleri `main`'den okur). Sonra:

```bash
node scripts/supabase/project.mjs migrate linked --dry-run --only 20261026000000   # 2026-10-31: başarılı
node scripts/supabase/project.mjs migrate linked --only 20261026000000             # yalnızca NOLOGIN rol + SELECT izinleri
node scripts/backup/setup-backup-access.mjs linked --github CihanHayta/persona-yedek
gh workflow enable "Günlük yedek" -R CihanHayta/persona-yedek
gh workflow run "Günlük yedek" -R CihanHayta/persona-yedek    # ilk yedeği hemen al
```

İkinci komut ne yapıyor:
- Role giriş yetkisi ve rastgele yeni bir şifre verir; veritabanına yalnızca SCRAM özeti gider.
- Bağlantıyı sınar: kayıt sayılarını okur, yazma denemesinin reddedildiğini doğrular.
- Bağlantı adresini GitHub gizli değişkenine yazar.

Şifre hiçbir yerde görünmez. Yeniden çalıştırmak şifreyi yeniler.

Bu adım otomatik izin denetimince durduruldu: canlıda giriş yapabilen yeni bir rol ve dışarıya kimlik bilgisi aktarımı içeriyor. Site sahibinin onayıyla çalıştırılmalı.

## Şifre çözme anahtarı

- `~/.config/persona-yedek/yedek-ozel-anahtar.pem` ve SSD'de `persona-yedek-anahtari/` (her ikisi 0600).
- **Kaybolursa otomatik yedekler açılamaz.** Bir kopyası parola yöneticisinde ya da çevrimdışı bir yerde saklanmalı.
- Anahtar yenilemek için:
  1. `node scripts/backup/crypt.mjs keygen <özel.pem> <açık.pem>` ile yeni çift üretin.
  2. Açık anahtarı `persona-yedek` deposundaki `yedek-acik-anahtar.pem` ile değiştirin.
  3. Eski yedekler eski anahtarla açılır.

## Geri yükleme

```bash
gh run list -R CihanHayta/persona-yedek --workflow "Günlük yedek"
gh run download <run-id> -R CihanHayta/persona-yedek -D indirilen
node scripts/backup/crypt.mjs decrypt indirilen/*/persona-yedek-*.enc yedek.tar.gz ~/.config/persona-yedek/yedek-ozel-anahtar.pem
tar -xzf yedek.tar.gz                       # → yedek/ (tables/, storage/, manifest.json)
node scripts/supabase/restore.mjs yedek     # yalnızca TEST projesine
```

`restore.mjs` şunları yapar:
- Boş olmayan hedefe yazmaz.
- Görselleri hedef kovaya yükler ve yazı içindeki adresleri hedefe çevirir.
- Sonunda şunları doğrular:
  - satır sayıları;
  - sahipsiz bağ ve kırık kapak olmaması;
  - başka projeye işaret eden adres kalmaması;
  - her yazının slug, başlık ve içeriğinin yedekle birebir aynı olması;
  - **her görsel dosyasının hedeften indirilip SHA-256'sının yedekle aynı olması**.

Herhangi biri tutmazsa çıkış kodu 1'dir. Elle (yerel) yedek için: `node scripts/supabase/backup.mjs <klasör>`. Bu betik Supabase CLI oturumunu kullanır ve salt okunurdur.

**Prova (2026-10-31, geçici veritabanı — hiçbir projeye yazmaz):**

```bash
# PGlite projeye eklenmez; depo dışına bir kez kurulur:
mkdir -p ../portfolio-tools/pgcheck && npm --prefix ../portfolio-tools/pgcheck i @electric-sql/pglite@0.3.7
PGLITE_PATH=../portfolio-tools/pgcheck/node_modules/@electric-sql/pglite/dist/index.js \
  node scripts/supabase/restore-rehearsal.mjs <yedek-klasörü> --verify-live-files
```

Bütün migration'lar sırayla uygulanır, yedek yüklenir ve şunlar doğrulanır: satır sayıları, her yazının slug/başlık/durum/içeriği (blok sırası, kaynakça, tema), başlık sırası, kapak ve etiket ilişkileri, içerikteki görsel adreslerinin medya kaydı, her dosyanın yedekte olması ve SHA-256'sının kaynaktakiyle aynı olması. Sonuç (canlı yedek, 2026-10-31): **tümü geçti, 24/24 dosya**. Test projesini boşaltıp gerçek Supabase'e geri yükleme adımı bu kez otomatik izin denetimince durduruldu; onun yerine bu izole prova yapıldı.

**Önceki prova (2026-10-26, test projesi):** `ci-backup.mjs` ile 12 tablo ve 5 dosya (190.884 bayt) alındı. Yedek şifrelendi, çözüldü, test projesi boşaltılıp geri yüklendi:
- 2/2 yazı slug, başlık ve içerik olarak birebir aynı.
- 5/5 dosya SHA-256 ile doğrulandı.
- Herkese açık sayfalar hatasız açıldı (`public-seo.e2e.mjs`).

Canlı veritabanına prova yapılmadı.

## Felaket durumunda canlıyı kurtarmak (elle, test edilmedi)

1. Mevcut durumun da yedeğini alın.
2. Yeni, boş bir Supabase projesi açın.
3. Şemayı ve verileri yükleyin. `supabase/.env.test.local` içindeki `TEST_PROJECT_REF` değerini geçici olarak yeni projeye çevirin, sonra:

   ```bash
   node scripts/supabase/project.mjs migrate test
   node scripts/supabase/restore.mjs <yedek>
   ```

4. Yeni projede:
   - Yöneticiyi Auth'ta oluşturun ve `blog_admins` satırını ekleyin.
   - Auth ayarlarını uygulayın: `npx supabase config push`.
5. Vercel'de canlı `NEXT_PUBLIC_SUPABASE_URL` ve `NEXT_PUBLIC_SUPABASE_ANON_KEY` değerlerini yeni projeye çevirip yeniden dağıtın.
6. `TEST_PROJECT_REF` değerini eski haline alın. `live-admin` ve `public-seo` testleriyle doğrulayın.

Auth kullanıcıları ve şifreleri yedekte yoktur; yönetici yeniden oluşturulur.

## Öneri

Kalıcı ticari kullanımda Supabase **Pro** (günlük yedek, PITR eklentisi) en güvenli seçenektir. Ücretsiz planda kalınırsa otomatik yedeğin son adımı tamamlanmalıdır. Günlük yedek sorgusu, projenin etkinsizlik nedeniyle duraklatılmasını da önler ([kaynak](https://supabase.com/docs/guides/platform/free-project-pausing)).
