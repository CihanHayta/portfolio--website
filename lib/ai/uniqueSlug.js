// Başka bir yazıda kullanılan slug'a sayı eklenir; yayınlama sırasında
// "bu bağlantı kullanılıyor" hatasıyla karşılaşılmaz.
export async function uniqueSlug(supabase, slug, postId) {
  let query = supabase.from("blog_posts").select("slug").like("slug", `${slug}%`).limit(200);
  // Henüz kaydedilmemiş yeni yazının kimliği yoktur.
  if (postId) query = query.neq("id", postId);
  const { data, error } = await query;
  if (error) throw error;
  const taken = new Set(data.map((row) => row.slug));
  if (!taken.has(slug)) return slug;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    if (!taken.has(`${slug}-${suffix}`)) return `${slug}-${suffix}`;
  }
  return `${slug}-${Date.now().toString(36)}`;
}
