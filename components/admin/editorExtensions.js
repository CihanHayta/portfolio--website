import { StarterKit } from "@tiptap/starter-kit";
import { Image } from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { Youtube } from "@tiptap/extension-youtube";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { TextSelection } from "@tiptap/pm/state";
import proseStyles from "@/components/blog/PostContent.module.css";

// Görsel düğümü: yayın tarafındaki <figure> yapısıyla aynı çıktıyı üretir ve
// alt metin, açıklama, boyut ve hizalamayı öznitelik olarak taşır.
const BlogImage = Image.extend({
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "" },
      caption: { default: "" },
      width: { default: null },
      height: { default: null },
      size: { default: "full" },
      align: { default: "center" },
    };
  },

  // Yalnızca editörün kendi ürettiği figürler tanınır; dışarıdan yapıştırılan
  // <img> etiketleri içeriğe girmez (görseller medya kütüphanesinden eklenir).
  parseHTML() {
    return [
      {
        tag: "figure[data-blog-image]",
        getAttrs: (element) => {
          const img = element.querySelector("img");
          return {
            src: img?.getAttribute("src") ?? null,
            alt: img?.getAttribute("alt") ?? "",
            caption: element.dataset.caption ?? "",
            width: Number(element.dataset.width) || null,
            height: Number(element.dataset.height) || null,
            size: element.dataset.size ?? "full",
            align: element.dataset.align ?? "center",
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const { src, alt, caption, width, height, size, align } = node.attrs;
    return [
      "figure",
      {
        "data-blog-image": "",
        "data-caption": caption,
        "data-width": width,
        "data-height": height,
        "data-size": size,
        "data-align": align,
        class: proseStyles.figure,
      },
      ["img", { src, alt, width, height, draggable: "false" }],
      ["figcaption", {}, caption || ""],
    ];
  },
});

export function createExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        protocols: ["http", "https", "mailto", "tel"],
      },
    }),
    BlogImage,
    TableKit.configure({ table: { resizable: false } }),
    Youtube.configure({ nocookie: true }),
    Placeholder.configure({ placeholder: "Blog içeriğinizi buraya yazın…" }),
    CharacterCount,
  ];
}

// İmlecin bulunduğu üst düzey bloğu bir yukarı ya da aşağı taşır.
export function moveBlock(editor, direction) {
  const { state, view } = editor;
  const { doc, selection } = state;
  const index = selection.$from.index(0);
  const target = index + direction;
  if (target < 0 || target >= doc.childCount) return false;

  let start = 0;
  for (let i = 0; i < index; i += 1) start += doc.child(i).nodeSize;

  const node = doc.child(index);
  const neighbour = doc.child(target);
  const insertAt = direction < 0 ? start - neighbour.nodeSize : start + neighbour.nodeSize;

  const tr = state.tr.delete(start, start + node.nodeSize).insert(insertAt, node);
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + 1)));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

// İmlecin bulunduğu üst düzey bloğu siler.
export function removeBlock(editor) {
  const { state, view } = editor;
  const { doc, selection } = state;
  if (doc.childCount === 0) return false;

  const index = selection.$from.index(0);
  let start = 0;
  for (let i = 0; i < index; i += 1) start += doc.child(i).nodeSize;

  view.dispatch(state.tr.delete(start, start + doc.child(index).nodeSize).scrollIntoView());
  view.focus();
  return true;
}
