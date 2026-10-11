"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Eye, EyeOff, Pencil, RotateCcw, Trash2 } from "lucide-react";
import {
  deletePostForever,
  duplicatePost,
  restorePost,
  trashPost,
  unpublishPost,
} from "@/app/admin/blog/actions";
import ConfirmDialog from "./ConfirmDialog";
import { toast } from "./toast";
import styles from "./PostRowActions.module.css";

export default function PostRowActions({ post, state }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(null);

  const run = (action, successMessage) =>
    startTransition(async () => {
      const result = await action();
      setConfirm(null);
      if (!result.ok) return toast(result.error, "error");
      toast(successMessage);
      router.refresh();
    });

  if (state === "trashed") {
    return (
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          disabled={pending}
          onClick={() => run(() => restorePost(post.id), "Yazı taslak olarak geri yüklendi.")}
        >
          <RotateCcw size={16} aria-hidden="true" />
          Geri yükle
        </button>
        <button
          type="button"
          className={styles.action}
          data-danger="true"
          disabled={pending}
          onClick={() => setConfirm("forever")}
        >
          <Trash2 size={16} aria-hidden="true" />
          Kalıcı sil
        </button>
        <ConfirmDialog
          open={confirm === "forever"}
          title="Yazı kalıcı olarak silinsin mi?"
          confirmLabel="Kalıcı olarak sil"
          danger
          busy={pending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => run(() => deletePostForever(post.id), "Yazı kalıcı olarak silindi.")}
        >
          “{post.title || "Başlıksız yazı"}” geri getirilemez. Yazının eski adresine gelen
          ziyaretçiler “bulunamadı” sayfasını görür.
        </ConfirmDialog>
      </div>
    );
  }

  const isLive = state === "published";

  return (
    <div className={styles.actions}>
      <Link href={`/admin/blog/${post.id}`} className={styles.icon} aria-label="Düzenle" title="Düzenle">
        <Pencil size={16} />
      </Link>
      {isLive ? (
        <a
          href={`/blog/${post.slug}`}
          target="_blank"
          rel="noreferrer"
          className={styles.icon}
          aria-label="Yayındaki yazıyı aç"
          title="Yayındaki yazıyı aç"
        >
          <ExternalLink size={16} />
        </a>
      ) : (
        <a
          href={`/admin/blog/${post.id}/preview`}
          target="_blank"
          rel="noreferrer"
          className={styles.icon}
          aria-label="Önizle"
          title="Önizle"
        >
          <Eye size={16} />
        </a>
      )}
      <button
        type="button"
        className={styles.icon}
        aria-label="Taslak olarak kopyala"
        title="Taslak olarak kopyala"
        disabled={pending}
        onClick={() => run(() => duplicatePost(post.id), "Yazının taslak kopyası oluşturuldu.")}
      >
        <Copy size={16} />
      </button>
      {state !== "draft" ? (
        <button
          type="button"
          className={styles.icon}
          aria-label="Yayından kaldır"
          title="Yayından kaldır"
          disabled={pending}
          onClick={() => run(() => unpublishPost(post.id, post.revision), "Yazı yayından kaldırıldı.")}
        >
          <EyeOff size={16} />
        </button>
      ) : null}
      <button
        type="button"
        className={styles.icon}
        data-danger="true"
        aria-label="Çöp kutusuna taşı"
        title="Çöp kutusuna taşı"
        disabled={pending}
        onClick={() => setConfirm("trash")}
      >
        <Trash2 size={16} />
      </button>

      <ConfirmDialog
        open={confirm === "trash"}
        title="Yazı çöp kutusuna taşınsın mı?"
        confirmLabel="Çöp kutusuna taşı"
        danger
        busy={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run(() => trashPost(post.id), "Yazı çöp kutusuna taşındı.")}
      >
        “{post.title || "Başlıksız yazı"}”{" "}
        {isLive ? "yayından kalkar ve adresi “bulunamadı” döndürür. " : ""}
        Çöp kutusundan istediğin zaman geri yükleyebilirsin.
      </ConfirmDialog>
    </div>
  );
}
