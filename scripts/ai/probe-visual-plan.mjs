// Görsel planı görevini GERÇEK sağlayıcıyla, gerçek router ve gerçek istemle ölçer.
//   node --import ./tests/register.mjs scripts/ai/probe-visual-plan.mjs ovh [model]
// - Sayaçlar bellekte tutulur (veritabanına yazılmaz); tek sağlayıcı, tek istek.
// - Anahtarlar .env.local'dan yalnızca süreç belleğine yüklenir; değer yazdırılmaz.
// - Ücretli model çağrılmaz: router yalnızca kayıttaki ücretsiz modelleri kullanır.
import { createRequire } from "node:module";

const nextEnv = createRequire(new URL("../../package.json", import.meta.url))("@next/env");
nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });
const { generateJsonRouted } = await import("../../lib/ai/textRouter.js");
const { createTestStore } = await import("../../lib/ai/usageStore.js");
const { VISUAL_PLAN_SCHEMA, VISUAL_PLAN_SYSTEM, buildVisualPlanPrompt, normalizeVisualPlan } = await import("../../lib/ai/visualPlan.js");

const [provider = "ovh", model] = process.argv.slice(2);
const env = { ...process.env, ...(model ? { [`${provider.toUpperCase()}_TEXT_MODELS`]: model } : {}) };
const sections = [
  { id: "h1", level: 2, heading: "Reklam bütçesi neden planlanmalı?", words: 180, text: "Küçük işletmeler bütçeyi hedef kitle büyüklüğüne ve dönüşüm maliyetine göre planlamalıdır." },
  { id: "h2", level: 2, heading: "Kanal seçimi", words: 220, text: "Meta, Google ve TikTok reklamlarının maliyet ve hedefleme farkları karşılaştırılır." },
  { id: "h3", level: 2, heading: "Ölçüm ve optimizasyon", words: 200, text: "Dönüşüm takibi, A/B testi ve haftalık bütçe dağılımı ayarı anlatılır." },
];
const store = createTestStore({ overrides: { [`text:${provider}`]: { enabled: true, billingVerified: true } } });
const started = Date.now();
try {
  const result = await generateJsonRouted({
    task: "visual-plan",
    order: [provider],
    env,
    store,
    system: VISUAL_PLAN_SYSTEM,
    prompt: buildVisualPlanPrompt({ title: "Küçük işletmeler için reklam bütçesi planlama", sections, source: null, budget: 4 }),
    schema: VISUAL_PLAN_SCHEMA,
    temperature: 0.5,
    maxOutputTokens: 8_192,
    budgetMs: 55_000,
    log: () => {},
  });
  const plan = normalizeVisualPlan(result.data, { sections, budget: 4 });
  console.log(JSON.stringify({ provider, model: result.model, ok: true, ms: Date.now() - started, items: plan.items?.length ?? plan.length ?? null, turkishAlt: /[çğıöşü]/i.test(JSON.stringify(plan)) }));
} catch (error) {
  console.log(JSON.stringify({ provider, model: model ?? "(varsayılan)", ok: false, ms: Date.now() - started, kind: error.kind, error: String(error.message).slice(0, 200) }));
}
