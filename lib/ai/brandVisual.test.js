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

test("kapak istemi: yazıya özgü sahne, yazı yasağı, maskot yalnızca referansla", async () => {
  const { buildCoverPrompt, coverScene, FOX_ORANGE } = await import("./brandVisual.js");
  const budget = buildCoverPrompt({ title: "2027 Dijital Pazarlama Bütçesi Nasıl Planlanır?", idea: "Bütçeyi hedefe göre dağıtmak", highlight: "Test bütçesi", audience: "KOBİ'ler", mascotCount: 2 });
  assert.match(budget, /2027 Dijital Pazarlama Bütçesi Nasıl Planlanır\?/);
  assert.match(budget, /bütçe dağılımını gösteren grafikler/);
  assert.match(budget, /KENDİ maskotudur/);
  assert.match(budget, new RegExp(FOX_ORANGE));
  assert.match(budget, /HİÇBİR yazı, harf, rakam, logo/);
  assert.match(budget, /1536×1024/);
  const seo = buildCoverPrompt({ title: "SEO için anahtar kelime araştırması" });
  assert.notEqual(coverScene("SEO için anahtar kelime araştırması"), coverScene("Reklam bütçesi"));
  assert.match(seo, /Maskot referansı verilmedi: tilki ya da başka bir maskot çizme/);
  assert.doesNotMatch(seo, /KENDİ maskotudur/);
});
