import "server-only";
import { getAdmin } from "@/lib/blog/admin";
import { isSameOrigin } from "@/lib/blog/media";
import { ExtractError } from "./extract.js";
import { AiError } from "./gemini.js";
import { ImageError } from "./images.js";
import { UnsafeUrlError } from "./netguard.js";
import { PageFetchError } from "./safeFetch.js";
import { ReaderError } from "./sourceReaders.js";

export const json = (body, status = 200) => Response.json(body, { status });

// Yapay zekâ uç noktalarının ortak girişi: aynı kaynak denetimi, yönetici
// yetkisi ve JSON gövde. Yetki her istekte sunucuda yeniden doğrulanır.
export async function readAdminRequest(request) {
  if (!isSameOrigin(request)) return { response: json({ error: "Geçersiz kaynak." }, 403) };

  const admin = await getAdmin();
  if (!admin) return { response: json({ error: "Oturumun sona ermiş. Yeniden giriş yap." }, 401) };

  try {
    const body = await request.json();
    if (!body || typeof body !== "object") throw new Error("gövde");
    return { admin, body };
  } catch {
    return { response: json({ error: "Geçersiz istek." }, 400) };
  }
}

const AI_STATUS = { config: 503, quota: 429, busy: 503, timeout: 504, blocked: 422 };

const READER_STATUS = { notfound: 422, blocked: 400, unreachable: 422, thin: 422, quota: 429, rate: 429, server: 502, timeout: 504, config: 503 };

export function errorResponse(error) {
  if (error instanceof ReaderError) return json({ error: error.message, kind: error.kind }, READER_STATUS[error.kind] ?? 422);
  if (error instanceof UnsafeUrlError) return json({ error: error.message }, 400);
  if (error instanceof PageFetchError || error instanceof ExtractError) return json({ error: error.message }, 422);
  if (error instanceof ImageError) return json({ error: error.message }, 502);
  if (error instanceof AiError) return json({ error: error.message, kind: error.kind }, AI_STATUS[error.kind] ?? 502);
  console.error("[ai] beklenmeyen hata:", error);
  return json({ error: "Beklenmeyen bir hata oluştu. Yeniden dene." }, 500);
}
