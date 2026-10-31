// Yazının konusuyla ilişkili GERÇEK hizmetler (data/content.js → home.services).
// Hizmetlerin ayrı sayfası olmadığı için bağlantı ana sayfadaki hizmetler bölümüdür
// (/#hizmetler); var olmayan bir hizmet adresi üretilmez. Eşleşme yoksa boş döner.
const fold = (text) => String(text ?? "").toLocaleLowerCase("tr-TR");
const count = (haystack, needle) => {
  if (!needle) return 0;
  let found = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    found += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return found;
};

export function relatedServices(services, { title = "", category = "", tags = [], text = "" } = {}, limit = 2) {
  const head = fold(`${title} ${category} ${tags.join(" ")}`);
  const body = fold(text).slice(0, 20_000);
  return (services ?? [])
    .map((service, index) => {
      const score = (service.keywords ?? []).reduce((sum, keyword) => {
        const word = fold(keyword);
        return sum + count(head, word) * 3 + Math.min(count(body, word), 4);
      }, 0);
      return { service, score, index };
    })
    .filter((item) => item.score >= 3)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ service }) => ({ title: service.title, text: service.text, href: "/#hizmetler" }));
}
