import { requireAdmin } from "@/lib/blog/admin";
import { instantiateTemplate, templateByKey } from "@/lib/blog/blocks/templates";
import { SITE_URL } from "@/lib/supabase/env";
import BlogBuilder from "@/components/admin/builder/BlogBuilder";

export const metadata = { title: "Yeni Blog Yazısı — Blog Yönetimi" };

// Editör yalnızca kategori listesini bekler; yazı kaydı ilk kaydetmede açılır.
// `?template=<anahtar>` ile şablon galerisinden gelinirse taslak o şablonun
// bloklarıyla açılır; `&studio=1` ile AI Blog Stüdyosu da kendiliğinden açılır. Hiçbir şey kaydedilmez ya da yayımlanmaz.
export default async function NewPostPage({ searchParams }) {
  const { supabase } = await requireAdmin();
  const { template: templateKey, studio } = await searchParams;
  const template = typeof templateKey === "string" ? templateByKey(templateKey) : null;
  const { data: categories } = await supabase
    .from("blog_categories")
    .select("id, name, slug")
    .order("position")
    .order("name");

  return (
    <BlogBuilder
      post={null}
      categories={categories ?? []}
      siteHost={new URL(SITE_URL).host}
      initialTemplate={template ? { key: template.key, blocks: instantiateTemplate(template) } : null}
      openStudio={studio === "1"}
    />
  );
}
