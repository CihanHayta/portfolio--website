// Arşiv karşılaştırma akışı. Gemini yerine sahte `generate` kullanılır; bu
// testler gerçek yapay zekâ ya da gerçek arşiv testi DEĞİLDİR.
import assert from "node:assert/strict";
import { test } from "node:test";
import { compareWithArchive, normalizeSuggestions, PROFILE_SCHEMA, JUDGE_SCHEMA } from "@/lib/ai/archiveCompare";
import { POSTS, SOURCE } from "./fixtures/similarity.mjs";

const source = {
  kind: "url",
  title: SOURCE.title,
  wordCount: 900,
  text: [`# ${SOURCE.title}`, ...SOURCE.headings.map((heading) => `## ${heading}`), SOURCE.text].join("\n\n"),
};
const posts = POSTS.map((post) => ({ ...post, state: post.status === "draft" ? "draft" : "published", slug: post.id }));

function fakeGenerate({ judge = {}, failProfile = false, failJudge = false } = {}) {
  const calls = [];
  const generate = async (options) => {
    calls.push(options);
    if (options.schema === PROFILE_SCHEMA) {
      if (failProfile) throw new Error("kota");
      return { data: { titleTr: SOURCE.title, topic: "Meta reklam bütçesi belirleme", question: "Meta reklamlarına ne kadar bütçe ayırmalıyım?", intent: "howto", keyTerms: SOURCE.keyTerms, headingsTr: SOURCE.headings } };
    }
    if (options.schema === JUDGE_SCHEMA) {
      if (failJudge) throw new Error("zaman aşımı");
      return { data: { matches: Object.entries(judge).map(([id, category]) => ({ id, category, sameQuestion: category === "very_high", sameIntent: true, reasons: [`${id} gerekçesi`], overlapping: ["Test bütçesi"], missingInExisting: ["Lookalike kitleler"] })) } };
    }
    throw new Error("beklenmeyen çağrı");
  };
  return { calls, generate };
}

test("17. karşılaştırma yalnızca okur; iki yapay zekâ çağrısı yapar, adayları sıralar", async () => {
  const { calls, generate } = fakeGenerate({ judge: { ayni: "very_high", "farkli-baslik": "high", "ortak-kelime": "low", olmayan: "high" } });
  const result = await compareWithArchive({ source, posts, generate, archive: { total: 5, drafts: 1 } });
  assert.equal(result.status, "ok");
  assert.equal(result.method, "ai");
  assert.equal(calls.length, 2, "her yazı için ayrı çağrı yok");
  assert.ok(!calls[1].prompt.includes("Kahve dükkanı"), "alakasız yazı yapay zekâya gönderilmez");
  assert.deepEqual(result.matches.map((match) => match.id), ["ayni", "farkli-baslik", "ortak-kelime"]);
  assert.equal(result.top, "very_high");
  assert.ok(!result.matches.some((match) => match.id === "olmayan"), "listede olmayan kimlik yok sayılır");
  const draft = result.matches.find((match) => match.id === "farkli-baslik");
  assert.equal(draft.state, "draft");
  assert.deepEqual(draft.missing, ["Lookalike kitleler"]);
  assert.equal(result.archive.compared, posts.length);
  assert.ok(result.matches.length <= 5);
});

test("yapay zekâ değerlendiremezse yerel sınıflandırmaya düşülür ve bu belirtilir", async () => {
  const { generate } = fakeGenerate({ failJudge: true });
  const result = await compareWithArchive({ source, posts, generate });
  assert.equal(result.method, "local");
  assert.match(result.notes[0], /yerel ölçümlerle/);
  assert.equal(result.matches[0].id, "ayni");
  assert.equal(result.matches[0].category, "very_high");
  assert.ok(result.matches[0].reasons.length > 0, "somut gerekçe üretilir");
});

test("profil çıkarılamazsa da yerel karşılaştırma çalışır", async () => {
  const { calls, generate } = fakeGenerate({ failProfile: true });
  const result = await compareWithArchive({ source, posts, generate });
  assert.equal(result.method, "local");
  assert.equal(calls.length, 1, "profil başarısızsa değerlendirme çağrısı da yapılmaz");
  assert.equal(result.matches[0].id, "ayni");
});

test("5. benzer yazı yoksa sonuç boş ve 'none' döner", async () => {
  const { generate } = fakeGenerate();
  const result = await compareWithArchive({ source, posts: posts.filter((post) => post.id === "alakasiz"), generate });
  assert.equal(result.matches.length, 0);
  assert.equal(result.top, "none");
});

test("14. kaynak yeterince okunmamışsa karşılaştırma yapılmaz ve yapay zekâ çağrılmaz", async () => {
  const { calls, generate } = fakeGenerate();
  const result = await compareWithArchive({ source: { ...source, wordCount: 30, text: "Kısa metin." }, posts, generate });
  assert.equal(result.status, "insufficient");
  assert.match(result.message, /ekran görüntülerini/);
  assert.equal(calls.length, 0);
});

test("12. güncelleme önerileri yalnızca mevcut başlıklara bağlanır ve boş öneri atılır", () => {
  const suggestions = normalizeSuggestions(
    {
      suggestions: [
        { afterHeading: "Test bütçesi belirleme", heading: "Lookalike kitlelerde bütçe", level: "3", paragraphs: ["Yeni paragraf."], reason: "Kaynakta var, yazıda yok." },
        { afterHeading: "Uydurma başlık", heading: "", level: "2", paragraphs: ["Sona eklenir."], reason: "" },
        { afterHeading: "", heading: "Boş", level: "2", paragraphs: [], reason: "" },
      ],
    },
    ["Günlük ve toplam bütçe farkı", "Test bütçesi belirleme"]
  );
  assert.equal(suggestions.length, 2);
  assert.equal(suggestions[0].afterHeading, "Test bütçesi belirleme");
  assert.equal(suggestions[0].level, "3");
  assert.equal(suggestions[1].afterHeading, "", "bilinmeyen başlık → yazının sonu");
});
