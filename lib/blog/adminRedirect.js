// Girişten sonra dönülecek adresi doğrular (saf; proxy, giriş sayfası ve
// sunucu işlemi kullanır). Yalnızca bu sitedeki yönetim sayfalarına izin
// verilir; başka bir siteye, giriş sayfasının kendisine ya da API'ye giden
// her değer varsayılan yönetim ana sayfasına düşer (açık yönlendirme yok).

export const ADMIN_HOME = "/admin/blog";
const MAX_LENGTH = 512;
const BASE = "http://admin.invalid";

export function safeAdminPath(value) {
  if (typeof value !== "string" || !value || value.length > MAX_LENGTH) return ADMIN_HOME;
  // "//site.com", "/\site.com" ve kontrol karakterleri tarayıcıda başka
  // bir siteye çözülebilir; ayrıştırmadan önce reddedilir.
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return ADMIN_HOME;

  let url;
  try {
    url = new URL(value, BASE);
  } catch {
    return ADMIN_HOME;
  }
  if (url.origin !== BASE) return ADMIN_HOME;

  const { pathname, search } = url;
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  if (!isAdminPage || pathname === "/admin" || pathname.startsWith("/admin/login")) return ADMIN_HOME;
  return pathname + search;
}

// Oturumsuz istek giriş ekranına çevrilirken hedef adres korunur. Yönetim
// ana sayfası için parametre eklenmez; adres çubuğu sade kalır.
export function loginUrlFor(pathname, search = "") {
  const target = safeAdminPath(pathname + search);
  return target === ADMIN_HOME ? "/admin/login" : `/admin/login?next=${encodeURIComponent(target)}`;
}
