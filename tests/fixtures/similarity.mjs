// Benzerlik testleri için anlamlı, birbirinden farklı Türkçe blog fixture'ları.
const para = (...sentences) => sentences.join(" ");

// Kaynak: Meta reklam bütçesi belirleme.
export const SOURCE = {
  title: "Meta reklam bütçesi nasıl belirlenir?",
  headings: ["Günlük bütçe ile toplam bütçe arasındaki fark", "Hedefe göre reklam bütçesi planlama", "Test bütçesi ne kadar olmalı?", "Bütçeyi ölçeklendirme zamanı"],
  keyTerms: ["meta reklam bütçesi", "günlük bütçe", "reklam harcaması", "bütçe ölçeklendirme"],
  text: para(
    "Meta reklam bütçesi belirlerken önce günlük bütçe ile toplam bütçe arasındaki farkı anlamak gerekir.",
    "Günlük bütçe her gün harcanacak ortalama tutarı, toplam bütçe ise kampanya boyunca harcanacak tutarı belirler.",
    "Hedefe göre reklam bütçesi planlarken satış, potansiyel müşteri ve bilinirlik kampanyaları farklı ele alınır.",
    "Test bütçesi, farklı kreatif ve hedef kitleleri karşılaştıracak kadar veri toplamalıdır.",
    "Sonuçlar istikrarlı hale geldiğinde bütçeyi ölçeklendirme zamanı gelir; bütçe kademeli olarak artırılır.",
    "Reklam harcaması artarken maliyetler yakından izlenmeli ve öğrenme aşaması gereksiz yere sıfırlanmamalıdır."
  ),
};

const post = (id, fields) => ({ id, status: "published", headings: [], text: "", tags: [], ...fields });

export const POSTS = [
  post("ayni", {
    title: "Meta Reklam Bütçesi Nasıl Belirlenir?",
    headings: ["Günlük ve toplam bütçe farkı", "Kampanya hedefine göre bütçe planlama", "Test bütçesi belirleme", "Ne zaman ölçeklendirmeli?"],
    text: para(
      "Meta reklam bütçesi belirlemenin ilk adımı günlük bütçe ile toplam bütçe farkını bilmektir.",
      "Kampanya hedefine göre bütçe planlama yapılırken satış ve potansiyel müşteri kampanyaları ayrı değerlendirilir.",
      "Test bütçesi kreatifleri ve hedef kitleleri karşılaştırmaya yetecek kadar olmalıdır.",
      "Sonuçlar oturduğunda bütçe kademeli olarak artırılır ve reklam harcaması izlenir.",
      "Öğrenme aşamasını bozmamak için bütçe değişiklikleri küçük adımlarla yapılır."
    ),
  }),
  post("farkli-baslik", {
    status: "draft",
    title: "Facebook ve Instagram kampanyalarında ne kadar harcamalısınız?",
    seoTitle: "Meta reklamlarında bütçe planlaması",
    headings: ["Günlük bütçe mi toplam bütçe mi?", "Kampanya amacına göre bütçe", "Test için ayrılacak bütçe", "Başarılı kampanyayı büyütmek"],
    text: para(
      "Meta reklamlarında bütçe planlaması yaparken günlük bütçe ve toplam bütçe seçenekleri arasında karar verirsiniz.",
      "Kampanya amacına göre bütçe ayırmak, satış ve potansiyel müşteri hedeflerinde farklı sonuçlar verir.",
      "Test için ayrılacak bütçe kreatif ve hedef kitle denemelerine yetmelidir.",
      "Başarılı kampanyayı büyütmek için bütçeyi kademeli artırın ve reklam harcamasını izleyin."
    ),
  }),
  post("ortak-kelime", {
    title: "Instagram reklamlarına başlangıç rehberi",
    headings: ["Instagram işletme hesabı açma", "İlk reklam görselini hazırlama", "Hikâye ve gönderi reklamları", "Hedef kitle seçimi"],
    text: para(
      "Instagram reklamlarına başlamak için önce bir işletme hesabı açmanız gerekir.",
      "İlk reklam görselini hazırlarken marka renklerinizi ve net bir mesajı kullanın.",
      "Hikâye reklamları dikey formatta, gönderi reklamları ise akışta görünür.",
      "Hedef kitle seçimi yaparken ilgi alanları ve konumu belirleyin; küçük bir bütçeyle başlayabilirsiniz."
    ),
  }),
  post("iliskili", {
    title: "Google Ads kalite puanı nedir ve nasıl yükseltilir?",
    headings: ["Kalite puanını etkileyen faktörler", "Açılış sayfası deneyimi", "Beklenen tıklama oranı"],
    text: para(
      "Google Ads kalite puanı reklamlarınızın ve açılış sayfanızın alaka düzeyini ölçer.",
      "Beklenen tıklama oranı, reklam alaka düzeyi ve açılış sayfası deneyimi puanı belirler.",
      "Yüksek kalite puanı tıklama başına maliyeti düşürebilir ve reklam bütçenizin verimini artırır."
    ),
  }),
  post("alakasiz", {
    title: "Kahve dükkanı için logo tasarımı",
    headings: ["Renk seçimi", "Tipografi", "Logo dosya formatları"],
    text: para("Kahve dükkanı logosu tasarlarken sıcak renkler ve okunaklı tipografi seçilir.", "Logo dosyaları vektör formatında saklanmalıdır."),
  }),
];

