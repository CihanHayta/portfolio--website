import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  AUTH_COOKIE_OPTIONS,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  isSupabaseConfigured,
} from "@/lib/supabase/env";

// Yönetim rotalarında oturum çerezini yeniler ve giriş yapmamış isteği
// sayfa hiç render edilmeden giriş ekranına çevirir. Yetki (yönetici mi?)
// ayrıca her sayfada ve her sunucu işleminde yeniden doğrulanır.
export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const isLogin = pathname === "/admin/login";
  const isApi = pathname.startsWith("/api/admin");

  if (!isSupabaseConfigured()) {
    if (isApi) return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 503 });
    return isLogin ? NextResponse.next() : NextResponse.redirect(new URL("/admin/login", request.url));
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // getClaims, imzayı projenin açık anahtarıyla yerelde doğrular ve süresi
  // dolmuş oturumu yeniler. Yetkinin asıl denetimi (getUser + blog_admins)
  // her sayfada ve sunucu işleminde ayrıca yapılır.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ?? null;

  if (!user && !isLogin) {
    if (isApi) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
    const url = new URL("/admin/login", request.url);
    return NextResponse.redirect(url);
  }

  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
