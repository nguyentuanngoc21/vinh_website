import { Lora } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { BookCoverflow } from "@/components/book-coverflow";
import { HeroTrending } from "@/components/hero-trending";
import { RankingGenres } from "@/components/ranking-genres";
import { NewWorksGrid } from "@/components/new-works-grid";
import { AudioSpotlight } from "@/components/audio-spotlight";
import { DevelopmentOverlay } from "@/components/development-overlay";
import { CopyrightBand } from "@/components/copyright-band";
import { AuthorCta } from "@/components/author-cta";
import { SiteFooter } from "@/components/site-footer";
import { createClient } from "@/lib/supabase/server";
import { getHomepageData } from "@/lib/home/get-homepage-books";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["700"],
});

export default async function Home() {
  const supabase = await createClient();
  const { featured, trending, newest, weeklyRanking } = await getHomepageData(supabase);

  return (
    <div className={`${lora.variable} flex-1 bg-[#f2f2f3]`}>
      <div className="mx-auto max-w-[1280px] bg-white">
        <SiteHeader showNav={false} />
        <main>
          <BookCoverflow books={featured} />
          <HeroTrending book={trending} />
          <RankingGenres weeklyRanking={weeklyRanking} />
          <NewWorksGrid books={newest} />
          {/* Audio chưa nối chapter_audio_links/audio_narrations thật —
              cùng trạng thái "đang phát triển" như /audio, /rankings,
              /blog (xem development-overlay.tsx) nên che luôn ở đây,
              tránh lộ lại nội dung audio giả trên trang chủ. */}
          <DevelopmentOverlay>
            <AudioSpotlight />
          </DevelopmentOverlay>
          <CopyrightBand />
          <AuthorCta />
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
