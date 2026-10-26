"use client";

// Mobilde site logosu yönetime gider (site sahibinin isteği): telefon/tablet
// düzeninde logo gerçek bir bağlantı olarak /admin'i gösterir; tek dokunuş yeter.
// Giriş yapılmamışsa proxy giriş ekranına çevirir, giriş yapılmışsa panel açılır.
// Masaüstünde logo ana sayfadır. Sunucu çiziminde bağlantı "/" kalır (hydration
// güvenli); ekran düzeni bilinince güncellenir. Erişim proxy + requireAdmin ile
// korunur; bu bağlantı yetki vermez. Ziyaretçiler için mobil menüde "Ana sayfa" var.

import { useSyncExternalStore } from "react";

export const MOBILE_LAYOUT_QUERY = "(max-width: 1120px), (pointer: coarse)";

function subscribe(onChange) {
  const query = window.matchMedia(MOBILE_LAYOUT_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useMobileLayout() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(MOBILE_LAYOUT_QUERY).matches, () => false);
}
