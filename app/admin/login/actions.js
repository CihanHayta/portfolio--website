"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { safeAdminPath } from "@/lib/blog/adminRedirect";
import { checkLogin, recordFailure, recordSuccess } from "@/lib/blog/loginThrottle";

const CREDENTIALS = "E-posta ya da şifre hatalı.";

// Supabase Auth hatasını kullanıcıya gösterilecek metne çevirir. Kimlik
// bilgisiyle ilgili her hata aynı metni alır; hangi alanın yanlış olduğu ya
// da hesabın var olup olmadığı bilinçli olarak söylenmez.
function authMessage(error) {
  if (error?.status === 429 || error?.code === "over_request_rate_limit") {
    return "Çok fazla deneme yapıldı. Birkaç dakika sonra yeniden dene.";
  }
  if (!error?.status || error.status >= 500) return "Giriş servisine şu an ulaşılamıyor. Biraz sonra yeniden dene.";
  return CREDENTIALS;
}

export async function login(_previous, formData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeAdminPath(String(formData.get("next") ?? ""));

  if (!isSupabaseConfigured()) return { error: "Supabase bağlantısı yapılandırılmamış.", email };
  if (!email || !password) return { error: "E-posta ve şifre zorunlu.", email };

  // Kaba kuvvet koruması: çok sayıda hatalı denemede Supabase'e hiç gidilmez.
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim();
  const throttle = checkLogin(ip, email);
  if (!throttle.allowed) {
    return { error: `Çok fazla hatalı deneme yapıldı. ${Math.ceil(throttle.retryAfterSeconds / 60)} dakika sonra yeniden dene.`, email };
  }

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    // Yalnızca kimlik bilgisi hataları sayılır; ağ/servis hataları ve hız sınırı sayılmaz.
    if (error?.status >= 400 && error.status < 500 && error.status !== 429) recordFailure(ip, email);
    return { error: authMessage(error), email };
  }

  const { data: admin } = await supabase
    .from("blog_admins")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!admin) {
    await supabase.auth.signOut();
    recordFailure(ip, email);
    return { error: "Bu hesabın blog yönetimi yetkisi yok.", email };
  }
  recordSuccess(ip, email);

  redirect(next);
}
