import { requireAdmin } from "@/lib/blog/admin";
import { servicesStatus } from "@/lib/ai/servicesStatus";
import AiServicesPanel from "@/components/admin/ai/AiServicesPanel";

export const metadata = { title: "AI Servisleri ve Limitler — Blog Yönetimi" };

// Gelişmiş kullanıcı ekranı: normal blog yazma akışı bu sayfayı gerektirmez.
export default async function AiServicesPage() {
  const { supabase } = await requireAdmin();
  const data = await servicesStatus({ db: supabase });
  return <AiServicesPanel initial={data} />;
}
