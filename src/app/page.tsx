import { Lora } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { ProductTour } from "@/components/onboarding/product-tour";
import { BookCoverflow } from "@/components/book-coverflow";
import { HeroTrending } from "@/components/hero-trending";
import { RankingGenres } from "@/components/ranking-genres";
import { NewWorksGrid } from "@/components/new-works-grid";
import { PersonalRecommendations } from "@/components/personal-recommendations";
import { AudioSpotlight } from "@/components/audio-spotlight";
import { CopyrightBand } from "@/components/copyright-band";
import { AuthorCta } from "@/components/author-cta";
import { SiteFooter } from "@/components/site-footer";
import { getCachedHomepageData, getCachedTopAudioTrack } from "@/lib/cache/public-data";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["700"],
});

export default async function Home() {
  const [{ featured, trending, newest, weeklyRanking }, spotlightTrack] = await Promise.all([
    // Dữ liệu công khai — cache 5 phút + làm mới theo tag (lib/cache/public-data.ts).
    getCachedHomepageData(),
    // "Nổi bật" = nghe nhiều nhất trong kho — thật, không còn hardcode "Vũng
    // Vịnh Cuối Trời — Chương 14". Rỗng thì không render section, không bịa.
    getCachedTopAudioTrack(),
  ]);

  return (
    <div className={`${lora.variable} flex-1 bg-surface-muted`}>
      <div className="mx-auto max-w-[1280px] bg-surface">
        <ProductTour />
        <SiteHeader showNav={false} />
        <main>
          <BookCoverflow books={featured} />
          <HeroTrending book={trending} />
          <RankingGenres weeklyRanking={weeklyRanking} />
          <NewWorksGrid books={newest} />
          <PersonalRecommendations />
          {spotlightTrack && <AudioSpotlight track={spotlightTrack} />}
          <CopyrightBand />
          <AuthorCta />
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
