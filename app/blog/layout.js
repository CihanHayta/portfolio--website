import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";

export default function BlogLayout({ children }) {
  return (
    <div data-theme="blog">
      <Header />
      {children}
      <SiteFooter />
    </div>
  );
}
