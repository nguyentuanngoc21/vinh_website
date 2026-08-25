import { Lora } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { BookCoverflow } from "@/components/book-coverflow";
import { HeroTrending } from "@/components/hero-trending";
import { RankingGenres } from "@/components/ranking-genres";
import { NewWorksGrid } from "@/components/new-works-grid";
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
          {/* AudioSpotlight tạm bỏ khỏi trang chủ — nội dung của nó vẫn
              hardcode cứng ("Vũng Vịnh Cuối Trời — Chương 14"), chưa nối
              chapter_audio_links/audio_narrations thật. DevelopmentOverlay
              (dùng cho /audio, /rankings, /blog) không hợp để bọc 1 section
              giữa trang — nó pin theo VIEWPORT nên đè lên section khác khi
              cuộn trang, không chỉ đè lên đúng AudioSpotlight. Thêm lại
              <AudioSpotlight /> ở đây khi audio có data thật. */}
          <CopyrightBand />
          <AuthorCta />
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
