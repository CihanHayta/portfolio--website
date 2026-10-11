# Proje tanıtım videoları

Portföydeki proje kartlarında oynayan ürün videoları burada, [Remotion](https://www.remotion.dev) ile üretilir.
Site bağımlılıklarından ayrı tutmak için kendi `package.json` dosyası vardır.

```bash
cd video
npm install
npm run render                       # üç video + kapak görselleri
npm run render -- kpi-control-center # tek proje
npm run render -- --stills           # her sahnenin bitiş karesi (kadraj kontrolü, out/)
npm run render -- --full             # 1440×900 kopya (out/)
npm run studio                       # Remotion Studio'da önizleme
```

- **Girdi:** `../public/projects/<slug>/*.webp` — canlı uygulamalardan alınmış gerçek ekran görüntüleri
  (1440 px genişlik, 2x). Standart ekranlar 1440×900 çekilir; daha uzun çekilen ekranlarda
  `src/projects.js` içindeki `ratio` alanına dosyanın gerçek yükseklik/genişlik oranı yazılır.
- **Veri:** ekranlar yalnızca sentetik demo veri içerir (projelerin kendi demo seed'leri).
  Canlı veritabanlarına demo veri yazılmaz; boş hesaplar için uygulama yerelde, geçici bir
  veritabanıyla çalıştırılıp oradan çekilir.
- **Çıktı:** `../public/videos/projects/<slug>.mp4` (960×600, sessiz H.264) ve `<slug>-poster.jpg`.
- **Kurgu:** `src/projects.js` — proje başına tema, metinler ve sahneler (görsel, başlık, süre, kamera).
  Süreler ve easing `src/theme.js` içinde tek yerden yönetilir.

Bir ekranı güncellemek için aynı adla yeni görüntüyü `public/projects/<slug>/` altına koyup
`npm run render -- <slug>` çalıştırmak yeterlidir.

Remotion'ın indirdiği Chromium çalışmazsa (harici diskte "Target closed" hatası verebiliyor) başka bir
headless Chromium gösterin: `REMOTION_BROWSER=/yol/chrome-headless-shell npm run render`.
