import Header from "@/components/Header";

// Yönetim sayfaları oturuma bağlıdır; hiçbir koşulda önbelleğe alınmaz.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Blog Yönetimi",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }) {
  return (
    <div data-theme="blog" data-surface="admin">
      <Header variant="blog" />
      {children}
    </div>
  );
}
