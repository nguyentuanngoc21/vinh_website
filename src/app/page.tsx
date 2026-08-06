import { Lora } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { BookCoverflow } from "@/components/book-coverflow";
import { HeroTrending } from "@/components/hero-trending";
import { RankingGenres } from "@/components/ranking-genres";
import { NewWorksGrid } from "@/components/new-works-grid";
import { AudioSpotlight } from "@/components/audio-spotlight";
import { CopyrightBand } from "@/components/copyright-band";
import { AuthorCta } from "@/components/author-cta";
import { SiteFooter } from "@/components/site-footer";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["700"],
});

export default function Home() {
  return (
    <div className={`${lora.variable} flex-1 bg-[#f2f2f3]`}>
      <div className="mx-auto max-w-[1280px] bg-white">
        <SiteHeader showNav={false} />
        <main>
          <BookCoverflow />
          <HeroTrending />
          <RankingGenres />
          <NewWorksGrid />
          <AudioSpotlight />
          <CopyrightBand />
          <AuthorCta />
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
