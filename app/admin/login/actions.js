"use server";

import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function login(_previous, formData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!isSupabaseConfigured()) return { error: "Supabase bağlantısı yapılandırılmamış.", email };
  if (!email || !password) return { error: "E-posta ve parola zorunlu.", email };

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  // Hangi alanın yanlış olduğu bilinçli olarak söylenmez.
  if (error || !data.user) return { error: "E-posta ya da parola hatalı.", email };

  const { data: admin } = await supabase
    .from("blog_admins")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!admin) {
    await supabase.auth.signOut();
    return { error: "Bu hesabın blog yönetimi yetkisi yok.", email };
  }

  redirect("/admin/blog");
}
