// Mantıksal yedeği bir Supabase projesine geri yükler (varsayılan: TEST projesi).
//   node scripts/supabase/restore.mjs <yedek-klasörü> [--target test]
// Canlıya geri yükleme bilinçli olarak desteklenmez; felaket durumunda
// docs/BACKUP_AND_RESTORE.md'deki elle yürütülen adımlar izlenir.
//
// - Hedef projede olmayan kullanıcılara bağlı alanlar (author_id, created_by)
//   boş bırakılır; blog_admins geri yüklenmez (kullanıcılar Auth'ta yaşar).
// - Görseller hedefin blog-media kovasına yüklenir ve URL'ler hedefe çevrilir.
// - Hedef tablolar boş olmalıdır (üzerine yazma yapılmaz).

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { projectKeys, sql } from "./_api.mjs";
import { resolveRef } from "./project.mjs";

const [dir, ...rest] = process.argv.slice(2);
const target = rest.includes("--target") ? rest[rest.indexOf("--target") + 1] : "test";
if (target !== "test") throw new Error("Geri yükleme yalnızca test projesine yapılır.");
if (!dir || !existsSync(join(dir, "manifest.json"))) throw new Error("Yedek klasörü (manifest.json) bulunamadı.");
const ref = resolveRef("test");
const read = (table) => (existsSync(join(dir, "tables", `${table}.json`)) ? JSON.parse(readFileSync(join(dir, "tables", `${table}.json`), "utf8")) : []);
const TAG = "$restore_json$";

// Hedefte içerik varsa durulur. Yalnızca migration'ın eklediği varsayılan
// kategoriler (aynı slug'lar, rastgele kimlikler) yedektekilerle değiştirilir.
const [state] = await sql(ref, "select (select count(*) from public.blog_posts) + (select count(*) from public.blog_media) + (select count(*) from public.blog_tags) as content, coalesce((select json_agg(slug order by slug) from public.blog_categories), '[]'::json) as slugs");
if (Number(state.content) > 0) throw new Error("Hedef projede yazı, medya ya da etiket var; geri yükleme durduruldu.");
const backupSlugs = read("blog_categories").map((category) => category.slug).sort();
const extra = state.slugs.filter((slug) => !backupSlugs.includes(slug));
if (extra.length) throw new Error(`Hedefte yedekte olmayan kategori var (${extra.join(", ")}); durduruldu.`);

const { url, serviceRole } = await projectKeys(ref);
const media = read("blog_media");
const uploaded = [];
for (const item of media) {
  const file = join(dir, "storage", item.storage_path);
  if (!existsSync(file)) continue;
  const response = await fetch(`${url}/storage/v1/object/blog-media/${item.storage_path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${serviceRole}`, apikey: serviceRole, "content-type": item.mime_type ?? "image/webp", "x-upsert": "true" },
    body: readFileSync(file),
  });
  if (!response.ok) throw new Error(`Görsel yüklenemedi (${item.storage_path}): HTTP ${response.status}`);
  uploaded.push(item.storage_path);
  item.url = `${url}/storage/v1/object/public/blog-media/${item.storage_path}`;
  item.created_by = null;
}
// Yazı içeriğine gömülü görsel adresleri de hedef projenin deposuna çevrilir
// (yalnızca medya tablosunu çevirmek yetmez: içerik eski projeyi göstermeye devam eder).
const PUBLIC_PATH = "/storage/v1/object/public/blog-media/";
const oldPrefixes = [...new Set(read("blog_media").map((item) => (item.url.includes(PUBLIC_PATH) ? item.url.slice(0, item.url.indexOf(PUBLIC_PATH) + PUBLIC_PATH.length) : null)).filter(Boolean))];
const newPrefix = `${url}${PUBLIC_PATH}`;
const rewrite = (value) => oldPrefixes.reduce((text, prefix) => text.split(prefix).join(newPrefix), value);
const posts = JSON.parse(rewrite(JSON.stringify(read("blog_posts")))).map((post) => ({ ...post, author_id: null }));

const insert = (table, rows) => (rows.length ? `insert into public.${table} select * from json_populate_recordset(null::public.${table}, ${TAG}${JSON.stringify(rows)}${TAG});` : "");
for (const rows of [read("blog_categories"), read("blog_tags"), media, posts, read("blog_post_tags"), read("blog_slug_redirects")]) {
  if (JSON.stringify(rows).includes(TAG)) throw new Error("Veri ayraç etiketini içeriyor.");
}
await sql(
  ref,
  ["begin;", "delete from public.blog_categories;", insert("blog_categories", read("blog_categories")), insert("blog_tags", read("blog_tags")), insert("blog_media", media), insert("blog_posts", posts), insert("blog_post_tags", read("blog_post_tags")), insert("blog_slug_redirects", read("blog_slug_redirects")), "commit;"].join("\n"),
  { write: true }
);

const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
const [after] = await sql(ref, `select json_build_object(
  'blog_categories', (select count(*) from public.blog_categories), 'blog_tags', (select count(*) from public.blog_tags),
  'blog_media', (select count(*) from public.blog_media), 'blog_posts', (select count(*) from public.blog_posts),
  'blog_post_tags', (select count(*) from public.blog_post_tags), 'blog_slug_redirects', (select count(*) from public.blog_slug_redirects),
  'orphan_post_tags', (select count(*) from public.blog_post_tags pt left join public.blog_posts p on p.id = pt.post_id where p.id is null),
  'broken_covers', (select count(*) from public.blog_posts p where p.cover_media_id is not null and not exists (select 1 from public.blog_media m where m.id = p.cover_media_id)),
  'foreign_storage_urls', (select count(*) from public.blog_posts p where p.content::text ~ 'https://[a-z0-9]+\\.supabase\\.co/storage' and p.content::text not like '%${url.replace("https://", "")}%')
) as r`);
const result = after.r;
const mismatches = Object.keys(result).filter((table) => manifest.tables[table] && Number(result[table]) !== manifest.tables[table].rows);

// İçerik doğrulaması: her yazının slug'ı ve içeriği yedektekiyle birebir aynı mı?
// (jsonb anahtar sırasını değiştirebilir; karşılaştırma sıralı anahtarlarla yapılır.)
const canonical = (value) => (Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value);
const restoredPosts = await sql(ref, "select id, slug, title, content from public.blog_posts");
const byId = new Map(restoredPosts.map((post) => [post.id, post]));
const contentMismatches = posts.filter((post) => {
  const restored = byId.get(post.id);
  return !restored || restored.slug !== post.slug || restored.title !== post.title || JSON.stringify(canonical(restored.content)) !== JSON.stringify(canonical(post.content));
}).map((post) => post.slug);

// Dosya doğrulaması: yüklenen her görsel hedeften indirilir, SHA-256 yedekle aynı olmalı.
const fileMismatches = [];
for (const path of uploaded) {
  const response = await fetch(`${url}/storage/v1/object/public/blog-media/${path}`);
  const remote = response.ok ? createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex") : null;
  const local = createHash("sha256").update(readFileSync(join(dir, "storage", path))).digest("hex");
  if (remote !== local) fileMismatches.push(path);
}
const ok = mismatches.length === 0 && result.orphan_post_tags === 0 && result.broken_covers === 0 && result.foreign_storage_urls === 0 && contentMismatches.length === 0 && fileMismatches.length === 0;
console.log(JSON.stringify({ restoredInto: "test", counts: result, uploadedFiles: uploaded.length, filesVerified: uploaded.length - fileMismatches.length, fileMismatches, contentVerified: posts.length - contentMismatches.length, contentMismatches, mismatches, ok }, null, 1));
process.exitCode = ok ? 0 : 1;
