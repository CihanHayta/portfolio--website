import assert from "node:assert/strict";
import { test } from "node:test";
import { APPROACHES, approachLines, approachTemplate, readApproaches } from "./approaches.js";

test("en fazla 3 geçerli ve tekil yaklaşım; bilinmeyenler atılır", () => {
  assert.deepEqual(readApproaches(["faq", "faq", "uydurma", "guide", "comparison", "tips"]), ["faq", "guide", "comparison"]);
  assert.deepEqual(readApproaches("faq"), []);
});

test("brief'teki 10 yaklaşımın hepsi var", () => {
  assert.deepEqual(APPROACHES.map((item) => item.label), [
    "Problem ve çözüm", "Uygulama rehberi", "Yaygın hatalar", "Adım adım kontrol listesi", "Karşılaştırma",
    "Örneklerle anlatım", "Sık Sorulan Sorular (SSS)", "Stratejik bakış", "Pratik öneriler", "Karar verme rehberi",
  ]);
});

test("ana şablon: ilk şablonu olan yaklaşım; istem tek yazıda birlikte uygulamayı söyler", () => {
  assert.equal(approachTemplate(["examples", "faq"]), "faq");
  assert.equal(approachTemplate(["strategy"]), null);
  const lines = approachLines(["problemSolution", "faq"]);
  assert.match(lines, /TEK yazıda birlikte/);
  assert.match(lines, /Problem ve çözüm/);
  assert.match(lines, /SSS/);
  assert.equal(approachLines([]), "");
});
