// Yönetim panelinin tamamında kullanılan hafif bildirim kanalı.
// toast("Kaydedildi") ya da toast("Hata", "error") çağrılır; <Toaster /> gösterir.
const EVENT = "blog-admin-toast";

export function toast(message, type = "success") {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, type } }));
}

export function onToast(listener) {
  const handler = (event) => listener(event.detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
