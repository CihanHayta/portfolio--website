import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_PAGE, isPageInRange, pageCount, parsePage, readPageParam } from "./pagination.js";

test("sayfa parametresi güvenli sayıya çevrilir", () => {
  assert.equal(parsePage(undefined), 1);
  assert.equal(parsePage(""), 1);
  assert.equal(parsePage("abc"), 1);
  assert.equal(parsePage("0"), 1);
  assert.equal(parsePage("-3"), 1);
  assert.equal(parsePage("2"), 2);
  assert.equal(parsePage("2abc"), 2);
  assert.equal(parsePage("999999"), MAX_PAGE);
});

test("sayfa sayısı en az birdir", () => {
  assert.equal(pageCount(0), 1);
  assert.equal(pageCount(9), 1);
  assert.equal(pageCount(10), 2);
  assert.equal(pageCount(27), 3);
});

test("yalnızca var olan sayfalar geçerlidir", () => {
  assert.equal(isPageInRange(1, 0), true, "boş blogda 1. sayfa boş durum gösterir");
  assert.equal(isPageInRange(2, 0), false);
  assert.equal(isPageInRange(2, 9), false);
  assert.equal(isPageInRange(2, 10), true);
  assert.equal(isPageInRange(3, 27), true);
  assert.equal(isPageInRange(4, 27), false);
  assert.equal(isPageInRange(99, 27), false);
});

test("sayfa parametresi: tek kanonik adres, geçersiz değer 404", () => {
  const cases = [
    [undefined, 1, "ok"],
    ["", 1, "ok"],
    ["2", 2, "ok"],
    [String(MAX_PAGE), MAX_PAGE, "ok"],
    ["1", 1, "redirect"],
    ["02", 2, "redirect"],
    ["001", 1, "redirect"],
    ["abc", null, "invalid"],
    ["0", null, "invalid"],
    ["00", null, "invalid"],
    ["-3", null, "invalid"],
    ["2abc", null, "invalid"],
    ["1.5", null, "invalid"],
    [" 2", null, "invalid"],
    [String(MAX_PAGE + 1), null, "invalid"],
    ["99999999999999999999", null, "invalid"],
  ];
  for (const [value, page, status] of cases) {
    assert.deepEqual(readPageParam(value), { page, status }, String(value));
  }
});
