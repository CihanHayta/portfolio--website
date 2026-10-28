// GERÇEK AI testi (sahte yanıt YOK): "AI ile benzer yeni görsel oluştur" tarif modu.
//   node scripts/supabase/dev-test.mjs   (ayrı terminalde)
//   node tests/e2e/ai-image-real.e2e.mjs
// Referans: sitenin canlı, herkese açık kapak görseli. Gemini (ücretsiz katman)
// görseli tarif eder; hazır ücretsiz görsel servisi (Pollinations) tariften yeni
// görsel üretir; sonuç test projesinin medya kütüphanesine taslağa bağlı yazılır.
// Ücretli servise geçilmez. Oluşan kayıtlar test sonunda silinir.

import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { projectKeys } from "../../scripts/supabase/_api.mjs";
import { resolveRef } from "../../scripts/supabase/project.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const RUN = `e2e-ai-${Date.now().toString(36)}`;
let failures = 0;
const check = (ok, label) => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`);
};

const keys = await projectKeys(resolveRef("test"));
const service = createClient(keys.url, keys.serviceRole, { auth: { persistSession: false } });
const email = `${RUN}@example.com`;
const password = randomBytes(18).toString("base64url");
const { data: user, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw error;
await service.from("blog_admins").insert({ user_id: user.user.id, display_name: "E2E AI" }).throwOnError();
const { data: post } = await service.from("blog_posts").insert({ title: "E2E AI görsel", slug: RUN, author_id: user.user.id }).select("id").single().throwOnError();

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`${base}/admin/login?next=/admin/blog`, { waitUntil: "networkidle" });
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await page.waitForURL((url) => url.pathname === "/admin/blog", { timeout: 30_000 });

  const services = await page.evaluate(async () => (await fetch("/api/admin/ai/services")).json());
  const ready = services.services.filter((item) => item.category === "image" && item.configured && item.state === "active").map((item) => item.provider);
  console.log(`  bilgi: hazır ücretsiz görsel servisleri: ${ready.join(", ") || "yok"}`);

  const started = Date.now();
  const result = await page.evaluate(
    async ({ opId, postId }) => {
      const response = await fetch("/api/admin/ai/visual-image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          opId,
          postId,
          persist: true,
          mode: "describe",
          reference: { kind: "source", src: "https://personadijitalpazarlama.com/og/persona-og.png" },
          item: { alt: "Reklam bütçesi planlaması", topic: "Meta reklam bütçesi nasıl planlanır", section: "Bütçe dağılımı", purpose: "cover" },
        }),
      });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    },
    { opId: randomUUID(), postId: post.id }
  );
  const seconds = Math.round((Date.now() - started) / 1000);
  if (result.status !== 200) {
    console.log(`  bilgi: yanıt ${result.status} · ${result.body.error ?? ""}`);
    check(false, `gerçek tarif + üretim başarısız (${seconds} sn) — hata kullanıcıya açık metinle döndü: ${Boolean(result.body.error)}`);
  } else {
    const candidate = result.body.candidate;
    console.log(`  bilgi: ${seconds} sn · ${candidate.providerLabel} · ${candidate.modelLabel} · ${candidate.width}×${candidate.height}`);
    console.log(`  bilgi: tarif: ${JSON.stringify(candidate.description).slice(0, 220)}`);
    check(candidate.mode === "described", "yöntem dürüstçe 'described' (tarif edilip metinden üretildi)");
    check(Boolean(candidate.description?.subject), "Gemini referansı tarif etti (gerçek görsel girdisi)");
    check(Boolean(candidate.media?.id) && candidate.image === null, "sonuç doğrudan kalıcı medya kaydı; tarayıcıya base64 gönderilmedi");
    const row = (await service.from("blog_media").select("origin, provider, model, draft_post_id, source_url, caption").eq("id", candidate.media.id).single()).data;
    check(row?.origin === "ai" && row.draft_post_id === post.id && /persona-og\.png/.test(row.source_url ?? "") && /tarif/.test(row.caption ?? ""), `köken kaydı doğru (${row?.provider} · ${row?.model})`);
    check(!["gemini-image", "openai", "dall-e"].includes(candidate.provider), "ücretli görsel servisine geçilmedi");
  }
} catch (failure) {
  failures++;
  console.log(`  FAIL beklenmeyen hata: ${failure.message.split("\n")[0]}`);
} finally {
  await browser.close();
  const rows = (await service.from("blog_media").select("id, storage_path").eq("draft_post_id", post.id)).data ?? [];
  if (rows.length) {
    await service.storage.from("blog-media").remove(rows.map((row) => row.storage_path));
    await service.from("blog_media").delete().in("id", rows.map((row) => row.id));
  }
  await service.from("blog_posts").delete().eq("id", post.id);
  await service.auth.admin.deleteUser(user.user.id);
  console.log(`\ntemizlik: ${rows.length} medya kaydı ve test yazısı silindi`);
  console.log(failures ? `\n${failures} kontrol başarısız` : "\nTÜM KONTROLLER GEÇTİ (GERÇEK API)");
  process.exitCode = failures ? 1 : 0;
}
