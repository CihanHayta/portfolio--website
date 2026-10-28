import assert from "node:assert/strict";
import { test } from "node:test";
import { describeFailure } from "./userErrors.js";

test("kaynak okunamaması AI hatası olarak gösterilmez; okuyucu/metin/ekran görüntüsü önerilir", () => {
  const out = describeFailure({ stage: "read", kind: "thin" });
  assert.equal(out.code, "A");
  assert.match(out.message, /yapay zekâ hatası değil/);
  assert.deepEqual(out.actions, ["readerRetry", "pasteText", "screenshots"]);
});

test("AI hataları türüne göre: kota, yapılandırma, yoğunluk, geçersiz sonuç, bağlantı, oturum", () => {
  assert.equal(describeFailure({ stage: "draft", kind: "quota" }).code, "E");
  assert.equal(describeFailure({ stage: "draft", status: 429 }).code, "E");
  assert.equal(describeFailure({ stage: "draft", kind: "config" }).code, "D");
  assert.equal(describeFailure({ stage: "draft", kind: "busy" }).code, "B");
  assert.equal(describeFailure({ stage: "draft", kind: "busy", status: 503 }).code, "B", "yoğunluk 503 döner ama yapılandırma hatası değildir");
  assert.equal(describeFailure({ stage: "draft", status: 503 }).code, "B");
  assert.equal(describeFailure({ stage: "draft", kind: "timeout" }).code, "B");
  assert.equal(describeFailure({ stage: "draft", kind: "invalid" }).code, "C");
  assert.equal(describeFailure({ offline: true }).code, "N");
  assert.equal(describeFailure({ status: 401 }).code, "S");
});

test("mesajlarda sağlayıcı adı, anahtar ya da teknik ayrıntı yok", () => {
  for (const input of [{ stage: "read" }, { kind: "quota" }, { kind: "config" }, { kind: "busy" }, { kind: "invalid" }, { offline: true }]) {
    const { title, message } = describeFailure(input);
    assert.doesNotMatch(`${title} ${message}`, /gemini|ovh|llm7|pollinations|groq|api[_ ]?key|token|\d{3}/i);
  }
});
