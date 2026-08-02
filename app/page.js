import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Gallery from "@/components/Gallery";
import Services from "@/components/Services";
import Process from "@/components/Process";
import Work from "@/components/Work";
import Contact from "@/components/Contact";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Gallery />
        <Services />
        <Process />
        <Work />
      </main>
      <Contact />
    </>
  );
}
