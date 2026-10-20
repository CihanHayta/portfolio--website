export const PRODUCTION_SITE_URL = "https://personadijitalpazarlama.com";

// Canlı ortamda canonical, sitemap ve paylaşım adresleri yerel ya da önizleme
// alan adına düşmemeli: yanlış yapılandırılmış değer üretimde yok sayılır.
export function resolveSiteUrl(value, environment) {
  const fallback = PRODUCTION_SITE_URL;
  let url;
  try {
    url = new URL(value || fallback);
  } catch {
    return fallback;
  }
  if (environment === "production" && (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url.hostname) || url.hostname.endsWith(".vercel.app"))) {
    return fallback;
  }
  return url.origin;
}

export const SITE_URL = resolveSiteUrl(
  process.env.NEXT_PUBLIC_SITE_URL,
  process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV
);

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const MEDIA_BUCKET = "blog-media";

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

// Oturum çerezleri yalnızca sunucuda okunur: betiklere kapalıdır (httpOnly)
// ve canlıda yalnızca HTTPS üzerinden gönderilir.
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
