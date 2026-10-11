const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Istanbul",
});

const dateTimeFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Istanbul",
});

export function formatDate(value) {
  return value ? dateFormatter.format(new Date(value)) : "";
}

export function formatDateTime(value) {
  return value ? dateTimeFormatter.format(new Date(value)) : "";
}

// Yönetim panelinde gösterilen durum: taslak, planlanmış ya da yayında.
export function postState(post, now = Date.now()) {
  if (post.deleted_at) return "trashed";
  if (post.status !== "published") return "draft";
  return new Date(post.published_at).getTime() > now ? "scheduled" : "published";
}

export const STATE_LABELS = {
  draft: "Taslak",
  scheduled: "Planlandı",
  published: "Yayında",
  trashed: "Çöp kutusunda",
};
