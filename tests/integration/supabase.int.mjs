// GERÇEK Supabase entegrasyon testi (mock değil).
//   INTEGRATION_TARGET=test        npm run test:integration   # varsayılan: ayrı test projesi
//   INTEGRATION_TARGET=production  npm run test:integration   # canlıda kısa, izole akış
//
// Kimlik bilgileri bu makinedeki Supabase CLI oturumuyla Yönetim API'sinden
// yalnızca belleğe alınır; yazdırılmaz, dosyaya yazılmaz. Service-role anahtarı
// YALNIZCA geçici test yöneticisini oluşturmak/silmek ve temizlik doğrulaması
// için kullanılır; blog işlemleri uygulamanın kullandığı yoldan (anon anahtar +
// yönetici oturumu, RLS açık) yapılır.
//
// Canlıda: yalnızca "e2e-<runId>" işaretli taslaklar, ileri tarihli (herkese
// görünmeyen) yayın, test etiketi, test görseli ve "e2e" AI anahtarları kullanılır;
// hepsi `finally` bloğunda silinir ve silindiği doğrulanır. Gerçek kayıtlara dokunulmaz.

import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { projectKeys, sql } from "../../scripts/supabase/_api.mjs";
import { resolveRef } from "../../scripts/supabase/project.mjs";

const TARGET = process.env.INTEGRATION_TARGET === "production" ? "production" : "test";
const PRODUCTION = TARGET === "production";
const RUN = `e2e-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
const ref = resolveRef(PRODUCTION ? "linked" : "test");
const cleanupLog = [];

let keys;
let service; // yalnızca kurulum/temizlik
let anon; // oturumsuz istemci
let adminClient; // geçici yönetici oturumu (uygulamanın yolu)
let adminUser;
const created = { posts: [], tags: [], media: [], storage: [] };

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

before(async () => {
  keys = await projectKeys(ref);
  assert.ok(keys.anon && keys.serviceRole, "proje anahtarları alınamadı");
  service = createClient(keys.url, keys.serviceRole, noSession);
  anon = createClient(keys.url, keys.anon, noSession);
  const email = `${RUN}@example.com`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(error);
  adminUser = data.user;
  const promoted = await service.from("blog_admins").insert({ user_id: adminUser.id, display_name: "E2E Test" });
  assert.ifError(promoted.error);
  adminClient = createClient(keys.url, keys.anon, noSession);
  const signIn = await adminClient.auth.signInWithPassword({ email, password });
  assert.ifError(signIn.error);
});

after(async () => {
  // Temizlik: test verisi her durumda silinir, ardından silindiği doğrulanır.
  const step = async (label, fn) => {
    try {
      await fn();
      cleanupLog.push(`ok ${label}`);
    } catch (error) {
      cleanupLog.push(`HATA ${label}: ${error.message}`);
    }
  };
  if (service) {
    await step("yazılar", async () => {
      if (created.posts.length) await service.from("blog_posts").delete().in("id", created.posts).throwOnError();
    });
    await step("medya", async () => {
      if (created.media.length) await service.from("blog_media").delete().in("id", created.media).throwOnError();
      if (created.storage.length) await service.storage.from("blog-media").remove(created.storage);
    });
    await step("etiketler", async () => {
      if (created.tags.length) await service.from("blog_tags").delete().in("id", created.tags).throwOnError();
    });
    await step("AI test kayıtları", async () => {
      await service.from("ai_usage_counters").delete().like("key", `%${RUN}%`).throwOnError();
      await service.from("ai_jobs").delete().like("idempotency_key", `${RUN}%`).throwOnError();
      await service.from("ai_leases").delete().like("key", `%${RUN}%`).throwOnError();
      await service.from("ai_usage_events").delete().like("op_id", `${RUN}%`).throwOnError();
    });
    await step("geçici yönetici", async () => {
      if (adminUser) {
        const { error } = await service.auth.admin.deleteUser(adminUser.id);
        if (error) throw error;
      }
    });
    const [left] = await sql(ref, `select
      (select count(*) from public.blog_posts where slug like '${RUN}%') posts,
      (select count(*) from public.blog_tags where slug like '${RUN}%') tags,
      (select count(*) from public.blog_media where storage_path like '${RUN}%') media,
      (select count(*) from public.blog_admins where display_name = 'E2E Test') admins,
      (select count(*) from auth.users where email like 'e2e-%@example.com') users,
      (select count(*) from public.ai_usage_counters where key like '%${RUN}%') counters`);
    const leftovers = Object.entries(left).filter(([, count]) => Number(count) > 0);
    cleanupLog.push(leftovers.length ? `HATA kalan test verisi: ${JSON.stringify(left)}` : "ok temizlik doğrulandı (kalan test verisi yok)");
  }
  console.log(`\n[${TARGET}] temizlik: ${cleanupLog.join(" · ")}`);
  if (cleanupLog.some((line) => line.startsWith("HATA"))) process.exitCode = 1;
});

describe(`Supabase entegrasyonu (${TARGET})`, () => {
  test("doğru projeye bağlı; şema ve migration geçmişi beklenen hâlde", async () => {
    const [info] = await sql(ref, "select current_database() db, current_setting('server_version') version");
    assert.equal(info.db, "postgres");
    const tables = (await sql(ref, "select table_name from information_schema.tables where table_schema='public'")).map((row) => row.table_name);
    for (const table of ["blog_admins", "blog_categories", "blog_tags", "blog_media", "blog_posts", "blog_post_tags", "blog_slug_redirects", "ai_limit_overrides", "ai_usage_counters", "ai_leases", "ai_jobs", "ai_usage_events"]) {
      assert.ok(tables.includes(table), `${table} tablosu yok`);
    }
    const columns = (await sql(ref, "select column_name from information_schema.columns where table_schema='public' and table_name='blog_posts'")).map((row) => row.column_name);
    for (const column of ["slug", "status", "published_at", "seo_title", "seo_description", "cover_media_id", "category_id", "revision", "deleted_at", "content"]) assert.ok(columns.includes(column), `blog_posts.${column} yok`);
    const rls = await sql(ref, "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity");
    assert.deepEqual(rls, [], "RLS kapalı tablo var");
    const applied = (await sql(ref, "select version from supabase_migrations.schema_migrations order by version")).map((row) => row.version);
    const local = readdirSync("supabase/migrations").filter((file) => file.endsWith(".sql")).map((file) => file.slice(0, 14)).sort();
    assert.deepEqual(applied, local, "migration geçmişi yerel dosyalarla aynı değil");
  });

  test("yetkisiz istekler reddedilir", async () => {
    const insert = await anon.from("blog_posts").insert({ title: "x", slug: `${RUN}-anon` });
    assert.ok(insert.error, "anon yazı oluşturabildi");
    const drafts = await anon.from("blog_posts").select("id").eq("status", "draft");
    assert.equal(drafts.data.length, 0, "anon taslak görebildi");
    const reserve = await anon.rpc("ai_reserve", { p_key: `text:${RUN}`, p_day: "2026-10-24", p_neuron_day: "2026-10-23", p_requests: 1, p_tokens: 0, p_images: 0, p_neurons: 0, p_max_requests: 5, p_max_tokens: null, p_max_images: null, p_max_neurons: 9000 });
    assert.ok(reserve.error, "anon ai_reserve çağırabildi");
    const upload = await anon.storage.from("blog-media").upload(`${RUN}/anon.webp`, Buffer.from("x"), { contentType: "image/webp" });
    assert.ok(upload.error, "anon görsel yükleyebildi");
  });

  test("birden fazla taslak: oluştur, yeniden oku, güncelle; slug çakışması engellenir; SEO/kategori/etiket korunur", async () => {
    const { data: category } = await adminClient.from("blog_categories").select("id").order("position").limit(1).single();
    const tag = await adminClient.from("blog_tags").insert({ name: `E2E ${RUN}`.slice(0, 40), slug: `${RUN}-etiket` }).select("id").single();
    assert.ifError(tag.error);
    created.tags.push(tag.data.id);
    const base = { content: { type: "blocks", version: 1, blocks: [] }, category_id: category.id, author_id: adminUser.id, author_name: "E2E Test" };
    for (const suffix of ["a", "b"]) {
      const row = await adminClient.from("blog_posts").insert({ ...base, title: `E2E ${suffix}`, slug: `${RUN}-${suffix}`, seo_title: `SEO ${suffix}`, seo_description: `Meta ${suffix}` }).select("id, revision, status, created_at, updated_at").single();
      assert.ifError(row.error);
      assert.equal(row.data.status, "draft");
      created.posts.push(row.data.id);
    }
    const link = await adminClient.from("blog_post_tags").insert({ post_id: created.posts[0], tag_id: tag.data.id });
    assert.ifError(link.error);
    const listed = await adminClient.from("blog_posts").select("id, slug, seo_title, seo_description, category_id, tags:blog_tags(slug)").like("slug", `${RUN}-%`).order("slug");
    assert.ifError(listed.error);
    assert.equal(listed.data.length, 2, "iki taslak listelenmedi");
    assert.equal(listed.data[0].seo_title, "SEO a");
    assert.equal(listed.data[0].category_id, category.id);
    assert.deepEqual(listed.data[0].tags.map((item) => item.slug), [`${RUN}-etiket`]);
    // Uygulamanın yolu (actions.js updateWithRevision): beklenen revizyonla güncelle, revizyonu artır.
    const updated = await adminClient.from("blog_posts").update({ title: "E2E a (güncel)", seo_description: "Güncel meta", revision: 2 }).eq("id", created.posts[0]).eq("revision", 1).select("title, seo_description, revision, updated_at, created_at").maybeSingle();
    assert.ifError(updated.error);
    assert.equal(updated.data.title, "E2E a (güncel)");
    assert.equal(updated.data.revision, 2);
    assert.ok(new Date(updated.data.updated_at) > new Date(updated.data.created_at), "updated_at tetikleyicisi çalışmadı");
    // Eski revizyonla gelen ikinci kayıt (başka sekme) hiçbir satırı değiştirmez → çakışma bildirilir.
    const stale = await adminClient.from("blog_posts").update({ title: "eski sekme", revision: 2 }).eq("id", created.posts[0]).eq("revision", 1).select("id").maybeSingle();
    assert.ifError(stale.error);
    assert.equal(stale.data, null, "eski revizyonla yapılan kayıt güncel içeriği ezdi");
    const reread = await adminClient.from("blog_posts").select("title").eq("id", created.posts[0]).single();
    assert.equal(reread.data.title, "E2E a (güncel)");
    const duplicate = await adminClient.from("blog_posts").insert({ ...base, title: "kopya", slug: `${RUN}-a` });
    assert.equal(duplicate.error?.code, "23505", "slug çakışması engellenmedi");
  });

  test("yayınlama: test projesinde herkese açık; canlıda ileri tarihli (görünmez)", async () => {
    const publishAt = PRODUCTION ? new Date(Date.now() + 365 * 86_400_000).toISOString() : new Date(Date.now() - 1_000).toISOString();
    const published = await adminClient.from("blog_posts").update({ status: "published", published_at: publishAt }).eq("id", created.posts[1]).select("status").single();
    assert.ifError(published.error);
    assert.equal(published.data.status, "published");
    const visible = await anon.from("blog_posts").select("id").eq("id", created.posts[1]);
    assert.equal(visible.data.length, PRODUCTION ? 0 : 1, PRODUCTION ? "ileri tarihli yazı herkese göründü" : "yayındaki yazı herkese görünmedi");
  });

  test("görsel: yetkili yükleme, kalıcı kayıt, kapak ilişkisi ve kullanım sayacı", async () => {
    const webp = await sharp({ create: { width: 64, height: 40, channels: 3, background: "#204060" } }).webp().toBuffer();
    const path = `${RUN}/kapak.webp`;
    const upload = await adminClient.storage.from("blog-media").upload(path, webp, { contentType: "image/webp" });
    assert.ifError(upload.error);
    created.storage.push(path);
    const publicUrl = adminClient.storage.from("blog-media").getPublicUrl(path).data.publicUrl;
    const media = await adminClient.from("blog_media").insert({ storage_path: path, url: publicUrl, mime_type: "image/webp", size_bytes: webp.length, width: 64, height: 40, alt_text: "E2E kapak", created_by: adminUser.id }).select("id").single();
    assert.ifError(media.error);
    created.media.push(media.data.id);
    const cover = await adminClient.from("blog_posts").update({ cover_media_id: media.data.id, cover_alt: "E2E kapak" }).eq("id", created.posts[0]);
    assert.ifError(cover.error);
    const usage = await adminClient.rpc("blog_media_usage", { media_id: media.data.id });
    assert.equal(usage.data, 1, "görsel kullanımı sayılmadı (silme koruması)");
    const fetched = await fetch(publicUrl);
    assert.equal(fetched.status, 200, "görsel herkese açık URL'den okunamadı");
    const pdf = await adminClient.storage.from("blog-media").upload(`${RUN}/kotu.pdf`, Buffer.from("%PDF-1.4"), { contentType: "application/pdf" });
    assert.ok(pdf.error, "izin verilmeyen dosya türü yüklenebildi");
  });

  test("AI sayaçları: yönetici oturumuyla atomik rezervasyon; limit aşılmaz", async () => {
    const key = `text:${RUN}`;
    const reserve = () => adminClient.rpc("ai_reserve", { p_key: key, p_day: "2026-10-24", p_neuron_day: "2026-10-23", p_requests: 1, p_tokens: 0, p_images: 0, p_neurons: 0, p_max_requests: 3, p_max_tokens: null, p_max_images: null, p_max_neurons: 9000 });
    const results = await Promise.all(Array.from({ length: 8 }, reserve));
    for (const result of results) assert.ifError(result.error);
    assert.equal(results.filter((result) => result.data[0].ok).length, 3, "eşzamanlı rezervasyon limiti aştı");
    const job1 = await adminClient.rpc("ai_begin_job", { p_key: `${RUN}-job`, p_kind: "image", p_post_id: null, p_stage: null });
    const job2 = await adminClient.rpc("ai_begin_job", { p_key: `${RUN}-job`, p_kind: "image", p_post_id: null, p_stage: null });
    assert.equal(job1.data[0].created, true);
    assert.equal(job2.data[0].created, false, "aynı işlem kimliğiyle ikinci iş açıldı");
  });

  test("silme: yazılar kalıcı silinir, ilişkili etiket bağları kaskadla kalkar", async () => {
    const removed = await adminClient.from("blog_posts").delete().in("id", created.posts).select("id");
    assert.ifError(removed.error);
    assert.equal(removed.data.length, 2);
    const links = await adminClient.from("blog_post_tags").select("post_id").in("post_id", created.posts);
    assert.equal(links.data.length, 0);
    created.posts = [];
  });
});
