export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://personadijitalpazarlama.com"
).replace(/\/+$/, "");

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const MEDIA_BUCKET = "blog-media";

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
