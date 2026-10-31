"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EditorContent, Mark, mergeAttributes, useEditor, useEditorState } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import {
  Bold,
  Code,
  Columns3,
  Highlighter,
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

// Seçici vurgu: önemli ifadeyi hafif zemin altı çizgisiyle öne çıkarır (yayımlanmış
// sayfada da aynı). Kalın metin otomatik turuncu yapılmaz; vurgu yazarın seçimidir.
const Accent = Mark.create({
  name: "accent",
  parseHTML() {
    return [{ tag: "mark[data-accent]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["mark", mergeAttributes(HTMLAttributes, { "data-accent": "", class: proseStyles.accent }), 0];
  },
});

// Blok içi zengin metin alanı. Başlık, görsel ve video burada yoktur; onların
// kendi blokları vardır. `compact` ayar panelindeki dar sürümdür.
function createExtensions(compact, placeholder) {
  return [
    Accent,
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
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  // Değişiklik üst bileşene her ProseMirror işleminde senkron gönderilmez:
  // aynı görev içindeki işlemler birleştirilip bir sonraki görevde tek seferde
  // iletilir. Yazarken her tuş tüm editör ağacını iç içe yeniden çizdiriyordu
  // (canlıda aralıklı React #185, ayrıca telefonda gereksiz yük). Odak kaybında ve
  // bileşen kapanırken bekleyen değişiklik hemen gönderilir; veri kaybolmaz.
  const pendingEditor = useRef(null);
  const emitTimer = useRef(null);
  const emitNow = useCallback(() => {
    clearTimeout(emitTimer.current);
    emitTimer.current = null;
    const instance = pendingEditor.current;
    pendingEditor.current = null;
    if (!instance || instance.isDestroyed) return;
    // ProseMirror nesneleri prototipsizdir; düz JSON'a çevrilerek saklanır.
    const json = JSON.parse(JSON.stringify(instance.getJSON()));
    lastEmitted.current = json;
    onChangeRef.current(json);
  }, []);
  useEffect(() => emitNow, [emitNow]);
  // Seçenekler çizimden çizime SABİT kalır: useEditor her çizimde seçenekleri
  // karşılaştırır ve fark görürse editor.setOptions() çağırır. Her tuşta değişen
  // `content` ya da her çizimde yeni oluşan `editorProps` verilirse bu her tuşta
  // olur; her işlemde yeniden çizimle birleşince React'in iç içe güncelleme
  // sınırı aşılabiliyordu (canlıda aralıklı React #185). İçerik başta bir kez
  // verilir; sonraki dış değişiklikler aşağıdaki effect ile eşitlenir.
  const [initialContent] = useState(value);
  const [initialAutofocus] = useState(autoFocus ? "end" : false);
  const editorProps = useMemo(
    () => ({
      attributes: {
        class: `${proseStyles.prose} ${styles.editable}`,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
      },
    }),
    [label]
  );

  const editor = useEditor({
    extensions,
    content: initialContent,
    immediatelyRender: false,
    // Her işlemde yeniden çizilmez; araç çubuğu yalnızca kendi durumu değişince çizilir.
    shouldRerenderOnTransaction: false,
    autofocus: initialAutofocus,
    editorProps,
    onUpdate: ({ editor: instance }) => {
      pendingEditor.current = instance;
      if (!emitTimer.current) emitTimer.current = setTimeout(emitNow, 0);
    },
    onBlur: () => emitNow(),
  });

  // Araç çubuğu durumu: yalnızca bu değerlerden biri değişince yeniden çizilir.
  const active = useEditorState({
    editor,
    selector: ({ editor: instance }) =>
      instance
        ? {
            bold: instance.isActive("bold"),
            italic: instance.isActive("italic"),
            accent: instance.isActive("accent"),
            underline: instance.isActive("underline"),
            strike: instance.isActive("strike"),
            link: instance.isActive("link"),
            bulletList: instance.isActive("bulletList"),
            orderedList: instance.isActive("orderedList"),
            blockquote: instance.isActive("blockquote"),
            code: instance.isActive("code"),
            codeBlock: instance.isActive("codeBlock"),
            table: instance.isActive("table"),
          }
        : null,
  });

  // Değer dışarıdan değiştiyse (geri al / ileri al) editör içeriği eşitlenir.
  // useLayoutEffect: karşılaştırma commit anında yapılır. Pasif effect boyamadan
  // sonra çalıştığı için araya yeni bir yazım girebiliyor ve eski çizimin değeri
  // "dış değişiklik" sanılıp editör geri sarılıyordu (hızlı yazımda karakter kaybı).
  useLayoutEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    // Dışarıdan gelen değişiklik (geri al vb.) bekleyen yazımdan önceliklidir.
    clearTimeout(emitTimer.current);
    emitTimer.current = null;
    pendingEditor.current = null;
    lastEmitted.current = value;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  if (!editor || !active) return <div className={styles.loading}>Metin alanı yükleniyor…</div>;

  const chain = () => editor.chain().focus();
  const inTable = !compact && active.table;

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
        <Tool label="Kalın" active={active.bold} onClick={() => chain().toggleBold().run()}>
          <Bold size={16} />
        </Tool>
        <Tool label="İtalik" active={active.italic} onClick={() => chain().toggleItalic().run()}>
          <Italic size={16} />
        </Tool>
        <Tool label="Vurgula" active={active.accent} onClick={() => chain().toggleMark("accent").run()}>
          <Highlighter size={16} />
        </Tool>
        {compact ? null : (
          <>
            <Tool label="Altı çizili" active={active.underline} onClick={() => chain().toggleUnderline().run()}>
              <Underline size={16} />
            </Tool>
            <Tool label="Üstü çizili" active={active.strike} onClick={() => chain().toggleStrike().run()}>
              <Strikethrough size={16} />
            </Tool>
          </>
        )}
        <Tool
          label="Bağlantı"
          active={active.link || linkOpen}
          onClick={() => {
            setUrl(editor.getAttributes("link").href ?? "");
            setUrlError("");
            setLinkOpen((open) => !open);
          }}
        >
          <LinkIcon size={16} />
        </Tool>
        <span className={styles.divider} />
        <Tool label="Madde işaretli liste" active={active.bulletList} onClick={() => chain().toggleBulletList().run()}>
          <List size={16} />
        </Tool>
        <Tool label="Numaralı liste" active={active.orderedList} onClick={() => chain().toggleOrderedList().run()}>
          <ListOrdered size={16} />
        </Tool>
        {compact ? null : (
          <>
            <span className={styles.divider} />
            <Tool label="Alıntı" active={active.blockquote} onClick={() => chain().toggleBlockquote().run()}>
              <TextQuote size={16} />
            </Tool>
            <Tool label="Satır içi kod" active={active.code} onClick={() => chain().toggleCode().run()}>
              <Code size={16} />
            </Tool>
            <Tool label="Kod bloğu" active={active.codeBlock} onClick={() => chain().toggleCodeBlock().run()}>
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
          {active.link ? (
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
