"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ChevronDown, ChevronUp, Copy, GripVertical, Plus, Settings2, Trash2 } from "lucide-react";
import { BLOCKS } from "@/lib/blog/blocks/registry";
import { PALETTE_ITEMS } from "@/lib/blog/blocks/palette";
import { Block, blockStyles } from "@/components/blog/Blocks";
import { TYPE_ICONS } from "./blockIcons";
import { RichTextField } from "./fields";
import styles from "./builder.module.css";

function DropZone({ index, dragging, active, onDropAt, onPick }) {
  const [over, setOver] = useState(false);

  return (
    <div
      className={styles.dropZone}
      data-dragging={dragging}
      data-over={over}
      data-active={active}
      data-drop-index={index}
      onDragOver={(event) => {
        if (!dragging) return;
        // Efekt burada zorlanmaz: paletten gelen sürükleme "copy", blok taşıma
        // "move" bildirir ve uyuşmayan efekt bırakmayı iptal ettirir.
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        onDropAt(index);
      }}
    >
      {dragging ? (
        <span className={styles.dropLabel}>Buraya bırak</span>
      ) : (
        <button
          type="button"
          className={styles.insertButton}
          aria-label={active ? "Ekleme konumu seçili" : "Buraya blok ekle"}
          aria-pressed={active}
          title="Buraya blok ekle"
          onClick={() => onPick(active ? null : index)}
        >
          <Plus size={14} />
        </button>
      )}
    </div>
  );
}

const BlockFrame = memo(function BlockFrame({
  block,
  index,
  count,
  selected,
  preview,
  ctx,
  onSelect,
  onChangeProps,
  onMove,
  onDuplicate,
  onRemove,
  onOpenSettings,
  onDragStart,
  onDragEnd,
}) {
  const label = BLOCKS[block.type]?.label ?? "Bilinmeyen blok";
  const Icon = TYPE_ICONS[block.type];
  const known = Boolean(BLOCKS[block.type]);

  const body = !known ? (
    <p className={styles.unknown}>
      Bu blok türü (“{block.type}”) bu sürümde tanınmıyor. Yayında gösterilmez; isterseniz silebilirsiniz.
    </p>
  ) : selected && !preview && block.type === "text" ? (
    // Paragraf bloğu seçiliyken doğrudan tuval üzerinde yazılır.
    <div style={{ textAlign: block.props.align }}>
      <RichTextField
        autoFocus
        value={block.props.doc}
        label="Paragraf metni"
        onChange={(doc) => onChangeProps(block.id, { doc }, "doc")}
      />
    </div>
  ) : (
    <Block block={block} ctx={ctx} />
  );

  if (preview) {
    return (
      <div className={blockStyles.block} data-spacing={block.props.spacing}>
        {body}
      </div>
    );
  }

  return (
    <div
      className={`${blockStyles.block} ${styles.frame}`}
      data-spacing={block.props.spacing}
      data-selected={selected}
      data-block-id={block.id}
      data-block-type={block.type}
      role="group"
      aria-label={`${label} bloğu${selected ? " (seçili)" : ""}`}
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(block.id);
      }}
      onFocus={(event) => {
        if (event.target === event.currentTarget) onSelect(block.id);
      }}
    >
      <span className={styles.frameLabel}>
        {Icon ? <Icon size={12} aria-hidden="true" /> : null}
        {label}
      </span>

      {selected ? (
        <div className={styles.frameTools} role="toolbar" aria-label={`${label} bloğu araçları`}>
          <span
            className={styles.frameTool}
            draggable
            role="img"
            aria-label="Sürükleyerek taşı"
            title="Sürükleyerek taşı"
            data-drag-handle
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", label);
              const frame = event.currentTarget.closest("[data-block-id]");
              if (frame) event.dataTransfer.setDragImage(frame, 24, 24);
              onDragStart({ kind: "move", id: block.id });
            }}
            onDragEnd={onDragEnd}
          >
            <GripVertical size={16} />
          </span>
          <button type="button" className={styles.frameTool} aria-label="Yukarı taşı" title="Yukarı taşı" disabled={index === 0} onClick={() => onMove(block.id, index - 1)}>
            <ChevronUp size={16} />
          </button>
          <button type="button" className={styles.frameTool} aria-label="Aşağı taşı" title="Aşağı taşı" disabled={index === count - 1} onClick={() => onMove(block.id, index + 2)}>
            <ChevronDown size={16} />
          </button>
          <button type="button" className={styles.frameTool} aria-label="Çoğalt" title="Çoğalt" onClick={() => onDuplicate(block.id)}>
            <Copy size={16} />
          </button>
          <button type="button" className={styles.frameTool} aria-label="Blok ayarları" title="Blok ayarları" onClick={() => onOpenSettings(block.id)}>
            <Settings2 size={16} />
          </button>
          <button type="button" className={styles.frameTool} data-danger="true" aria-label="Sil" title="Sil" onClick={() => onRemove(block.id)}>
            <Trash2 size={16} />
          </button>
        </div>
      ) : null}

      {body}
    </div>
  );
});

export default function Canvas({
  blocks,
  headings,
  title,
  excerpt,
  cover,
  coverAlt,
  device,
  preview,
  selectedId,
  dragging,
  insertAt,
  onTitleChange,
  onSelect,
  onChangeProps,
  onMove,
  onDuplicate,
  onRemove,
  onOpenSettings,
  onOpenPageSettings,
  onDropAt,
  onPickInsert,
  onQuickAdd,
  onDragStart,
  onDragEnd,
}) {
  // Başlıklar değişmedikçe aynı bağlam nesnesi kullanılır; böylece bir blokta
  // yazarken diğer bloklar yeniden çizilmez.
  const headingKey = JSON.stringify(headings);
  const ctx = useMemo(() => {
    const list = JSON.parse(headingKey);
    return {
      headings: list,
      headingIds: new Map(list.filter((item) => item.blockId).map((item) => [item.blockId, item.id])),
      editing: !preview,
    };
  }, [headingKey, preview]);
  // Başlık alanı içeriği kadar uzar (satır kaydırma yok).
  const titleRef = useRef(null);
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    // Genişlik değişince (pencere, cihaz önizlemesi) satır sayısı da değişir.
    const observer = new ResizeObserver(fit);
    observer.observe(el.parentElement);
    return () => observer.disconnect();
  }, [title, preview]);

  const zone = (index) =>
    preview ? null : (
      <DropZone index={index} dragging={dragging} active={insertAt === index} onDropAt={onDropAt} onPick={onPickInsert} />
    );

  return (
    <div className={styles.canvas} data-device={device} onClick={() => onSelect(null)}>
      <article className={styles.paper} data-preview={preview} aria-label="Yazı tuvali">
        <header className={styles.paperHead}>
          {preview ? (
            <h1 className={styles.titleInput}>{title || "Başlıksız yazı"}</h1>
          ) : (
            <textarea
              ref={titleRef}
              className={styles.titleInput}
              value={title}
              rows={1}
              maxLength={160}
              placeholder="Yazı başlığı…"
              aria-label="Yazı başlığı"
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => onTitleChange(event.target.value.replace(/\n/g, " "))}
            />
          )}
          {excerpt ? (
            <p className={styles.excerpt}>{excerpt}</p>
          ) : preview ? null : (
            <button type="button" className={styles.excerptEmpty} onClick={(event) => { event.stopPropagation(); onOpenPageSettings(); }}>
              Özet eklemek için Sayfa Ayarları’nı açın
            </button>
          )}
          {cover ? (
            <div className={styles.cover}>
              <Image src={cover.url} alt={coverAlt} width={cover.width ?? 1200} height={cover.height ?? 630} sizes="820px" />
            </div>
          ) : null}
        </header>

        <div className={blockStyles.blocks}>
          {blocks.length === 0 && !preview ? (
            <div
              className={styles.emptyCanvas}
              data-dragging={dragging}
              data-drop-index={0}
              onDragOver={(event) => dragging && event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                onDropAt(0);
              }}
            >
              <p className={styles.emptyTitle}>İlk bloğu ekleyin</p>
              <p className={styles.muted}>
                Soldaki kütüphaneden bir bloğa tıklayın, buraya sürükleyin ya da Şablonlar sekmesinden hazır bir düzenle başlayın.
              </p>
              <div className={styles.quickAdd}>
                {["text", "heading", "image"].map((key) => (
                  <button key={key} type="button" className={styles.btnSmall} onClick={(event) => { event.stopPropagation(); onQuickAdd(key); }}>
                    <Plus size={14} aria-hidden="true" />
                    {PALETTE_ITEMS[key].label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {blocks.map((block, index) => (
            <div key={block.id}>
              {zone(index)}
              <BlockFrame
                block={block}
                index={index}
                count={blocks.length}
                selected={selectedId === block.id}
                preview={preview}
                ctx={ctx}
                onSelect={onSelect}
                onChangeProps={onChangeProps}
                onMove={onMove}
                onDuplicate={onDuplicate}
                onRemove={onRemove}
                onOpenSettings={onOpenSettings}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              />
            </div>
          ))}
          {blocks.length > 0 ? zone(blocks.length) : null}
        </div>
      </article>
    </div>
  );
}
