import Header from "@/components/Header";
import Contact from "@/components/Contact";

export default function BlogLayout({ children }) {
  return (
    <div data-theme="blog">
      <Header variant="blog" />
      {children}
      <Contact />
    </div>
  );
}
