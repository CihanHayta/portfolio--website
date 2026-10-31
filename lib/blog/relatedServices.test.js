import assert from "node:assert/strict";
import { test } from "node:test";
import { relatedServices } from "./relatedServices.js";

// data/content.js → home.services.items ile aynı yapı (anahtar kelimeler birebir).
const home = {
  services: {
    items: [
      { title: "Meta reklam yönetimi", text: "…", keywords: ["meta", "facebook", "instagram", "reklam", "kampanya", "bütçe", "teklif"] },
      { title: "Reklam kreatifi ve mesaj stratejisi", text: "…", keywords: ["kreatif", "görsel", "video", "reels", "mesaj", "içerik", "tasarım"] },
      { title: "Hedef kitle ve dönüşüm optimizasyonu", text: "…", keywords: ["hedef kitle", "kitle", "dönüşüm", "müşteri adayı", "optimizasyon", "segment", "test"] },
      { title: "Performans analizi ve raporlama", text: "…", keywords: ["analiz", "rapor", "ölçüm", "roas", "kpi", "veri", "performans"] },
    ],
  },
};

test("bütçe yazısı Meta reklam hizmetiyle eşleşir; bağlantı gerçek hizmetler bölümü", () => {
  const out = relatedServices(home.services.items, { title: "Meta reklam bütçesi nasıl planlanır?", category: "Reklam", tags: ["bütçe"], text: "Kampanya bütçesi ve ROAS raporu." });
  assert.equal(out[0].title, "Meta reklam yönetimi");
  assert.ok(out.length <= 2);
  assert.ok(out.every((item) => item.href === "/#hizmetler"));
});

test("ilgisiz konu hizmet uydurmaz", () => {
  assert.deepEqual(relatedServices(home.services.items, { title: "Ofis bitkileri bakımı", text: "Sulama ve ışık." }), []);
});
