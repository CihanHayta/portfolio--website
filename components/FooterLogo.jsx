"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createMultiClick } from "@/lib/multiClick";
import { useMobileLayout } from "./adminShortcut";

// Footer logosu. Tek tıklama ana sayfaya gider (her zamanki gibi).
// Masaüstü düzeninde site sahibi için gizli kısayol: logoya hızlıca iki ya da üç kez
// tıklanırsa yönetim giriş ekranı (/admin/login) açılır. Bunun için ilk tıklama kısa
// bir süre (MULTI_CLICK_MS) bekletilir; ikinci tıklama gelmezse ana sayfaya gidilir.
// Klavye (Enter), Cmd/Ctrl/Shift ile tıklama ve telefon/tablet düzeni hiç etkilenmez.
// Kısayol yalnızca giriş ekranını açar; erişim proxy + requireAdmin ile korunur.
export default function FooterLogo({ className, children }) {
  const router = useRouter();
  const mobileLayout = useMobileLayout();
  const clicks = useRef(null);

  useEffect(() => {
    const counter = createMultiClick({
      onSingle: () => router.push("/"),
      onMulti: () => router.push("/admin/login"),
    });
    clicks.current = counter;
    return () => {
      counter.dispose();
      clicks.current = null;
    };
  }, [router]);

  const onClick = (event) => {
    if (mobileLayout || !clicks.current) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    // detail 0: klavyeyle etkinleştirme — gecikmesiz, doğal bağlantı davranışı.
    if (event.detail === 0) return;
    event.preventDefault();
    clicks.current.click();
  };

  // Çift/üçlü tıklamada logo yazısı seçili hale gelmesin.
  const onMouseDown = (event) => {
    if (!mobileLayout && event.detail > 1) event.preventDefault();
  };

  return (
    <Link href="/" className={className} onClick={onClick} onMouseDown={onMouseDown} data-footer-logo="">
      {children}
    </Link>
  );
}
