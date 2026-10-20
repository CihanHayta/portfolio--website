import Header from "@/components/Header";
import MobileCallBar from "@/components/MobileCallBar";
import SiteFooter from "@/components/SiteFooter";

export default function BlogLayout({ children }) {
  return (
    <div data-theme="blog">
      <Header />
      {children}
      <SiteFooter />
      <MobileCallBar />
    </div>
  );
}
