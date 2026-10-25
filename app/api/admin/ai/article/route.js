import { AiError } from "@/lib/ai/gemini";
import { generateJsonRouted as generateJson } from "@/lib/ai/textRouter";
import { errorResponse, json, readAdminRequest } from "@/lib/ai/http";
import { ARTICLE_SCHEMA, ARTICLE_SYSTEM, MAX_INLINE_IMAGES, buildArticlePrompt, normalizeArticle } from "@/lib/ai/prompts";
import { blocksToDoc } from "@/lib/ai/tiptap";
import { uniqueSlug } from "@/lib/ai/uniqueSlug";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SOURCE_CHARS = 32_000;

const clip = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// 3. adım: görseller hazırlandıktan sonra SEO alanlarını ve özgün makaleyi
// üretir, editörün (Tiptap) belge yapısına çevirir. Hiçbir şey kaydetmez.
export async function POST(request) {
  const { admin, body, response } = await readAdminRequest(request);
  if (!admin) return response;

  const postId = body.postId ? String(body.postId) : null;
  const sourceText = String(body.source?.text ?? "");
  const plannedImages = Array.isArray(body.images) ? body.images.slice(0, MAX_INLINE_IMAGES + 1) : [];
  if ((postId && !UUID.test(postId)) || sourceText.length < 400 || sourceText.length > MAX_SOURCE_CHARS) {
    return json({ error: "Geçersiz istek." }, 400);
  }

  try {
    // Görseller gerçekten hazır mı? Medya kayıtları veritabanından doğrulanır;
    // istemcinin gönderdiği adres ya da boyuta güvenilmez.
    const mediaIds = plannedImages.map((image) => String(image?.mediaId ?? "")).filter((id) => UUID.test(id));
    const [{ data: mediaRows, error: mediaError }, { data: categories, error: categoryError }] = await Promise.all([
      admin.supabase.from("blog_media").select("id, url, width, height").in("id", mediaIds),
      admin.supabase.from("blog_categories").select("id, name, slug").order("position").order("name"),
    ]);
    if (mediaError) throw mediaError;
    if (categoryError) throw categoryError;

    const mediaById = new Map(mediaRows.map((media) => [media.id, media]));
    const images = [];
    for (const [index, image] of plannedImages.entries()) {
      const media = mediaById.get(String(image?.mediaId ?? ""));
      if (!media) {
        return json({ error: "Görseller hazır olmadan makale oluşturulamaz. Eksik görseli yeniden hazırla." }, 409);
      }
      const role = image.role === "cover" ? "cover" : "inline";
      images.push({
        id: role === "cover" ? "cover" : `inline-${index}`,
        role,
        concept: clip(image.concept, 90),
        alt: clip(image.alt, 300),
        placement: clip(image.placement, 200),
        media,
      });
    }
    if (images.filter((image) => image.role === "cover").length !== 1) {
      return json({ error: "Makale oluşturmak için bir kapak görseli gerekli." }, 409);
    }

    const source = {
      title: clip(body.source.title, 300),
      text: sourceText,
      truncated: Boolean(body.source.truncated),
      wordCount: Number.parseInt(body.source.wordCount, 10) || 800,
    };
    const plan = {
      summary: clip(body.plan?.summary, 700),
      keyPoints: (Array.isArray(body.plan?.keyPoints) ? body.plan.keyPoints : [])
        .map((point) => clip(point, 260))
        .filter(Boolean)
        .slice(0, 10),
    };

    const result = await generateJson({
      task: "article",
      db: admin.supabase,
      system: ARTICLE_SYSTEM,
      prompt: buildArticlePrompt({ source, plan, images, categories }),
      schema: ARTICLE_SCHEMA,
      temperature: 0.7,
    });

    const inline = images.filter((image) => image.role === "inline");
    const article = normalizeArticle(result.data, {
      imageIds: inline.map((image) => image.id),
      categorySlugs: categories.map((category) => category.slug),
    });
    if (!article) throw new AiError("Gemini geçerli bir makale üretemedi. Yeniden dene.", "invalid");

    const { blocks, missingImages, categorySlug, ...fields } = article;
    const doc = blocksToDoc(blocks, inline, missingImages);

    return json({
      article: {
        ...fields,
        slug: await uniqueSlug(admin.supabase, fields.slug || "yazi", postId),
        categoryId: categories.find((category) => category.slug === categorySlug)?.id ?? "",
      },
      doc,
      model: result.model,
      tokens: result.usage?.totalTokenCount ?? null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
