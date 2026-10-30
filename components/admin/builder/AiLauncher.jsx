"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Wand2 } from "lucide-react";
import styles from "./AiLauncher.module.css";

const StudioDialog = dynamic(() => import("../studio/StudioDialog"), { ssr: false });

// Sol panelin altındaki yapay zekâ girişi: tek yol AI Blog Stüdyosu'dur
// (URL / ekran görüntüsü / metin → şablon → görseller → taslak). Eski "Klasik
// sihirbaz" 2026-10-30'da kaldırıldı (aynı işi yapan ikinci bir düğmeydi ve
// iptal edilen Pollinations görsel üretimine bağlıydı). Hiçbir yol kendiliğinden yayımlamaz.
export default function AiLauncher({
  postId,
  ensureDraft = async () => postId,
  categories,
  siteHost,
  disabled,
  hasContent,
  onApplyDraft,
  onPublish,
  templateKey = null,
  getBlocks = () => [],
  onApplyTemplateFill,
  canReplaceSilently = () => false,
  openSignal = 0,
  onOpenHandled = () => {},
}) {
  const [studio, setStudio] = useState(false);

  // Dışarıdan gelen açma isteği (mobil "AI ile Yaz" ya da ?studio ile açılış) TEK
  // SEFER işlenir ve hemen sıfırlanır. Eskiden sayaç olarak kaldığı için panel
  // önizlemeden dönünce ya da kayıt bitince stüdyo istenmeden yeniden açılıyordu.
  useEffect(() => {
    if (!openSignal || disabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStudio(true);
    onOpenHandled();
  }, [openSignal, disabled, onOpenHandled]);

  return (
    <div className={styles.launcher}>
      {onApplyTemplateFill ? (
        <>
          <button
            type="button"
            className={styles.trigger}
            disabled={disabled}
            aria-describedby="ai-studio-hint"
            onClick={() => setStudio(true)}
          >
            <Wand2 size={16} aria-hidden="true" />
            AI Blog Stüdyosu
          </button>
          <p id="ai-studio-hint" className={styles.hint}>
            {disabled
              ? "Yalnızca taslaklarda kullanılabilir."
              : "Kaynak linkini yapıştır; analiz, arşiv kontrolü ve şablon seçimi otomatik yapılır."}
          </p>
        </>
      ) : null}
      {studio ? (
        <StudioDialog
          postId={postId}
          ensureDraft={ensureDraft}
          templateKey={templateKey}
          getBlocks={getBlocks}
          canReplaceSilently={canReplaceSilently}
          onClose={() => setStudio(false)}
          onApply={(result) => {
            onApplyTemplateFill(result);
            setStudio(false);
          }}
        />
      ) : null}

    </div>
  );
}
