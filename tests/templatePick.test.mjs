import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_TEMPLATE, FORMAT_TEMPLATES, guessFormat, pickTemplate } from "@/lib/ai/templatePick";
import { TEMPLATES } from "@/lib/blog/blocks/templates";

test("her biçim gerçekte var olan bir şablona eşlenir", () => {
  for (const key of Object.values(FORMAT_TEMPLATES)) assert.ok(TEMPLATES.some((item) => item.key === key), key);
});

test("yapay zekânın verdiği biçim önceliklidir", () => {
  const pick = pickTemplate({ format: "comparison", title: "10 Instagram fikri" }, TEMPLATES);
  assert.equal(pick.key, "comparison");
  assert.equal(pick.by, "ai");
});

test("biçim yoksa kurallar: liste, karşılaştırma, adım adım, SSS, sorun-çözüm", () => {
  const cases = [
    [{ title: "Why You Should Use Instagram Carousels + 10 Ideas" }, "listicle"],
    [{ title: "10 Ideas for Instagram Carousels" }, "listicle"],
    [{ title: "Meta Ads vs Google Ads: hangisi?" }, "comparison"],
    [{ title: "Google İşletme Profili nasıl yapılır?" }, "steps"],
    [{ title: "Kurulum", headings: ["1. Hesap aç", "2. Pikseli kur", "3. Kampanya oluştur"] }, "steps"],
    [{ title: "Reklam bütçesi", headings: ["Ne kadar harcamalıyım?", "Günlük mü toplam mı?", "Ne zaman artırmalı?", "Test ne kadar sürmeli?"] }, "faq"],
    [{ title: "Reklam hesabı kısıtlandı: sorun ve çözüm" }, "problemSolution"],
  ];
  for (const [input, expected] of cases) assert.equal(pickTemplate(input, TEMPLATES).key, expected, input.title);
});

test("belirgin işaret yoksa güvenli varsayılan; tanınmayan biçim yok sayılır", () => {
  assert.equal(guessFormat({ title: "Improve your SEO with these best practices" }), null);
  const pick = pickTemplate({ format: "bilinmeyen", title: "Improve your SEO with these best practices" }, TEMPLATES);
  assert.equal(pick.key, DEFAULT_TEMPLATE);
  assert.equal(pick.by, "default");
});

test("yapay zekâ genel 'rehber' dediğinde başlıktaki liste/karşılaştırma vaadi öne geçer; özgül biçim aynen kalır", () => {
  const list = pickTemplate({ format: "guide", title: "Why You Should Use Instagram Carousels + 10 Ideas to Get You Started" }, TEMPLATES);
  assert.equal(list.key, "listicle");
  assert.equal(list.by, "ai+rules");
  assert.equal(pickTemplate({ format: "guide", title: "Improve your SEO with these best practices" }, TEMPLATES).key, "seoGuide");
  assert.equal(pickTemplate({ format: "faq", title: "10 Ideas for carousels" }, TEMPLATES).key, "faq", "özgül biçim korunur");
});
