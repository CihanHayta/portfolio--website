import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { brand } from "@/data/content";
import { getAdmin } from "@/lib/blog/admin";
import { safeAdminPath } from "@/lib/blog/adminRedirect";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import LoginForm from "./LoginForm";
import styles from "../admin.module.css";

export const metadata = { title: { absolute: `Yönetici Girişi — ${brand.legalName}` } };

// `/admin` ve her korumalı yönetim sayfası oturum yoksa buraya gelir.
// Oturum açık bir yönetici doğrudan hedef sayfaya (yoksa yazı listesine) geçer.
export default async function LoginPage({ searchParams }) {
  const { next } = await searchParams;
  const target = safeAdminPath(typeof next === "string" ? next : "");
  if (await getAdmin()) redirect(target);
  const configured = isSupabaseConfigured();

  return (
    <main className={styles.loginPage}>
      <div className={styles.loginCard}>
        <Link href="/" className={styles.loginBrand} aria-label={`${brand.legalName} ana sayfa`}>
          <Image src="/brand/persona-mark.png" alt="" width={36} height={36} className={styles.loginMark} priority />
          <span>
            <span className={styles.loginBrandName}>{brand.name}</span> Dijital Pazarlama
          </span>
        </Link>

        <div className={styles.loginIntro}>
          <h1 className={styles.loginTitle}>Yönetici Girişi</h1>
          <p className={styles.muted}>Blog yazılarını yönetmek için hesabınla giriş yap.</p>
        </div>

        {configured ? null : (
          <p className={styles.alertWarning} role="status">
            Supabase bağlantısı henüz yapılandırılmamış. <code>.env.local</code> dosyasına{" "}
            <code>NEXT_PUBLIC_SUPABASE_URL</code> ve <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
            değerlerini ekle.
          </p>
        )}

        <LoginForm disabled={!configured} next={target} />
      </div>

      <Link href="/" className={styles.loginBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        Siteye dön
      </Link>
    </main>
  );
}
