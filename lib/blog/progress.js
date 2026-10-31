// Okuma ilerlemesi (0–1): yalnızca makale gövdesine göre. Gövdenin üstü sabit
// başlığın (header + çubuk) altına geldiğinde 0, gövdenin sonu ekranın altına
// geldiğinde 1. Footer ve sonraki bölümler hesaba girmez.
//   top: gövdenin ekrana göre üst konumu (getBoundingClientRect().top)
//   height: gövdenin yüksekliği · viewport: pencere yüksekliği · offset: sabit üst alan
export function articleProgress({ top, height, viewport, offset = 0 }) {
  if (!(height > 0) || !(viewport > 0)) return 0;
  const travelled = offset - top; // başlık çizgisinden geçen gövde miktarı
  const total = height - (viewport - offset); // gövdeyi baştan sona geçmek için kaydırma
  if (total <= 0) return travelled >= 0 ? 1 : 0; // gövde ekrana sığıyorsa
  return Math.min(1, Math.max(0, travelled / total));
}
