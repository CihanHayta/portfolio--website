import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import {
  Audience,
  Compare,
  Faq,
  FinalCta,
  Hero,
  Method,
  Principles,
  Problems,
  Start,
} from "@/components/home/HomeSections";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Problems />
        <Method />
        <Principles />
        <Compare />
        <Audience />
        <Start />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
