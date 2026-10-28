"use client";

import { useEffect, useLayoutEffect } from "react";

// Modal <dialog> yönetimi. `open` true iken showModal, false iken close çağrılır.
// Bileşen DOM'dan kaldırılırken pencere ÖNCE close() ile kapatılır: açık bir modal
// pencereyi kapatmadan söküp atmak bazı tarayıcılarda (WebKit/Safari) sayfanın geri
// kalanını tıklanamaz bırakabilir. Yerleşim etkisinin temizliği, React düğümü
// sökmeden önce çalışır; pencere o anda hâlâ belgededir.
//
// `fitViewport`: telefonda tam ekran pencereler görünür alana (visualViewport)
// uydurulur. iOS'ta klavye açılınca pencerenin alt kısmı ve düğmeleri klavyenin
// altında kalmaz; klavye kapanınca kayma ya da boş (beyaz) alan kalmaz.
export function useModalDialog(ref, open = true, { fitViewport = false } = {}) {
  useEffect(() => {
    const viewport = typeof window === "undefined" ? null : window.visualViewport;
    const dialog = ref.current;
    if (!fitViewport || !viewport || !dialog) return;
    const update = () => {
      dialog.style.setProperty("--vvh", `${Math.round(viewport.height)}px`);
      dialog.style.setProperty("--vvtop", `${Math.max(0, Math.round(viewport.offsetTop))}px`);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [fitViewport, ref]);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open, ref]);

  useLayoutEffect(() => {
    const dialog = ref.current;
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, [ref]);
}
