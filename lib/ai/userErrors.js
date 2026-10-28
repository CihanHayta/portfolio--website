// Kullanıcıya gösterilen hata açıklamaları. Sunucunun teknik metni (sağlayıcı
// adları, süreler) "Teknik ayrıntılar"da kalır; ekrandaki mesaj sadedir ve hatanın
// türüne uygun eylemleri önerir. Kaynak okunamaması bir yapay zekâ hatası DEĞİLDİR.
//
// Kodlar: A kaynak okunamadı · B servis yoğun/zaman aşımı · C uygun ücretsiz servis
// yok / içerik işlenmedi · D yapılandırma eksik · E kota · N bağlantı · S oturum.

const READER_KINDS = new Set(["notfound", "blocked", "unreachable", "thin", "rate", "server", "reader"]);

export function describeFailure({ stage = "", kind = "", status = 0, offline = false } = {}) {
  if (offline) return { code: "N", title: "Sunucuya ulaşılamadı", message: "İnternet bağlantını kontrol edip tekrar dene. Girdilerin korunuyor.", actions: ["retry"] };
  if (status === 401) return { code: "S", title: "Oturumun sona erdi", message: "Yeniden giriş yapman gerekiyor. Girdilerin taslağa kayıtlı.", actions: [] };
  if (stage === "read" && (READER_KINDS.has(kind) || !kind || status === 422)) {
    return {
      code: "A",
      title: "Kaynak sayfa okunamadı",
      message: "Bu bir yapay zekâ hatası değil: sayfa okunamadı ya da yeterli metin çıkmadı. Başka bir ücretsiz okuyucuyu deneyebilir, metni kendin ekleyebilir ya da ekran görüntüsü yükleyebilirsin.",
      actions: ["readerRetry", "pasteText", "screenshots"],
    };
  }
  if (kind === "quota" || (!kind && status === 429)) {
    return {
      code: "E",
      title: "Ücretsiz kullanım kotası doldu",
      message: "Ücretli bir servise geçilmedi. Kota genellikle gün içinde yenilenir; girdilerin ve tamamlanan adımlar korunuyor. İstersen kaynak metni kopyalayıp başka bir araçta kullanabilirsin.",
      actions: ["retry", "copyText", "pasteText"],
    };
  }
  // 503 tek başına yapılandırma demek değildir (yoğunluk da 503 döner): tür önceliklidir.
  if (kind === "config") {
    return {
      code: "D",
      title: "Ücretsiz yapay zekâ servisi hazır değil",
      message: "Bu iş için yapılandırılmış ücretsiz servis yok ya da geçici olarak kapalı. Yönetim panelindeki AI servisleri bölümünden durumu kontrol edebilirsin.",
      actions: ["retry", "copyText"],
    };
  }
  if (kind === "blocked" || kind === "invalid" || kind === "capability") {
    return {
      code: "C",
      title: "Yapay zekâ bu içeriği işleyemedi",
      message: "Ücretsiz servisler geçerli bir sonuç üretemedi. Tekrar deneyebilir ya da kaynağı sadeleştirip metni kendin ekleyebilirsin.",
      actions: ["retry", "pasteText", "copyText"],
    };
  }
  return {
    code: "B",
    title: "Ücretsiz yapay zekâ servisleri şu an yoğun",
    message: "Ücretli bir servise geçilmedi. Girdilerin ve tamamlanan adımlar korunuyor; birkaç dakika sonra tekrar dene ya da metni kendin ekle.",
    actions: ["retry", "pasteText", "copyText"],
  };
}
