// Bir blog yazısının kanonik adresi. Yazar başka bir adres girdiyse (ör. yazı
// önce başka bir sitede yayımlandıysa) o adres kanoniktir: og:url ve JSON-LD
// de ona işaret eder ve yazı bu sitenin site haritasına girmez. Kanonik alan
// bu yazının kendi adresini gösteriyorsa (yerel ya da canlı alan adıyla)
// yazı kendi kendisinin kanoniğidir.
const stripWww = (host) => host.replace(/^www\./, "");
const trimSlash = (path) => path.replace(/\/+$/, "") || "/";

export function postCanonical({ slug, canonicalUrl }, { siteUrl, ownHosts = [] }) {
  const self = `${siteUrl}/blog/${slug}`;
  const value = String(canonicalUrl ?? "").trim();
  if (!value) return { url: self, path: `/blog/${slug}`, external: false };

  let target;
  try {
    target = new URL(value);
  } catch {
    return { url: self, path: `/blog/${slug}`, external: false };
  }
  const hosts = new Set([new URL(siteUrl).host, ...ownHosts].map(stripWww));
  const sameSite = hosts.has(stripWww(target.host));
  if (sameSite && trimSlash(decodeURI(target.pathname)) === `/blog/${slug}` && !target.search) {
    return { url: self, path: `/blog/${slug}`, external: false };
  }
  return { url: target.href, path: null, external: true };
}
