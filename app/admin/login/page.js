import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { getAdmin } from "@/lib/blog/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import LoginForm from "./LoginForm";
import styles from "../admin.module.css";

export const metadata = { title: "Giriş — Blog Yönetimi" };

export default async function LoginPage() {
  if (await getAdmin()) redirect("/admin/blog");
  const configured = isSupabaseConfigured();

  return (
    <>
    <Header />
    <main className={styles.loginPage}>
      <div className={styles.loginCard}>
        <h1 className={styles.loginTitle}>Blog Yönetimi</h1>
        <p className={styles.muted}>Devam etmek için yönetici hesabınla giriş yap.</p>

        {configured ? null : (
          <p className={styles.alertWarning} role="status">
            Supabase bağlantısı henüz yapılandırılmamış. <code>.env.local</code> dosyasına{" "}
            <code>NEXT_PUBLIC_SUPABASE_URL</code> ve <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
            değerlerini ekle.
          </p>
        )}

        <LoginForm disabled={!configured} />
      </div>
    </main>
    </>
  );
}
