"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PALETTE } from "@/lib/blog/blocks/palette";
import { TEMPLATES } from "@/lib/blog/blocks/templates";
import { slugify } from "@/lib/blog/slug";
import { PALETTE_ICONS } from "./blockIcons";
import styles from "./builder.module.css";

// Sol panel: blok kartları ve hazır şablonlar. Kartlar tıklanarak ya da
// sürüklenerek eklenir; klavyeyle her kart bir düğmedir.
export default function BlockLibrary({ onAdd, onDragStart, onDragEnd, onTemplate, insertHint }) {
  const [tab, setTab] = useState("blocks");
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const term = slugify(query).replace(/-/g, " ");
    if (!term) return PALETTE;
    return PALETTE.map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        `${slugify(item.label).replace(/-/g, " ")} ${item.keywords}`.includes(term)
      ),
    })).filter((group) => group.items.length > 0);
  }, [query]);

  return (
    <div className={styles.library}>
      <div className={styles.tabs} role="tablist" aria-label="Kütüphane">
        <button type="button" role="tab" id="lib-tab-blocks" aria-controls="lib-panel-blocks" aria-selected={tab === "blocks"} className={styles.tab} onClick={() => setTab("blocks")}>
          Bloklar
        </button>
        <button type="button" role="tab" id="lib-tab-templates" aria-controls="lib-panel-templates" aria-selected={tab === "templates"} className={styles.tab} onClick={() => setTab("templates")}>
          Şablonlar
        </button>
      </div>

      <div id="lib-panel-blocks" role="tabpanel" aria-labelledby="lib-tab-blocks" hidden={tab !== "blocks"} className={styles.panelScroll}>
        <div className={styles.search}>
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder="Blok ara…"
            aria-label="Blok ara"
            className={styles.input}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {insertHint ? <p className={styles.insertHint}>{insertHint}</p> : null}

        {groups.length === 0 ? (
          <p className={styles.muted}>“{query}” ile eşleşen blok yok.</p>
        ) : (
          groups.map((group) => (
            <section key={group.title} aria-label={group.title}>
              <h2 className={styles.groupTitle}>{group.title}</h2>
              <div className={styles.cards}>
                {group.items.map((item) => {
                  const Icon = PALETTE_ICONS[item.icon];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={styles.blockCard}
                      draggable
                      data-palette={item.key}
                      title={`${item.label}: tıklayarak ekleyin ya da tuvale sürükleyin`}
                      onClick={() => onAdd(item.key)}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData("text/plain", item.label);
                        onDragStart({ kind: "new", key: item.key });
                      }}
                      onDragEnd={onDragEnd}
                    >
                      <span className={styles.blockCardIcon} aria-hidden="true">
                        <Icon size={24} strokeWidth={1.6} />
                      </span>
                      <span className={styles.blockCardLabel}>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      <div id="lib-panel-templates" role="tabpanel" aria-labelledby="lib-tab-templates" hidden={tab !== "templates"} className={styles.panelScroll}>
        <p className={styles.muted}>
          Şablon, düzenlenebilir gerçek bloklar ekler. Mevcut içeriğiniz siz onaylamadan silinmez.
        </p>
        <div className={styles.templates}>
          {TEMPLATES.map((template) => (
            <button key={template.key} type="button" className={styles.templateCard} data-template={template.key} onClick={() => onTemplate(template)}>
              <span className={styles.templatePreview} aria-hidden="true">
                {template.preview.map((type, index) => (
                  <span key={index} data-kind={type} />
                ))}
              </span>
              <span className={styles.templateText}>
                <strong>{template.label}</strong>
                <span>{template.description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
