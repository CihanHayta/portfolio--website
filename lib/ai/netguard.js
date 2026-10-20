import { isIP } from "node:net";

// Dışarıdan verilen bir adrese sunucudan istek atılırken (SSRF) kullanılan
// denetimler. Yalnızca herkese açık internet adreslerine izin verilir.

export class UnsafeUrlError extends Error {}

const BLOCKED_V4 = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".corp", ".intranet"];

function v4ToInt(ip) {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPublicV4(ip) {
  const value = v4ToInt(ip);
  return !BLOCKED_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (value & mask) === (v4ToInt(base) & mask);
  });
}

// IPv6 adresini 8 adet 16 bitlik gruba açar ("::" ve gömülü IPv4 dahil).
function expandV6(ip) {
  let address = ip.split("%")[0].toLowerCase();
  const lastColon = address.lastIndexOf(":");
  const tail = address.slice(lastColon + 1);
  if (tail.includes(".")) {
    if (isIP(tail) !== 4) return null;
    const value = v4ToInt(tail);
    address = `${address.slice(0, lastColon + 1)}${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  const [head, rest] = address.split("::");
  const headParts = head ? head.split(":") : [];
  const restParts = rest !== undefined && rest !== "" ? rest.split(":") : [];
  const missing = 8 - headParts.length - restParts.length;
  if (rest === undefined ? headParts.length !== 8 : missing < 0) return null;
  const groups = [...headParts, ...Array(rest === undefined ? 0 : missing).fill("0"), ...restParts].map((part) =>
    Number.parseInt(part, 16)
  );
  return groups.length === 8 && groups.every((group) => group >= 0 && group <= 0xffff) ? groups : null;
}

const groupsToV4 = (high, low) => `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`;

function isPublicV6(ip) {
  const g = expandV6(ip);
  if (!g) return false;

  const leadingZeros = g.slice(0, 5).every((group) => group === 0);
  // ::, ::1 ve IPv4 ile uyumlu / eşlenmiş adresler gömülü IPv4'e göre değerlendirilir.
  if (leadingZeros && (g[5] === 0 || g[5] === 0xffff)) {
    if (g[5] === 0 && g[6] === 0 && g[7] <= 1) return false;
    return isPublicV4(groupsToV4(g[6], g[7]));
  }
  if (g[0] === 0x64 && g[1] === 0xff9b) return isPublicV4(groupsToV4(g[6], g[7])); // NAT64
  if (g[0] === 0x2002) return isPublicV4(groupsToV4(g[1], g[2])); // 6to4
  if ((g[0] & 0xfe00) === 0xfc00) return false; // fc00::/7 benzersiz yerel
  if ((g[0] & 0xffc0) === 0xfe80) return false; // fe80::/10 bağlantı yerel
  if ((g[0] & 0xffc0) === 0xfec0) return false; // fec0::/10 eski site yerel
  if ((g[0] & 0xff00) === 0xff00) return false; // çoklu yayın
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // belgeleme
  if (g[0] === 0x2001 && g[1] === 0) return false; // Teredo
  // Yalnızca küresel tekil yayın aralığı (2000::/3) kabul edilir.
  return (g[0] & 0xe000) === 0x2000;
}

export function isPublicAddress(ip) {
  const family = isIP(ip);
  if (family === 4) return isPublicV4(ip);
  if (family === 6) return isPublicV6(ip);
  return false;
}

// Adresi çözümlemeden yapılabilen denetimler. DNS sonucu ayrıca bağlantı
// anında (safeFetch içindeki lookup) doğrulanır.
export function parseSafeUrl(input) {
  const raw = String(input ?? "").trim();
  if (!raw || raw.length > 2000) throw new UnsafeUrlError("Geçerli bir bağlantı yapıştır.");

  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new UnsafeUrlError("Geçerli bir bağlantı yapıştır.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Yalnızca http ve https bağlantıları okunabilir.");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("Kullanıcı adı ya da parola içeren bağlantılar okunmaz.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new UnsafeUrlError("Yalnızca standart web portlarındaki (80, 443) sayfalar okunabilir.");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new UnsafeUrlError("Yerel ya da özel ağ adresleri okunamaz.");
  } else if (
    host === "localhost" ||
    !host.includes(".") ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  ) {
    throw new UnsafeUrlError("Yerel ya da özel ağ adresleri okunamaz.");
  }

  url.hash = "";
  return url;
}
