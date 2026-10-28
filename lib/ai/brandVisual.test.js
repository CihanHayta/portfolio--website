import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { BRAND_PALETTE, buildBrandImagePrompt } from "./brandVisual.js";

test("marka paleti globals.css tokenlarıyla aynı (eski/uydurma renk yok)", () => {
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  for (const [token, hex] of [["--p-night", BRAND_PALETTE.night], ["--p-cream", BRAND_PALETTE.cream], ["--p-gold", BRAND_PALETTE.gold], ["--p-walnut", BRAND_PALETTE.walnut], ["--p-stone", BRAND_PALETTE.stone]]) {
    assert.match(css, new RegExp(`${token}:\\s*${hex}`, "i"), `${token} ${hex} olmalı`);
  }
});

test("istem özgünlük, metinsiz ve marka kurallarını açıkça içerir", () => {
  const prompt = buildBrandImagePrompt({ description: { subject: "a marketer reviewing ad budget charts", elements: ["laptop", "charts"], mood: "focused" }, topic: "Reklam bütçesi", section: "Kanal seçimi", purpose: "cover" });
  assert.match(prompt, /original composition/i);
  assert.match(prompt, /NOT a copy/);
  assert.match(prompt, /#c9a24b/);
  assert.match(prompt, /do not reproduce its exact arrangement, people, brands or any text/i);
  assert.match(prompt, /cover/i);
});

test("ChatGPT istemi: biçim, marka rengi, metinsiz kuralı; referans varsa kopyalama yasağı", async () => {
  const { buildHandoffPrompt } = await import("./brandVisual.js");
  const cover = buildHandoffPrompt({ topic: "Reklam bütçesi", section: "Kanal seçimi", purpose: "cover", hasReference: true });
  assert.match(cover, /16:9/);
  assert.match(cover, /#c9a24b/);
  assert.match(cover, /hiçbir yazı/);
  assert.match(cover, /birebir kopyalama/);
  assert.doesNotMatch(buildHandoffPrompt({ topic: "x" }), /referans/i);
});

test("referanssız istem referanstan söz etmez ama özgünlük ve metinsiz kuralını korur", () => {
  const prompt = buildBrandImagePrompt({ description: { subject: "budget planning" }, topic: "Bütçe", reference: false });
  assert.doesNotMatch(prompt, /reference/i);
  assert.match(prompt, /original composition with no text/i);
  assert.match(prompt, /#c9a24b/);
});
