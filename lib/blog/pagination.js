// Blog listesi sayfalaması: saf yardımcılar (sunucu ve testler için).

export const POSTS_PER_PAGE = 9;
export const MAX_PAGE = 500;

// Adresteki ?page= değeri için karar:
// - yok / boş            → 1. sayfa (canonical /blog)
// - "1", "02", "007"      → aynı içeriğin kanonik adresine kalıcı yönlendirme
//                          ("1" için parametresiz adres, diğerleri için "2", "7")
// - "2" … MAX_PAGE        → o sayfa (var olup olmadığı ayrıca isPageInRange ile denetlenir)
// - "abc", "0", "-3", "2abc", "1.5", MAX_PAGE üstü → geçersiz (404)
// Böylece farklı adresler yanlış bir canonical altında toplanmaz; her içerik
// tek bir adreste 200 döner.
export function readPageParam(value) {
  if (value === undefined || value === null || value === "") return { page: 1, status: "ok" };
  const raw = String(value);
  if (!/^\d+$/.test(raw)) return { page: null, status: "invalid" };
  const page = Number.parseInt(raw, 10);
  if (page < 1 || page > MAX_PAGE) return { page: null, status: "invalid" };
  if (page === 1 || raw !== String(page)) return { page, status: "redirect" };
  return { page, status: "ok" };
}

// Geriye dönük: geçersiz değerler 1. sayfa sayılır, üst sınır uygulanır.
export function parsePage(value) {
  const page = Number.parseInt(value, 10);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(page, MAX_PAGE);
}

export function pageCount(total, perPage = POSTS_PER_PAGE) {
  return Math.max(1, Math.ceil(total / perPage));
}

// 1. sayfa her zaman geçerlidir (yazı olmasa bile boş durum gösterilir);
// sonrakiler yalnızca o sayfada en az bir yazı varsa geçerlidir.
export function isPageInRange(page, total, perPage = POSTS_PER_PAGE) {
  return page >= 1 && page <= pageCount(total, perPage);
}
