import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// İstek başına bir kez çalışır. getUser() çerezdeki jetonu Supabase Auth
// sunucusunda doğrular; çerezin içeriğine tek başına güvenilmez.
export const getAdmin = cache(async () => {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createSessionClient();

  // İki istek aynı anda gider: kullanıcı doğrulaması ve yönetici kaydı. RLS,
  // yönetici olmayan oturuma blog_admins tablosundan satır döndürmez.
  const [{ data: { user } }, { data: admins }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("blog_admins").select("user_id, display_name"),
  ]);
  if (!user) return null;

  const admin = admins?.find((row) => row.user_id === user.id);
  if (!admin) return null;

  return { supabase, user, displayName: admin.display_name };
});

// Sayfalar için: yetkisiz isteği giriş ekranına yollar.
export async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export const ADMIN_POST_FIELDS =
  "id, title, slug, excerpt, content, cover_media_id, cover_alt, category_id, author_name, " +
  "status, published_at, is_featured, seo_title, seo_description, canonical_url, revision, " +
  "deleted_at, created_at, updated_at, " +
  "cover:blog_media(id, url, width, height, alt_text), tags:blog_tags(name)";

export async function getSidebarCounts(supabase) {
  const head = { count: "exact", head: true };
  const [all, drafts, trash, categories, tags] = await Promise.all([
    supabase.from("blog_posts").select("id", head).is("deleted_at", null),
    supabase.from("blog_posts").select("id", head).is("deleted_at", null).eq("status", "draft"),
    supabase.from("blog_posts").select("id", head).not("deleted_at", "is", null),
    supabase.from("blog_categories").select("id", head),
    supabase.from("blog_tags").select("id", head),
  ]);
  return {
    all: all.count ?? 0,
    drafts: drafts.count ?? 0,
    trash: trash.count ?? 0,
    categories: categories.count ?? 0,
    tags: tags.count ?? 0,
  };
}
