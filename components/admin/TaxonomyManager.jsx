"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createCategory, deleteCategory, deleteTag, renameCategory } from "@/app/admin/blog/actions";
import ConfirmDialog from "./ConfirmDialog";
import { toast } from "./toast";
import styles from "@/app/admin/admin.module.css";

// Kategoriler eklenir, yeniden adlandırılır ve silinir. Etiketler yazı
// editöründe oluşturulduğu için burada yalnızca listelenir ve silinir.
export default function TaxonomyManager({ kind, items }) {
  const isCategory = kind === "category";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState(null);

  const run = (action, message, after) =>
    startTransition(async () => {
      const result = await action();
      setDeleting(null);
      if (!result.ok) return toast(result.error, "error");
      toast(message);
      after?.();
      router.refresh();
    });

  return (
    <>
      {isCategory ? (
        <form
          className={styles.inlineForm}
          onSubmit={(event) => {
            event.preventDefault();
            run(() => createCategory(name), "Kategori eklendi.", () => setName(""));
          }}
        >
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={60}
            placeholder="Yeni kategori adı"
            aria-label="Yeni kategori adı"
            className={styles.input}
          />
          <button type="submit" className={styles.btnPrimary} disabled={pending}>
            <Plus size={16} aria-hidden="true" />
            Kategori ekle
          </button>
        </form>
      ) : null}

      {items.length === 0 ? (
        <div className={styles.emptyState}>
          <h2>{isCategory ? "Henüz kategori yok" : "Henüz etiket yok"}</h2>
          <p>
            {isCategory
              ? "Yukarıdaki alandan ilk kategorini ekle."
              : "Etiketler, yazı editöründeki “Etiketler” alanından eklendikçe burada listelenir."}
          </p>
        </div>
      ) : (
        <ul className={styles.simpleList}>
          {items.map((item) => (
            <li key={item.id} className={styles.simpleRow}>
              {isCategory ? (
                <input
                  type="text"
                  defaultValue={item.name}
                  maxLength={60}
                  aria-label={`${item.name} kategorisinin adı`}
                  className={styles.input}
                  onBlur={(event) => {
                    const next = event.target.value.trim();
                    if (next && next !== item.name) {
                      run(() => renameCategory(item.id, next), "Kategori adı güncellendi.");
                    } else {
                      event.target.value = item.name;
                    }
                  }}
                />
              ) : (
                <strong>#{item.name}</strong>
              )}
              <span className={styles.rowMeta}>
                /{item.slug} · {item.postCount} yazı
              </span>
              <button
                type="button"
                className={styles.btnDanger}
                disabled={pending}
                onClick={() => setDeleting(item)}
              >
                <Trash2 size={15} aria-hidden="true" />
                Sil
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={isCategory ? "Kategori silinsin mi?" : "Etiket silinsin mi?"}
        confirmLabel="Sil"
        danger
        busy={pending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          run(
            () => (isCategory ? deleteCategory(deleting.id) : deleteTag(deleting.id)),
            isCategory ? "Kategori silindi." : "Etiket silindi."
          )
        }
      >
        {deleting
          ? isCategory
            ? `“${deleting.name}” silinir; bu kategorideki ${deleting.postCount} yazı silinmez, kategorisiz kalır.`
            : `“${deleting.name}” etiketi ${deleting.postCount} yazıdan kaldırılır. Yazılar silinmez.`
          : null}
      </ConfirmDialog>
    </>
  );
}
