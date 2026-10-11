"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import {
  ArrowDown,
  ArrowUp,
  Bold,
  Code,
  Columns3,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Minus,
  Redo2,
  Rows3,
  SquareCode,
  SquarePlay,
  Strikethrough,
  Table as TableIcon,
  TextQuote,
  Trash2,
  Underline,
  Undo2,
  X,
} from "lucide-react";
import { sanitizeDoc, safeHref, youtubeId } from "@/lib/blog/content";
import PostContent from "@/components/blog/PostContent";
import proseStyles from "@/components/blog/PostContent.module.css";
import { createExtensions, moveBlock, removeBlock } from "./editorExtensions";
import MediaPickerDialog from "./MediaPickerDialog";
import styles from "./RichTextEditor.module.css";

const BLOCK_OPTIONS = [
  { value: "paragraph", label: "Paragraf" },
  { value: "h1", label: "Başlık 1" },
  { value: "h2", label: "Başlık 2" },
  { value: "h3", label: "Başlık 3" },
];

const IMAGE_SIZES = [
  { value: "sm", label: "Küçük" },
  { value: "md", label: "Orta" },
  { value: "lg", label: "Büyük" },
  { value: "full", label: "Tam genişlik" },
];

const IMAGE_ALIGNS = [
  { value: "left", label: "Sola" },
  { value: "center", label: "Ortala" },
  { value: "right", label: "Sağa" },
];

function ToolButton({ label, shortcut, active = false, disabled = false, onClick, children }) {
  return (
    <button
      type="button"
      className={styles.tool}
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      // Düğmeye basmak editördeki seçimi bozmasın.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({ initialContent, onChange }) {
  const [tab, setTab] = useState("write");
  const [panel, setPanel] = useState(null); // "link" | "video" | null
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [picker, setPicker] = useState(null); // "insert" | "replace" | null
  const [fullscreen, setFullscreen] = useState(false);

  // Eklentiler bir kez kurulur; her render'da yeniden üretilirse editör
  // seçeneklerini gereksiz yere sıfırlar.
  const [extensions] = useState(createExtensions);

  const editor = useEditor({
    extensions,
    content: initialContent,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: `${proseStyles.prose} ${styles.editable}`,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Yazı içeriği",
      },
    },
    onUpdate: ({ editor: instance }) => onChange(instance.getJSON()),
  });

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [fullscreen]);

  if (!editor) {
    return <div className={styles.loading} role="status">Editör yükleniyor…</div>;
  }

  const chain = () => editor.chain().focus();
  const blockValue = editor.isActive("heading")
    ? `h${editor.getAttributes("heading").level}`
    : "paragraph";
  const imageAttrs = editor.isActive("image") ? editor.getAttributes("image") : null;
  const inTable = editor.isActive("table");

  const openPanel = (name) => {
    setUrlError("");
    setUrl(name === "link" ? (editor.getAttributes("link").href ?? "") : "");
    setPanel((current) => (current === name ? null : name));
  };

  const applyLink = (event) => {
    event.preventDefault();
    const raw = url.trim();
    const href = safeHref(/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(raw) ? `https://${raw}` : raw);
    if (!href) return setUrlError("Geçerli bir adres yaz (https://…, /sayfa ya da mailto:…).");
    // Bağlantıdan sonra imleç metnin sonuna alınır; seçim açık kalırsa bir
    // sonraki tuş bağlantılı metnin üzerine yazar.
    editor.chain().extendMarkRange("link").setLink({ href }).run();
    editor.chain().focus().setTextSelection(editor.state.selection.to).run();
    setPanel(null);
  };

  const applyVideo = (event) => {
    event.preventDefault();
    if (!youtubeId(url)) return setUrlError("Geçerli bir YouTube bağlantısı yapıştır.");
    chain().setYoutubeVideo({ src: url.trim() }).run();
    setPanel(null);
  };

  const pickImage = (media) => {
    const attrs = {
      src: media.url,
      alt: media.alt_text ?? "",
      width: media.width,
      height: media.height,
    };
    if (picker === "replace") editor.chain().updateAttributes("image", attrs).run();
    else chain().insertContent({ type: "image", attrs: { ...attrs, caption: media.caption ?? "" } }).run();
    setPicker(null);
  };

  const updateImage = (attrs) => editor.chain().updateAttributes("image", attrs).run();

  return (
    <div className={styles.wrapper} data-fullscreen={fullscreen}>
      <div className={styles.tabs} role="tablist" aria-label="Editör görünümü">
        <button
          type="button"
          role="tab"
          id="tab-write"
          aria-selected={tab === "write"}
          aria-controls="panel-write"
          className={styles.tab}
          onClick={() => setTab("write")}
        >
          Yaz
        </button>
        <button
          type="button"
          role="tab"
          id="tab-preview"
          aria-selected={tab === "preview"}
          aria-controls="panel-preview"
          className={styles.tab}
          onClick={() => setTab("preview")}
        >
          Önizleme
        </button>
      </div>

      <div
        id="panel-write"
        role="tabpanel"
        aria-labelledby="tab-write"
        hidden={tab !== "write"}
        className={styles.frame}
      >
        <div className={styles.toolbar} role="toolbar" aria-label="Biçimlendirme araçları">
          <select
            className={styles.blockSelect}
            aria-label="Blok türü"
            value={blockValue}
            onChange={(event) => {
              const { value } = event.target;
              if (value === "paragraph") chain().setParagraph().run();
              else chain().setHeading({ level: Number(value.slice(1)) }).run();
            }}
          >
            {BLOCK_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <span className={styles.divider} />
          <ToolButton label="Kalın" shortcut="⌘B" active={editor.isActive("bold")} onClick={() => chain().toggleBold().run()}>
            <Bold size={18} />
          </ToolButton>
          <ToolButton label="İtalik" shortcut="⌘I" active={editor.isActive("italic")} onClick={() => chain().toggleItalic().run()}>
            <Italic size={18} />
          </ToolButton>
          <ToolButton label="Altı çizili" shortcut="⌘U" active={editor.isActive("underline")} onClick={() => chain().toggleUnderline().run()}>
            <Underline size={18} />
          </ToolButton>
          <ToolButton label="Üstü çizili" shortcut="⌘⇧S" active={editor.isActive("strike")} onClick={() => chain().toggleStrike().run()}>
            <Strikethrough size={18} />
          </ToolButton>
          <ToolButton label="Bağlantı" active={editor.isActive("link") || panel === "link"} onClick={() => openPanel("link")}>
            <LinkIcon size={18} />
          </ToolButton>

          <span className={styles.divider} />
          <ToolButton label="Madde işaretli liste" shortcut="⌘⇧8" active={editor.isActive("bulletList")} onClick={() => chain().toggleBulletList().run()}>
            <List size={18} />
          </ToolButton>
          <ToolButton label="Numaralı liste" shortcut="⌘⇧7" active={editor.isActive("orderedList")} onClick={() => chain().toggleOrderedList().run()}>
            <ListOrdered size={18} />
          </ToolButton>

          <span className={styles.divider} />
          <ToolButton label="Alıntı" shortcut="⌘⇧B" active={editor.isActive("blockquote")} onClick={() => chain().toggleBlockquote().run()}>
            <TextQuote size={18} />
          </ToolButton>
          <ToolButton label="Satır içi kod" shortcut="⌘E" active={editor.isActive("code")} onClick={() => chain().toggleCode().run()}>
            <Code size={18} />
          </ToolButton>
          <ToolButton label="Kod bloğu" shortcut="⌘⌥C" active={editor.isActive("codeBlock")} onClick={() => chain().toggleCodeBlock().run()}>
            <SquareCode size={18} />
          </ToolButton>

          <span className={styles.divider} />
          <ToolButton label="Görsel ekle" onClick={() => setPicker("insert")}>
            <ImageIcon size={18} />
          </ToolButton>
          <ToolButton label="YouTube videosu ekle" active={panel === "video"} onClick={() => openPanel("video")}>
            <SquarePlay size={18} />
          </ToolButton>
          <ToolButton
            label="Tablo ekle"
            disabled={inTable}
            onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          >
            <TableIcon size={18} />
          </ToolButton>
          <ToolButton label="Yatay ayırıcı" onClick={() => chain().setHorizontalRule().run()}>
            <Minus size={18} />
          </ToolButton>

          <span className={styles.divider} />
          <ToolButton label="Bloğu yukarı taşı" onClick={() => moveBlock(editor, -1)}>
            <ArrowUp size={18} />
          </ToolButton>
          <ToolButton label="Bloğu aşağı taşı" onClick={() => moveBlock(editor, 1)}>
            <ArrowDown size={18} />
          </ToolButton>
          <ToolButton label="Bloğu sil" onClick={() => removeBlock(editor)}>
            <Trash2 size={18} />
          </ToolButton>

          <span className={styles.divider} />
          <ToolButton label="Geri al" shortcut="⌘Z" disabled={!editor.can().undo()} onClick={() => chain().undo().run()}>
            <Undo2 size={18} />
          </ToolButton>
          <ToolButton label="Yinele" shortcut="⌘⇧Z" disabled={!editor.can().redo()} onClick={() => chain().redo().run()}>
            <Redo2 size={18} />
          </ToolButton>

          <span className={styles.spacer} />
          <ToolButton
            label={fullscreen ? "Tam ekrandan çık" : "Tam ekran"}
            active={fullscreen}
            onClick={() => setFullscreen((value) => !value)}
          >
            {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </ToolButton>
        </div>

        {panel ? (
          <form className={styles.context} onSubmit={panel === "link" ? applyLink : applyVideo}>
            <label className={styles.contextField}>
              <span>{panel === "link" ? "Bağlantı adresi" : "YouTube bağlantısı"}</span>
              <input
                type="text"
                inputMode="url"
                autoFocus
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setUrlError("");
                }}
                placeholder={panel === "link" ? "https://… ya da /blog/yazi" : "https://www.youtube.com/watch?v=…"}
                aria-invalid={Boolean(urlError)}
                aria-describedby={urlError ? "editor-url-error" : undefined}
              />
            </label>
            <button type="submit" className={styles.contextPrimary}>
              {panel === "link" ? "Uygula" : "Ekle"}
            </button>
            {panel === "link" && editor.isActive("link") ? (
              <button
                type="button"
                className={styles.contextButton}
                onClick={() => {
                  chain().extendMarkRange("link").unsetLink().run();
                  setPanel(null);
                }}
              >
                Bağlantıyı kaldır
              </button>
            ) : null}
            <button type="button" className={styles.contextIcon} aria-label="Kapat" onClick={() => setPanel(null)}>
              <X size={16} />
            </button>
            {urlError ? (
              <p id="editor-url-error" className={styles.contextError} role="alert">
                {urlError}
              </p>
            ) : null}
          </form>
        ) : null}

        {imageAttrs ? (
          <div className={styles.context} role="group" aria-label="Görsel ayarları">
            <label className={styles.contextField}>
              <span>Alt metin</span>
              <input
                type="text"
                value={imageAttrs.alt ?? ""}
                maxLength={300}
                placeholder="Görseli göremeyenler için kısa tarif"
                onChange={(event) => updateImage({ alt: event.target.value })}
              />
            </label>
            <label className={styles.contextField}>
              <span>Açıklama</span>
              <input
                type="text"
                value={imageAttrs.caption ?? ""}
                maxLength={300}
                placeholder="Görselin altında görünür (isteğe bağlı)"
                onChange={(event) => updateImage({ caption: event.target.value })}
              />
            </label>
            <label className={styles.contextSelect}>
              <span>Boyut</span>
              <select value={imageAttrs.size} onChange={(event) => updateImage({ size: event.target.value })}>
                {IMAGE_SIZES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.contextSelect}>
              <span>Hizalama</span>
              <select value={imageAttrs.align} onChange={(event) => updateImage({ align: event.target.value })}>
                {IMAGE_ALIGNS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className={styles.contextButton} onClick={() => setPicker("replace")}>
              Değiştir
            </button>
            <button type="button" className={styles.contextButton} data-danger="true" onClick={() => chain().deleteSelection().run()}>
              Kaldır
            </button>
          </div>
        ) : null}

        {inTable ? (
          <div className={styles.context} role="group" aria-label="Tablo araçları">
            <button type="button" className={styles.contextButton} onClick={() => chain().addRowAfter().run()}>
              <Rows3 size={15} aria-hidden="true" />
              Satır ekle
            </button>
            <button type="button" className={styles.contextButton} onClick={() => chain().addColumnAfter().run()}>
              <Columns3 size={15} aria-hidden="true" />
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
              Tabloyu sil
            </button>
          </div>
        ) : null}

        <EditorContent editor={editor} className={styles.content} />
      </div>

      <div
        id="panel-preview"
        role="tabpanel"
        aria-labelledby="tab-preview"
        hidden={tab !== "preview"}
        className={`${styles.frame} ${styles.preview}`}
      >
        {tab === "preview" ? <PostContent doc={sanitizeDoc(editor.getJSON())} /> : null}
      </div>

      <p className={styles.wordCount}>{editor.storage.characterCount.words()} kelime</p>

      <MediaPickerDialog
        open={picker !== null}
        title={picker === "replace" ? "Görseli değiştir" : "İçeriğe görsel ekle"}
        onSelect={pickImage}
        onClose={() => setPicker(null)}
      />
    </div>
  );
}
