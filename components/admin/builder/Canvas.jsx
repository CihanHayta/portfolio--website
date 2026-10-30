"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ArrowUpDown, ChevronDown, ChevronUp, Copy, GripVertical, ImagePlus, Plus, Settings2, Trash2 } from "lucide-react";
import { BLOCKS } from "@/lib/blog/blocks/registry";
import { PALETTE_ITEMS } from "@/lib/blog/blocks/palette";
import { Block, blockStyles } from "@/components/blog/Blocks";
import { blockSummary } from "@/lib/blog/blocks/arrange";
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
  onPointerDrag,
  positions = null,
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
      data-node-count={block.type === "text" ? (block.props.doc?.content?.length ?? 0) : undefined}
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
          {/* Fare, dokunmatik ve kalemle sürükleme (Pointer Events); klavye için "Konuma taşı". */}
          <span
            className={styles.frameTool}
            role="img"
            aria-label="Sürükleyerek taşı"
            title="Sürükleyerek taşı"
            data-drag-handle
            onPointerDown={(event) => onPointerDrag?.(event, { kind: "move", id: block.id }, label)}
          >
            <GripVertical size={16} />
          </span>
          <button type="button" className={styles.frameTool} aria-label="Yukarı taşı" title="Yukarı taşı" disabled={index === 0} onClick={() => onMove(block.id, index - 1)}>
            <ChevronUp size={16} />
          </button>
          <button type="button" className={styles.frameTool} aria-label="Aşağı taşı" title="Aşağı taşı" disabled={index === count - 1} onClick={() => onMove(block.id, index + 2)}>
            <ChevronDown size={16} />
          </button>
          {positions?.length ? (
            <label className={styles.frameTool} data-move-to title="Konuma taşı">
              <ArrowUpDown size={16} aria-hidden="true" />
              <select
                aria-label="Konuma taşı"
                value=""
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => {
                  if (event.target.value !== "") onMove(block.id, Number(event.target.value));
                }}
              >
                <option value="" disabled>Konuma taşı…</option>
                {positions.map((item) => (
                  <option key={item.index} value={item.index}>{item.label}</option>
                ))}
              </select>
            </label>
          ) : null}
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
  theme = "light", // yazının teması: tuval yayımlanmış sayfayla aynı tonda görünür
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
  onPointerDrag,
  paperRef = null,
  visualMarks = null, // { başlık bloğu kimliği: [öneri amacı, …] } — AI Görsel Stüdyosu planı
  onOpenVisuals = null,
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

  // Seçili blok için "Konuma taşı" listesi (etkisiz konumlar hariç).
  const selectedIndex = blocks.findIndex((block) => block.id === selectedId);
  const positions = useMemo(() => {
    if (selectedIndex === -1 || blocks.length < 2) return null;
    const short = (block, index) => `${index + 1}. ${BLOCKS[block.type]?.label ?? "Blok"}${blockSummary(block) ? `: ${blockSummary(block).slice(0, 40)}` : ""}`;
    return [
      ...(selectedIndex === 0 ? [] : [{ index: 0, label: "En başa" }]),
      ...blocks.flatMap((block, index) => (index === selectedIndex || index === selectedIndex - 1 ? [] : [{ index: index + 1, label: `${short(block, index)} — sonrasına` }])),
    ];
  }, [blocks, selectedIndex]);

  const zone = (index) =>
    preview ? null : (
      <DropZone index={index} dragging={dragging} active={insertAt === index} onDropAt={onDropAt} onPick={onPickInsert} />
    );

  return (
    <div className={styles.canvas} data-device={device} onClick={() => onSelect(null)}>
      <article ref={paperRef} className={styles.paper} data-preview={preview} data-tone={theme} aria-label="Yazı tuvali">
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
                onPointerDrag={onPointerDrag}
                positions={selectedId === block.id ? positions : null}
              />
              {!preview && visualMarks?.[block.id] ? (
                <button type="button" className={styles.visualMark} onClick={onOpenVisuals}>
                  <ImagePlus size={15} aria-hidden="true" />
                  <span>Önerilen görsel: {visualMarks[block.id].join(" · ")}</span>
                </button>
              ) : null}
            </div>
          ))}
          {blocks.length > 0 ? zone(blocks.length) : null}
        </div>
      </article>
    </div>
  );
}
