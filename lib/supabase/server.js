import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { AUTH_COOKIE_OPTIONS, SUPABASE_URL, SUPABASE_ANON_KEY } from "./env";

// Ziyaretçi sayfaları için: çerez okumaz, RLS'in anon rolüyle çalışır.
// Çerez kullanmadığı için sayfaların önbelleğe alınmasını engellemez.
export function createPublicClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Yönetim paneli için: oturum çerezini okur, RLS'e giriş yapan kullanıcı olarak girer.
export async function createSessionClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component içinden çerez yazılamaz; oturumu proxy.js yeniler.
        }
      },
    },
  });
}
