import Image from "next/image";
import { collectHeadings, isMediaUrl, safeHref, youtubeId } from "@/lib/blog/content";
import styles from "./PostContent.module.css";

// Tiptap JSON belgesini doğrudan React öğelerine çevirir. HTML dizgesi hiç
// üretilmediği için içerikten betik ya da ham HTML çalıştırılamaz.

const MARK_TAGS = { bold: "strong", italic: "em", underline: "u", strike: "s", code: "code" };

function renderText(node, key) {
  let element = node.text;
  for (const mark of node.marks ?? []) {
    if (mark.type === "link") {
      const href = safeHref(mark.attrs?.href);
      if (!href) continue;
      const external = /^https?:\/\//i.test(href);
      element = (
        <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
          {element}
        </a>
      );
    } else if (MARK_TAGS[mark.type]) {
      const Tag = MARK_TAGS[mark.type];
      element = <Tag>{element}</Tag>;
    }
  }
  return <span key={key}>{element}</span>;
}

function renderChildren(node, ctx) {
  return (node.content ?? []).map((child, index) => renderNode(child, index, ctx));
}

function renderNode(node, key, ctx) {
  switch (node.type) {
    case "text":
      return renderText(node, key);
    case "paragraph":
      return <p key={key}>{renderChildren(node, ctx)}</p>;
    case "heading": {
      // Sayfanın tek <h1>'i yazı başlığıdır; içerik başlıkları bir seviye kayar.
      const level = Math.min(Math.max(node.attrs?.level ?? 2, 1), 3);
      const Tag = `h${level + 1}`;
      return (
        <Tag key={key} id={ctx.headingIds.get(node)} className={styles[`level${level}`]}>
          {renderChildren(node, ctx)}
        </Tag>
      );
    }
    case "bulletList":
      return <ul key={key}>{renderChildren(node, ctx)}</ul>;
    case "orderedList":
      return (
        <ol key={key} start={node.attrs?.start ?? 1}>
          {renderChildren(node, ctx)}
        </ol>
      );
    case "listItem":
      return <li key={key}>{renderChildren(node, ctx)}</li>;
    case "blockquote":
      return <blockquote key={key}>{renderChildren(node, ctx)}</blockquote>;
    case "codeBlock":
      return (
        <pre key={key} tabIndex={0}>
          <code>{(node.content ?? []).map((child) => child.text ?? "").join("")}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr key={key} />;
    case "hardBreak":
      return <br key={key} />;
    case "table":
      return (
        <div key={key} className={styles.tableScroll} tabIndex={0} role="region" aria-label="Tablo">
          <table>
            <tbody>{renderChildren(node, ctx)}</tbody>
          </table>
        </div>
      );
    case "tableRow":
      return <tr key={key}>{renderChildren(node, ctx)}</tr>;
    case "tableHeader":
    case "tableCell": {
      const Tag = node.type === "tableHeader" ? "th" : "td";
      return (
        <Tag key={key} colSpan={node.attrs?.colspan ?? 1} rowSpan={node.attrs?.rowspan ?? 1}>
          {renderChildren(node, ctx)}
        </Tag>
      );
    }
    case "image": {
      const { src, alt, caption, width, height, size = "full", align = "center" } = node.attrs ?? {};
      if (!isMediaUrl(src)) return null;
      return (
        <figure key={key} className={styles.figure} data-size={size} data-align={align}>
          <Image
            src={src}
            alt={alt ?? ""}
            width={width ?? 1200}
            height={height ?? 675}
            sizes="(max-width: 800px) 100vw, 760px"
          />
          {caption ? <figcaption>{caption}</figcaption> : null}
        </figure>
      );
    }
    case "youtube": {
      const id = youtubeId(node.attrs?.src);
      if (!id) return null;
      return (
        <div key={key} className={styles.video}>
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}`}
            title="YouTube videosu"
            loading="lazy"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      );
    }
    default:
      return null;
  }
}

export default function PostContent({ doc, className = "" }) {
  const headingIds = new Map(collectHeadings(doc).map(({ node, id }) => [node, id]));
  return (
    // data-doc-root: editörde paragraflar arasına bırakma noktaları bu kökten ölçülür.
    <div className={`${styles.prose} ${className}`} data-doc-root="">{renderChildren(doc ?? {}, { headingIds })}</div>
  );
}
