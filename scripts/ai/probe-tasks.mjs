// Görev bazlı GERÇEK yoklama: her ücretsiz metin sağlayıcısı, uygulamanın kullandığı
// her göreve (kaynak analizi, taslak, genişletme, benzerlik, görsel planı) uygulamanın
// kendi yönlendiricisiyle (generateJsonRouted) tek kısa istekle denenir.
//   node --import ./tests/register.mjs scripts/ai/probe-tasks.mjs [--only gemini,ovh]
// - Anahtarlar .env.local'dan yalnızca süreç belleğine yüklenir; hiçbir değer yazdırılmaz.
// - Sayaçlar bellekteki test deposuna yazılır (canlı/yerel kota sayacı değişmez).
// - Müşteri verisi gönderilmez; örnek kaynak metni bu betikte yazılıdır.
// - Ölçüt: JSON şemaya uygun mu, metin Türkçe mi, uzunluk hedefe yakın mı.

import { createRequire } from "node:module";
const nextEnv = createRequire(new URL("../../package.json", import.meta.url))("@next/env");
nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });
const { generateJsonRouted } = await import("../../lib/ai/textRouter.js");
const { createTestStore } = await import("../../lib/ai/usageStore.js");
const { supportsTask } = await import("../../lib/ai/freePolicy.js");

const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : ["gemini", "ovh"];
const onlyTasks = process.argv.includes("--tasks") ? process.argv[process.argv.indexOf("--tasks") + 1].split(",") : null;
const TURKISH = /[çğıöşüÇĞİÖŞÜ]/;
const words = (text) => String(text ?? "").trim().split(/\s+/).filter(Boolean).length;
const SOURCE = [
  "# Küçük işletmeler için reklam bütçesi planlama",
  "Reklam bütçesi belirlenirken önce hedef netleştirilir: satış, potansiyel müşteri ya da bilinirlik.",
  "## Test bütçesi",
  "İlk iki hafta küçük bir test bütçesiyle farklı kitle ve mesajlar denenir; sonuç veren kombinasyona bütçe kaydırılır.",
  "## Ölçüm",
  "Dönüşüm takibi kurulmadan bütçe artırılmaz. Haftalık raporda maliyet, dönüşüm ve dönüşüm başı maliyet izlenir.",
].join("\n");

const S = (properties, required = Object.keys(properties)) => ({ type: "OBJECT", properties, required });
const STR = { type: "STRING" };
const TASKS = {
  "source-analysis": {
    system: "Türkçe içerik editörüsün. Yanıtı yalnızca JSON olarak ver.",
    prompt: `Aşağıdaki kaynağın konusunu, hedef kitlesini ve ana başlıklarını çıkar.\n<kaynak>\n${SOURCE}\n</kaynak>`,
    schema: S({ konu: STR, hedefKitle: STR, basliklar: { type: "ARRAY", items: STR } }),
    check: (data) => Array.isArray(data.basliklar) && data.basliklar.length >= 2 && TURKISH.test(`${data.konu} ${data.hedefKitle}`),
    sample: (data) => data.konu,
  },
  draft: {
    system: "Deneyimli bir Türkçe içerik editörüsün. Kaynağı kopyalamadan özgün yaz. Yanıtı yalnızca JSON olarak ver.",
    prompt: `Kaynağa dayanarak yaklaşık 220 sözcüklük bir blog bölümü yaz: başlık (en fazla 70 karakter), seoTitle (en fazla 60), metaDescription (130-155 karakter) ve govde (2-3 paragraf).\n<kaynak>\n${SOURCE}\n</kaynak>`,
    schema: S({ title: STR, seoTitle: STR, metaDescription: STR, govde: STR }),
    target: 220,
    check: (data, task) => TURKISH.test(data.govde) && data.title.length <= 80 && data.seoTitle.length <= 70 && Math.abs(words(data.govde) - task.target) <= task.target * 0.45,
    sample: (data) => `${data.title} · ${words(data.govde)} sözcük · meta ${data.metaDescription.length} kr`,
  },
  "draft-expand": {
    system: "Türkçe içerik editörüsün. Var olan metni dolguya kaçmadan, açıklama ve örnekle genişlet. Yanıtı yalnızca JSON olarak ver.",
    prompt: 'Şu paragrafı yaklaşık 160 sözcüğe genişlet; yeni bilgi uydurma:\n"Dönüşüm takibi kurulmadan reklam bütçesi artırılmamalıdır. Haftalık raporda maliyet ve dönüşüm başı maliyet izlenir."',
    schema: S({ metin: STR }),
    target: 160,
    check: (data, task) => TURKISH.test(data.metin) && Math.abs(words(data.metin) - task.target) <= task.target * 0.5,
    sample: (data) => `${words(data.metin)} sözcük`,
  },
  similarity: {
    system: "Yanıtı yalnızca JSON olarak ver.",
    prompt: 'Şu iki başlık aynı konuyu mu işliyor? 0-1 arası benzerlik ve Türkçe kısa gerekçe ver.\nA: "Küçük işletmeler için reklam bütçesi nasıl planlanır?"\nB: "Meta reklamlarında bütçe dağılımı rehberi"',
    schema: S({ benzerlik: { type: "NUMBER" }, gerekce: STR }),
    check: (data) => typeof data.benzerlik === "number" && data.benzerlik >= 0 && data.benzerlik <= 1 && TURKISH.test(data.gerekce),
    sample: (data) => `${data.benzerlik} · ${data.gerekce}`,
  },
  "visual-plan": {
    system: "Görsel yönetmenisin. Yanıtı yalnızca JSON olarak ver.",
    prompt: 'Şu bölümler için birer görsel öner (Türkçe amaç + İngilizce kısa istem, metin/logo içermesin): "Test bütçesi", "Ölçüm".',
    schema: S({ gorseller: { type: "ARRAY", items: S({ bolum: STR, amac: STR, istem: STR }) } }),
    check: (data) => Array.isArray(data.gorseller) && data.gorseller.length === 2 && data.gorseller.every((item) => TURKISH.test(item.amac) || item.amac.length > 8),
    sample: (data) => data.gorseller?.map((item) => item.bolum).join(", "),
  },
};

const rows = [];
for (const provider of only) {
  for (const [task, spec] of Object.entries(TASKS)) {
    if (onlyTasks && !onlyTasks.includes(task)) continue;
    if (!supportsTask(provider, task)) {
      rows.push({ provider, task, ok: false, skipped: "kayıtta bu görev için izinli değil" });
      continue;
    }
    const started = Date.now();
    try {
      const result = await generateJsonRouted({
        task,
        system: spec.system,
        prompt: spec.prompt,
        schema: spec.schema,
        maxOutputTokens: 2000,
        budgetMs: 70_000,
        order: [provider],
        store: createTestStore({ overrides: { [`text:${provider}`]: { enabled: true } } }),
        log: () => {},
      });
      const data = result.data ?? {};
      let passed = false;
      try {
        passed = Boolean(spec.check(data, spec));
      } catch {
        passed = false;
      }
      rows.push({ provider, task, model: result.model, ok: passed, ms: Date.now() - started, sample: String(spec.sample(data) ?? "").slice(0, 110) });
    } catch (error) {
      rows.push({ provider, task, ok: false, ms: Date.now() - started, error: `${error.kind ?? "error"}: ${String(error.message).slice(0, 140)}` });
    }
    console.log(JSON.stringify(rows.at(-1)));
    // Anonim uç noktaların hız sınırına saygı: istekler arasında kısa bekleme.
    await new Promise((resolve) => setTimeout(resolve, provider === "ovh" ? 4000 : 1500));
  }
}
console.log(`ÖZET ${new Date().toISOString().slice(0, 10)}: ${rows.filter((row) => row.ok).length}/${rows.length} geçti`);
