"use client";

// Mobilde site logosundan yönetici girişine kısayol.
// - Logoya ~0,6 sn basılı tutmak giriş ekranını açar (her telefonda).
// - Bu cihazda daha önce yönetim paneli açıldıysa (aşağıdaki işaret) normal
//   dokunuş da /admin'e gider; ziyaretçiler için logo her zaman ana sayfadır.
// - Fare ve klavye davranışı değişmez. Sunucu çiziminde bağlantı "/" kalır
//   (hydration uyuşmazlığı yok). Erişim yine proxy + requireAdmin ile korunur;
//   işaret yalnızca bir kolaylıktır, yetki vermez.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export const ADMIN_DEVICE_KEY = "persona-admin-device";
const LONG_PRESS_MS = 600;

// Yönetim paneli açıldığında çağrılır (gizli değer içermez).
export function useMarkAdminDevice() {
  useEffect(() => {
    try {
      localStorage.setItem(ADMIN_DEVICE_KEY, "1");
    } catch {
      // depolama kapalı: kısayol yalnızca uzun basmayla çalışır
    }
  }, []);
}

const isTouchLayout = () => typeof window !== "undefined" && window.matchMedia("(max-width: 1120px), (pointer: coarse)").matches;
const isAdminDevice = () => {
  try {
    return localStorage.getItem(ADMIN_DEVICE_KEY) === "1";
  } catch {
    return false;
  }
};

export function useAdminLogoShortcut() {
  const router = useRouter();
  const timer = useRef(null);
  const longPressed = useRef(false);

  useEffect(() => () => clearTimeout(timer.current), []);

  const cancel = () => clearTimeout(timer.current);
  return {
    onPointerDown(event) {
      longPressed.current = false;
      if (event.pointerType === "mouse" || !isTouchLayout()) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        longPressed.current = true;
        navigator.vibrate?.(12);
        router.push("/admin/login");
      }, LONG_PRESS_MS);
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    // Uzun basmada tarayıcının bağlantı menüsü açılmaz.
    onContextMenu(event) {
      if (isTouchLayout()) event.preventDefault();
    },
    onClick(event) {
      if (longPressed.current) {
        event.preventDefault();
        longPressed.current = false;
        return;
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      if (isTouchLayout() && isAdminDevice()) {
        event.preventDefault();
        router.push("/admin");
      }
    },
  };
}
