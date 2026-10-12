"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { FileText, FolderOpen, Images, LogOut, NotebookPen, SquarePen, Tags, Trash2 } from "lucide-react";
import { logout } from "@/app/admin/blog/actions";
import styles from "./AdminSidebar.module.css";

export default function AdminSidebar({ counts }) {
  const pathname = usePathname();
  const view = useSearchParams().get("view") ?? "";
  const onList = pathname === "/admin/blog";

  const links = [
    { href: "/admin/blog", label: "Tüm Yazılar", Icon: FileText, count: counts?.all, active: onList && !view },
    { href: "/admin/blog/categories", label: "Kategoriler", Icon: FolderOpen, count: counts?.categories },
    { href: "/admin/blog/tags", label: "Etiketler", Icon: Tags, count: counts?.tags },
    { href: "/admin/blog/media", label: "Medya", Icon: Images },
    {
      href: "/admin/blog?view=drafts",
      label: "Taslaklar",
      Icon: NotebookPen,
      count: counts?.drafts,
      active: onList && view === "drafts",
    },
    {
      href: "/admin/blog?view=trash",
      label: "Çöp Kutusu",
      Icon: Trash2,
      count: counts?.trash,
      active: onList && view === "trash",
    },
  ];

  const item = ({ href, label, Icon, count, active }) => (
    <li key={href}>
      <Link
        href={href}
        className={styles.link}
        aria-current={(active ?? pathname === href) ? "page" : undefined}
      >
        <Icon size={18} aria-hidden="true" />
        <span>{label}</span>
        {count === undefined || count === null ? null : <span className={styles.count}>{count}</span>}
      </Link>
    </li>
  );

  return (
    <nav className={styles.sidebar} aria-label="Blog yönetimi">
      <h2 className={styles.title}>Blog Yönetimi</h2>
      <ul className={styles.list}>
        {item(links[0])}
        <li>
          <Link href="/admin/blog/new" className={styles.link}>
            <SquarePen size={18} aria-hidden="true" />
            <span>Yeni Yazı</span>
          </Link>
        </li>
        {links.slice(1).map(item)}
      </ul>

      <form action={logout} className={styles.logout}>
        <button type="submit" className={styles.link}>
          <LogOut size={18} aria-hidden="true" />
          <span>Çıkış yap</span>
        </button>
      </form>
    </nav>
  );
}
