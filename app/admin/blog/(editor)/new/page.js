import { requireAdmin } from "@/lib/blog/admin";
import { SITE_URL } from "@/lib/supabase/env";
import BlogBuilder from "@/components/admin/builder/BlogBuilder";

export const metadata = { title: "Yeni Yazı — Blog Yönetimi" };

// Editör yalnızca kategori listesini bekler; yazı kaydı ilk kaydetmede açılır.
export default async function NewPostPage() {
  const { supabase } = await requireAdmin();
  const { data: categories } = await supabase
    .from("blog_categories")
    .select("id, name, slug")
    .order("position")
    .order("name");

  return <BlogBuilder post={null} categories={categories ?? []} siteHost={new URL(SITE_URL).host} />;
}
