import { Suspense } from "react";
import { getSidebarCounts, requireAdmin } from "@/lib/blog/admin";
import AdminSidebar from "@/components/admin/AdminSidebar";
import Toaster from "@/components/admin/Toaster";
import styles from "../admin.module.css";

export default async function AdminBlogLayout({ children }) {
  const { supabase } = await requireAdmin();
  const counts = await getSidebarCounts(supabase);

  return (
    <div className={styles.shell}>
      <Suspense>
        <AdminSidebar counts={counts} />
      </Suspense>
      <main className={styles.shellMain}>{children}</main>
      <Toaster />
    </div>
  );
}
