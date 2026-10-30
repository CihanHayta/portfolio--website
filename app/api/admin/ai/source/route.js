import { getAdmin } from "@/lib/blog/admin";
import { json, readAdminRequest } from "@/lib/ai/http";
import { PROVIDERS, ReaderError, providerOptions, readSource } from "@/lib/ai/sourceReaders";

export const runtime = "nodejs";
export const maxDuration = 60;

// Kaynak URL'yi sağlayıcı zinciriyle okur. Yanıt NDJSON akışıdır: her satır bir
// aşama olayı ({type:"stage"}), en sonda sonuç ({type:"result"}), ekran
// görüntüsüne geçiş önerisi ({type:"fallback"}) ya da hata ({type:"error"}).
// Hiçbir şey kaydetmez.

// Bu sunucuda kullanılabilen okuma yöntemleri (yalnızca yöneticiye; gizli değer içermez).
export async function GET() {
  const admin = await getAdmin();
  if (!admin) return json({ error: "Oturumun sona ermiş. Yeniden giriş yap." }, 401);
  return Response.json({ providers: providerOptions() }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request) {
  const { admin, body, response } = await readAdminRequest(request);
  if (!admin) return response;

  const url = String(body.url ?? "").trim();
  if (!url || url.length > 2000) return json({ error: "Geçerli bir bağlantı yapıştır." }, 400);
  // "auto": yerel → Jina → Firecrawl → tarayıcı. Belirli yöntem: yalnızca o.
  const provider = String(body.provider ?? "auto");
  if (provider !== "auto" && !PROVIDERS.includes(provider)) return json({ error: "Bilinmeyen okuma yöntemi." }, 400);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const out = await readSource(url, { onEvent: (event) => send({ type: "stage", ...event }), only: provider === "auto" ? null : provider });
        if (out.source) {
          const { provider, url: finalUrl, title, siteName, sectionUrl, sectionLabel, text, truncated, images, wordCount } = out.source;
          // siteName/sectionUrl kaynakça içindir; yalnızca sayfada gerçekten bulunanlar gelir.
          send({ type: "result", source: { kind: "url", provider, url: finalUrl, title, siteName, sectionUrl, sectionLabel, text, truncated, images, wordCount }, attempts: out.attempts });
        } else {
          send({
            type: "fallback",
            fallback: out.fallback,
            attempts: out.attempts,
            error:
              provider === "auto"
                ? "Okuyuculardan hiçbiri bu sayfadan yeterli makale metni çıkaramadı. Ekran görüntüsü yükleyerek ya da metni yapıştırarak devam edebilirsin."
                : "Seçilen okuyucu bu sayfadan yeterli makale metni çıkaramadı. Otomatik yöntemi deneyebilir ya da metni yapıştırabilirsin.",
          });
        }
      } catch (error) {
        if (error instanceof ReaderError) send({ type: "error", error: error.message, kind: error.kind });
        else {
          console.error("[ai] kaynak okunamadı:", error);
          send({ type: "error", error: "Beklenmeyen bir hata oluştu. Yeniden dene.", kind: "error" });
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
