import assert from "node:assert/strict";
import { test } from "node:test";
import { autoTarget, normalizeUrl } from "../components/admin/studio/studioInput.js";
import { targetWordsFor } from "@/lib/ai/templateFill";

test("telefondan yapıştırılan link normalleştirilir; geçersiz adres reddedilir", () => {
  assert.equal(normalizeUrl("  ornek.com/yazi "), "https://ornek.com/yazi");
  assert.equal(normalizeUrl("https://ornek.com/a?b=1"), "https://ornek.com/a?b=1");
  assert.equal(normalizeUrl(""), "");
  assert.equal(normalizeUrl("bu bir link değil"), null);
  assert.equal(normalizeUrl("javascript:alert(1)"), null);
  assert.equal(normalizeUrl("ftp://ornek.com/x"), null);
  assert.equal(normalizeUrl("localhost"), null, "noktasız ana makine adı");
});

test("istemcideki otomatik hedef sunucudaki kuralla aynıdır", () => {
  for (const words of [0, 300, 1234, 2412, 9000]) {
    const sources = words ? [{ kind: "url", wordCount: words }] : [];
    assert.equal(autoTarget(sources), targetWordsFor("auto", sources), String(words));
  }
});
