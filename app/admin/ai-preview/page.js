import Header from "@/components/Header";
import { requireAdmin } from "@/lib/blog/admin";
import AiPreviewClient from "@/components/admin/AiPreviewClient";

export const metadata = { title: "AI Önizleme — Blog Yönetimi" };

// "AI ile Blog Oluştur" akışının önizleme çerçevesi. Henüz kaydedilmemiş
// yazıyı, yayındaki blog sayfasıyla aynı bileşen ve stillerle gösterir.
// İçerik adres çubuğundan değil, aynı kaynaktaki editör penceresinden gelir.
export default async function AiPreviewPage() {
  const { displayName } = await requireAdmin();
  return (
    <>
      <Header variant="blog" />
      <AiPreviewClient authorName={displayName} />
    </>
  );
}
