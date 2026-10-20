import { extractArticle, sourceToText } from "@/lib/ai/extract";
import { AiError, generateJson } from "@/lib/ai/gemini";
import { errorResponse, json, readAdminRequest } from "@/lib/ai/http";
import { PLAN_SCHEMA, PLAN_SYSTEM, buildPlanPrompt, inlineImageCount, normalizePlan } from "@/lib/ai/prompts";
import { fetchPage } from "@/lib/ai/safeFetch";

export const runtime = "nodejs";
export const maxDuration = 60;

// 1. adım: kaynak sayfayı güvenli biçimde okur, ana içeriği çıkarır ve yalnızca
// görsel planını üretir. Makale bu aşamada yazılmaz.
export async function POST(request) {
  const { admin, body, response } = await readAdminRequest(request);
  if (!admin) return response;

  try {
    const page = await fetchPage(body.url);
    const article = extractArticle(page.html, page.finalUrl);
    const { text, truncated } = sourceToText(article);

    const source = {
      url: article.canonicalUrl || page.finalUrl,
      title: article.title,
      metaTitle: article.metaTitle,
      metaDescription: article.metaDescription,
      siteName: article.siteName || new URL(page.finalUrl).hostname.replace(/^www\./, ""),
      author: article.author,
      publishedAt: article.publishedAt,
      language: article.language,
      wordCount: article.wordCount,
      headings: article.headings.slice(0, 40),
      images: article.images.slice(0, 12),
      text,
      truncated,
    };

    const inlineCount = inlineImageCount(article.wordCount);
    const result = await generateJson({
      system: PLAN_SYSTEM,
      prompt: buildPlanPrompt(source, inlineCount),
      schema: PLAN_SCHEMA,
      temperature: 0.5,
      maxOutputTokens: 8192,
      budgetMs: 40_000,
    });

    const plan = normalizePlan(result.data, inlineCount);
    if (!plan) throw new AiError("Gemini geçerli bir görsel planı üretemedi. Yeniden dene.", "invalid");

    return json({ source, plan, model: result.model });
  } catch (error) {
    return errorResponse(error);
  }
}
