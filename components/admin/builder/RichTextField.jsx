"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import {
  Bold,
  Code,
  Columns3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Rows3,
  SquareCode,
  Strikethrough,
  Table as TableIcon,
  TextQuote,
  Trash2,
  Underline,
  X,
} from "lucide-react";
import { safeHref } from "@/lib/blog/content";
import proseStyles from "@/components/blog/PostContent.module.css";
import styles from "./RichTextField.module.css";

// Blok içi zengin metin alanı. Başlık, görsel ve video burada yoktur; onların
// kendi blokları vardır. `compact` ayar panelindeki dar sürümdür.
function createExtensions(compact, placeholder) {
  return [
    StarterKit.configure({
      heading: false,
      horizontalRule: false,
      ...(compact ? { codeBlock: false, blockquote: false } : {}),
      link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto", "tel"] },
    }),
    ...(compact ? [] : [TableKit.configure({ table: { resizable: false } })]),
    Placeholder.configure({ placeholder }),
  ];
}

function Tool({ label, active = false, disabled = false, onClick, children }) {
  return (
    <button
      type="button"
      className={styles.tool}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function RichTextField({
  value,
  onChange,
  compact = false,
  autoFocus = false,
  placeholder = "Metninizi buraya yazın…",
  label = "Metin",
}) {
  const [extensions] = useState(() => createExtensions(compact, placeholder));
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const lastEmitted = useRef(value);

  const editor = useEditor({
    extensions,
    content: value,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        class: `${proseStyles.prose} ${styles.editable}`,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
      },
    },
    onUpdate: ({ editor: instance }) => {
      // ProseMirror nesneleri prototipsizdir; düz JSON'a çevrilerek saklanır.
      const json = JSON.parse(JSON.stringify(instance.getJSON()));
      lastEmitted.current = json;
      onChange(json);
    },
  });

  // Değer dışarıdan değiştiyse (geri al / ileri al) editör içeriği eşitlenir.
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return <div className={styles.loading}>Metin alanı yükleniyor…</div>;

  const chain = () => editor.chain().focus();
  const inTable = !compact && editor.isActive("table");

  const applyLink = (event) => {
    event.preventDefault();
    const raw = url.trim();
    const href = safeHref(/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(raw) ? `https://${raw}` : raw);
    if (!href) return setUrlError("Geçerli bir adres yazın (https://…, /sayfa ya da mailto:…).");
    editor.chain().extendMarkRange("link").setLink({ href }).run();
    editor.chain().focus().setTextSelection(editor.state.selection.to).run();
    setLinkOpen(false);
  };

  return (
    <div className={styles.field} data-compact={compact}>
      <div className={styles.toolbar} role="toolbar" aria-label="Metin biçimlendirme">
        <Tool label="Kalın" active={editor.isActive("bold")} onClick={() => chain().toggleBold().run()}>
          <Bold size={16} />
        </Tool>
        <Tool label="İtalik" active={editor.isActive("italic")} onClick={() => chain().toggleItalic().run()}>
          <Italic size={16} />
        </Tool>
        {compact ? null : (
          <>
            <Tool label="Altı çizili" active={editor.isActive("underline")} onClick={() => chain().toggleUnderline().run()}>
              <Underline size={16} />
            </Tool>
            <Tool label="Üstü çizili" active={editor.isActive("strike")} onClick={() => chain().toggleStrike().run()}>
              <Strikethrough size={16} />
            </Tool>
          </>
        )}
        <Tool
          label="Bağlantı"
          active={editor.isActive("link") || linkOpen}
          onClick={() => {
            setUrl(editor.getAttributes("link").href ?? "");
            setUrlError("");
            setLinkOpen((open) => !open);
          }}
        >
          <LinkIcon size={16} />
        </Tool>
        <span className={styles.divider} />
        <Tool label="Madde işaretli liste" active={editor.isActive("bulletList")} onClick={() => chain().toggleBulletList().run()}>
          <List size={16} />
        </Tool>
        <Tool label="Numaralı liste" active={editor.isActive("orderedList")} onClick={() => chain().toggleOrderedList().run()}>
          <ListOrdered size={16} />
        </Tool>
        {compact ? null : (
          <>
            <span className={styles.divider} />
            <Tool label="Alıntı" active={editor.isActive("blockquote")} onClick={() => chain().toggleBlockquote().run()}>
              <TextQuote size={16} />
            </Tool>
            <Tool label="Satır içi kod" active={editor.isActive("code")} onClick={() => chain().toggleCode().run()}>
              <Code size={16} />
            </Tool>
            <Tool label="Kod bloğu" active={editor.isActive("codeBlock")} onClick={() => chain().toggleCodeBlock().run()}>
              <SquareCode size={16} />
            </Tool>
            <Tool
              label="Tablo ekle"
              disabled={inTable}
              onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            >
              <TableIcon size={16} />
            </Tool>
          </>
        )}
      </div>

      {linkOpen ? (
        <form className={styles.context} onSubmit={applyLink}>
          <input
            type="text"
            inputMode="url"
            autoFocus
            value={url}
            aria-label="Bağlantı adresi"
            aria-invalid={Boolean(urlError)}
            placeholder="https://… ya da /blog/yazi"
            onChange={(event) => {
              setUrl(event.target.value);
              setUrlError("");
            }}
          />
          <button type="submit" className={styles.contextPrimary}>
            Uygula
          </button>
          {editor.isActive("link") ? (
            <button
              type="button"
              className={styles.contextButton}
              onClick={() => {
                chain().extendMarkRange("link").unsetLink().run();
                setLinkOpen(false);
              }}
            >
              Kaldır
            </button>
          ) : null}
          <button type="button" className={styles.contextButton} aria-label="Kapat" onClick={() => setLinkOpen(false)}>
            <X size={15} />
          </button>
          {urlError ? (
            <p className={styles.contextError} role="alert">
              {urlError}
            </p>
          ) : null}
        </form>
      ) : null}

      {inTable ? (
        <div className={styles.context} role="group" aria-label="Tablo araçları">
          <button type="button" className={styles.contextButton} onClick={() => chain().addRowAfter().run()}>
            <Rows3 size={14} aria-hidden="true" />
            Satır ekle
          </button>
          <button type="button" className={styles.contextButton} onClick={() => chain().addColumnAfter().run()}>
            <Columns3 size={14} aria-hidden="true" />
            Sütun ekle
          </button>
          <button type="button" className={styles.contextButton} onClick={() => chain().deleteRow().run()}>
            Satırı sil
          </button>
          <button type="button" className={styles.contextButton} onClick={() => chain().deleteColumn().run()}>
            Sütunu sil
          </button>
          <button type="button" className={styles.contextButton} onClick={() => chain().toggleHeaderRow().run()}>
            Başlık satırı
          </button>
          <button type="button" className={styles.contextButton} data-danger="true" onClick={() => chain().deleteTable().run()}>
            <Trash2 size={14} aria-hidden="true" />
            Tabloyu sil
          </button>
        </div>
      ) : null}

      <EditorContent editor={editor} className={styles.content} />
    </div>
  );
}
