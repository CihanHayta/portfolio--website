"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Sparkles, Wand2, X } from "lucide-react";
import styles from "./AiLauncher.module.css";
import { useModalDialog } from "../useModalDialog";

// Sihirbaz yalnızca kullanıldığında indirilir; editörün açılışını ağırlaştırmaz.
const AiBlogWizard = dynamic(() => import("../AiBlogWizard"), { ssr: false });
const StudioDialog = dynamic(() => import("../studio/StudioDialog"), { ssr: false });

// Sol panelin altındaki yapay zekâ girişi. Birincil yol AI Blog Stüdyosu'dur
// (URL / ekran görüntüsü / metin → şablon → görseller → taslak). Eski bağlantı
// sihirbazı "Klasik sihirbaz" olarak kalır. Hiçbir yol kendiliğinden yayımlamaz.
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
  const dialogRef = useRef(null);
  const [asking, setAsking] = useState(false);
  const [url, setUrl] = useState("");
  const [session, setSession] = useState(null); // { url, replacesContent }
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

  useModalDialog(dialogRef, asking);

  const start = (event) => {
    event.preventDefault();
    const value = url.trim();
    if (!value) return;
    setAsking(false);
    setSession({ url: value, replacesContent: hasContent() });
  };

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
      <button
        type="button"
        className={styles.classic}
        disabled={disabled}
        onClick={() => setAsking(true)}
      >
        <Sparkles size={14} aria-hidden="true" />
        Klasik sihirbaz (yalnızca bağlantı)
      </button>
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

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="ai-url-title"
        onCancel={(event) => {
          event.preventDefault();
          setAsking(false);
        }}
      >
        <form onSubmit={start}>
          <div className={styles.head}>
            <h2 id="ai-url-title" className={styles.title}>
              <Sparkles size={18} aria-hidden="true" />
              AI ile Blog Oluştur
            </h2>
            <button type="button" className={styles.close} aria-label="Kapat" onClick={() => setAsking(false)}>
              <X size={18} />
            </button>
          </div>
          <p className={styles.text}>
            Kaynak analiz edilir, önce görseller sonra özgün bir Türkçe yazı hazırlanır. Sen onaylamadan hiçbir şey
            kaydedilmez ya da yayınlanmaz.
          </p>
          <label htmlFor="ai-url" className={styles.label}>
            Kaynak yazının bağlantısı
          </label>
          <input
            id="ai-url"
            type="url"
            inputMode="url"
            required
            autoFocus
            value={url}
            maxLength={2000}
            placeholder="https://ornek.com/blog/begendigim-yazi"
            aria-describedby="ai-url-hint"
            className={styles.input}
            onChange={(event) => setUrl(event.target.value)}
          />
          <p id="ai-url-hint" className={styles.hint}>
            Herkese açık bir makale sayfası olmalı. Giriş gerektiren ya da içeriğini sonradan yükleyen sayfalar
            okunamaz.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => setAsking(false)}>
              Vazgeç
            </button>
            <button type="submit" className={styles.primary}>
              <Sparkles size={16} aria-hidden="true" />
              Analizi başlat
            </button>
          </div>
        </form>
      </dialog>

      {session ? (
        <AiBlogWizard
          url={session.url}
          postId={postId}
          categories={categories}
          siteHost={siteHost}
          replacesContent={session.replacesContent}
          onClose={() => setSession(null)}
          onApplyDraft={(generated) => {
            onApplyDraft(generated);
            setSession(null);
            setUrl("");
          }}
          onPublish={onPublish}
        />
      ) : null}
    </div>
  );
}
