import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyLocal,
  fold,
  headingOverlap,
  rankMatches,
  scorePost,
  shortlist,
  sourceIsSufficient,
  titleSimilarity,
} from "@/lib/ai/similarity";

import { POSTS, SOURCE } from "./fixtures/similarity.mjs";

const score = (id) => scorePost(SOURCE, POSTS.find((item) => item.id === id));

test("başlık normalleştirme: büyük/küçük harf, Türkçe karakter ve noktalama", () => {
  assert.equal(fold("Meta REKLAM Bütçesi: Nasıl Belirlenir?"), "meta reklam butcesi nasil belirlenir");
  assert.equal(titleSimilarity("Meta reklam bütçesi nasıl belirlenir?", "META Reklam Bütçesi Nasıl Belirlenir"), 1);
  assert.ok(titleSimilarity("Meta reklam bütçesi nasıl belirlenir?", "Meta reklamları için bütçe nasıl belirlenmeli?") >= 0.5, "yakın ifade");
  assert.ok(titleSimilarity("Meta reklam bütçesi nasıl belirlenir?", "Kahve dükkanı için logo tasarımı") < 0.15);
});

test("1. aynı başlık → çok yüksek benzerlik", () => {
  assert.equal(classifyLocal(score("ayni")), "very_high");
});

test("2. farklı başlık, aynı konu ve iskelet → yüksek benzerlik", () => {
  const result = score("farkli-baslik");
  const visible = POSTS.find((item) => item.id === "farkli-baslik").title;
  assert.ok(titleSimilarity(SOURCE.title, visible) < 0.4, "görünen başlıklar farklı");
  assert.ok(["high", "very_high"].includes(classifyLocal(result)), JSON.stringify(result));
});

test("3. ortak kelimeler ama farklı amaç → yüksek sayılmaz", () => {
  assert.ok(["low", "medium", "none"].includes(classifyLocal(score("ortak-kelime"))));
  assert.ok(!["high", "very_high"].includes(classifyLocal(score("ortak-kelime"))));
});

test("4. ilişkili ama ayrı konu → düşük ya da yok", () => {
  assert.ok(["low", "none"].includes(classifyLocal(score("iliskili"))));
});

test("5. benzerliği olmayan konu → yok", () => {
  assert.equal(classifyLocal(score("alakasiz")), "none");
});

test("başlık iskeleti: örtüşen ve kaynakta olup yazıda eksik başlıklar ayrılır", () => {
  const overlap = headingOverlap(["Test bütçesi ne kadar olmalı?", "Lookalike kitleler"], ["Test bütçesi belirleme", "Hedef kitle seçimi"], 0.4);
  assert.equal(overlap.pairs.length, 1);
  assert.deepEqual(overlap.missing, ["Lookalike kitleler"]);
});

test("8. ön eleme ve sıralama: en alakalı adaylar önce, alakasız elenir, en fazla 5 sonuç", () => {
  const candidates = shortlist(SOURCE, POSTS);
  assert.deepEqual(candidates.slice(0, 2).map((item) => item.post.id).sort(), ["ayni", "farkli-baslik"]);
  assert.ok(!candidates.some((item) => item.post.id === "alakasiz"), "alakasız yazı yapay zekâya gönderilmez");
  const many = Array.from({ length: 8 }, (_, index) => ({ category: index % 2 ? "medium" : "high", score: { rank: index / 10 } }));
  const ranked = rankMatches([...many, { category: "none", score: { rank: 1 } }]);
  assert.equal(ranked.length, 5);
  assert.ok(ranked.every((item) => item.category !== "none"));
  assert.equal(ranked[0].category, "high");
  assert.ok(ranked[0].score.rank >= ranked[1].score.rank);
});

test("6-7. yayımlanmış ve taslak eşleşmeleri durumlarıyla birlikte döner", () => {
  const ids = shortlist(SOURCE, POSTS).map((item) => `${item.post.id}:${item.post.status}`);
  assert.ok(ids.includes("ayni:published"));
  assert.ok(ids.includes("farkli-baslik:draft"));
});

test("14. yeterince okunamamış kaynakla kesin sonuç üretilmez", () => {
  assert.equal(sourceIsSufficient({ wordCount: 40, headings: [] }), false);
  assert.equal(sourceIsSufficient({ wordCount: 90, headings: ["a", "b", "c"] }), true);
  assert.equal(sourceIsSufficient({ wordCount: 800, headings: [] }), true);
});
