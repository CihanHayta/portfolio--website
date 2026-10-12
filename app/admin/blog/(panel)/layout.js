import { Suspense } from "react";
import Header from "@/components/Header";
import { getSidebarCounts, requireAdmin } from "@/lib/blog/admin";
import AdminSidebar from "@/components/admin/AdminSidebar";
import Toaster from "@/components/admin/Toaster";
import styles from "../../admin.module.css";

async function SidebarWithCounts() {
  const { supabase } = await requireAdmin();
  return <AdminSidebar counts={await getSidebarCounts(supabase)} />;
}

export default async function AdminPanelLayout({ children }) {
  await requireAdmin();

  return (
    <>
      <Header variant="blog" />
      <div className={styles.shell}>
        {/* Sayılar gelene kadar menü sayısız görünür; sayfa içeriği beklemez. */}
        <Suspense fallback={<AdminSidebar counts={null} />}>
          <SidebarWithCounts />
        </Suspense>
        <main className={styles.shellMain}>{children}</main>
        <Toaster />
      </div>
    </>
  );
}
