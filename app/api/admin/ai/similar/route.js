import { compareWithArchive, buildSuggestPrompt, normalizeSuggestions, SUGGEST_SCHEMA, SUGGEST_SYSTEM } from "@/lib/ai/archiveCompare";
import { generateJson } from "@/lib/ai/gemini";
import { errorResponse, json, readAdminRequest } from "@/lib/ai/http";
import { contentHeadings, contentText, toBlocks } from "@/lib/blog/blocks/model";

// Önizleme için: her başlığın altındaki mevcut metnin baş kısmı.
function sectionExcerpts(content) {
  const out = {};
  let current = "";
  for (const block of content ? toBlocks(content) : []) {
    if (block.type === "heading") {
      current = String(block.props?.text ?? "").trim();
      continue;
    }
    if (!current) continue;
    const text = contentText({ type: "blocks", version: 1, blocks: [block] });
    if (text) out[current] = `${out[current] ? `${out[current]} ` : ""}${text}`.slice(0, 600);
  }
  return out;
}
import { postState } from "@/lib/blog/format";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Arşiv sayfa sayfa okunur (her sayfa 200 yazı); hiçbir kayıt sessizce atlanmaz.
// Güvenlik tavanı aşılırsa yanıtta `limited: true` ve gerçek toplam döner.
const PAGE_SIZE = 200;
const ARCHIVE_CAP = 2000;
const SOURCE_KINDS = new Set(["url", "screenshots", "text"]);
const POST_FIELDS = "id, title, slug, status, excerpt, seo_title, seo_description, content, published_at, deleted_at, category:blog_categories(name), tags:blog_tags(name)";

const clip = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function readSource(raw) {
  if (!raw || !SOURCE_KINDS.has(raw.kind)) return null;
  const text = String(raw.text ?? "").trim().slice(0, 36_000);
  if (!text) return null;
  const words = (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
  return { kind: raw.kind, title: clip(raw.title, 200), text, wordCount: Math.min(words, Number.parseInt(raw.wordCount, 10) || words) };
}

// Arşivdeki bir yazının karşılaştırmada kullanılan alanları.
function toArchivePost(row, now) {
  return {
    id: row.id,
    title: row.title ?? "",
    slug: row.slug ?? "",
    state: postState(row, now),
    excerpt: row.excerpt ?? "",
    seoTitle: row.seo_title ?? "",
    seoDescription: row.seo_description ?? "",
    category: row.category?.name ?? "",
    tags: (row.tags ?? []).map((tag) => tag.name),
    headings: contentHeadings(row.content).map((heading) => heading.label).filter(Boolean),
    text: contentText(row.content),
  };
}

// Kaynağı blog arşiviyle karşılaştırır (mode: "compare") ya da seçilen mevcut
// yazı için güncelleme önerisi hazırlar (mode: "suggest"). İkisi de salt
// okunurdur; taslaklar yalnızca yönetici oturumuyla (RLS) okunur.
export async function POST(request) {
  const { admin, body, response } = await readAdminRequest(request);
  if (!admin) return response;

  const source = readSource(body.source);
  if (!source) return json({ error: "Karşılaştırılacak kaynak metni yok." }, 400);
  const generate = (options) => generateJson({ ...options });

  try {
    if (body.mode === "suggest") {
      const postId = String(body.postId ?? "");
      if (!UUID.test(postId)) return json({ error: "Geçersiz istek." }, 400);
      const { data, error } = await admin.supabase.from("blog_posts").select(POST_FIELDS).eq("id", postId).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Yazı bulunamadı." }, 404);
      const post = toArchivePost(data, Date.now());
      const missing = (Array.isArray(body.missing) ? body.missing : []).map((item) => clip(item, 160)).filter(Boolean).slice(0, 8);
      const result = await generate({ system: SUGGEST_SYSTEM, prompt: buildSuggestPrompt({ post, source, missing }), schema: SUGGEST_SCHEMA, temperature: 0.4, maxOutputTokens: 8192, budgetMs: 50_000 });
      return json({ post: { id: post.id, title: post.title, state: post.state, headings: post.headings, sections: sectionExcerpts(data.content) }, suggestions: normalizeSuggestions(result.data, post.headings), model: result.model });
    }

    const data = [];
    let count = null;
    for (let from = 0; from < ARCHIVE_CAP; from += PAGE_SIZE) {
      const page = await admin.supabase
        .from("blog_posts")
        .select(POST_FIELDS, { count: from === 0 ? "exact" : undefined })
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, Math.min(from + PAGE_SIZE, ARCHIVE_CAP) - 1);
      if (page.error) throw page.error;
      if (from === 0) count = page.count;
      data.push(...page.data);
      if (page.data.length < PAGE_SIZE) break;
    }
    const now = Date.now();
    const posts = data.map((row) => toArchivePost(row, now));
    const byState = (state) => posts.filter((post) => post.state === state).length;
    const archive = {
      total: count ?? posts.length,
      scanned: posts.length,
      published: byState("published"),
      scheduled: byState("scheduled"),
      drafts: byState("draft"),
      limited: (count ?? 0) > posts.length,
    };
    return json(await compareWithArchive({ source, posts, generate, archive }));
  } catch (error) {
    return errorResponse(error);
  }
}
