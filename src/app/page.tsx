import { Lora } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { ProductTour } from "@/components/onboarding/product-tour";
import { BookCoverflow } from "@/components/book-coverflow";
import { HeroTrending } from "@/components/hero-trending";
import { RankingGenres } from "@/components/ranking-genres";
import { NewWorksGrid } from "@/components/new-works-grid";
import { RecommendedForYou } from "@/components/recommended-for-you";
import { AudioSpotlight } from "@/components/audio-spotlight";
import { CopyrightBand } from "@/components/copyright-band";
import { AuthorCta } from "@/components/author-cta";
import { SiteFooter } from "@/components/site-footer";
import { createClient } from "@/lib/supabase/server";
import { getRecommendedBooks } from "@/lib/recommendations/get-recommended-books";
import { getCachedHomepageData, getCachedTopAudioTrack } from "@/lib/cache/public-data";
import { getAuthedUserId } from "@/lib/wallet/session";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["700"],
});

export default async function Home() {
  const supabase = await createClient();
  // Khuyến nghị cần viewerId nhưng không cần đợi dữ liệu trang chủ — nối
  // tiếp ngay sau lookup viewer để cả 3 nhánh chạy song song.
  const viewerId = getAuthedUserId();
  const [{ featured, trending, newest, weeklyRanking }, spotlightTrack, recommended] = await Promise.all([
    // Dữ liệu công khai — cache 5 phút + làm mới theo tag (lib/cache/public-data.ts).
    getCachedHomepageData(),
    // "Nổi bật" = nghe nhiều nhất trong kho — thật, không còn hardcode "Vũng
    // Vịnh Cuối Trời — Chương 14". Rỗng thì không render section, không bịa.
    getCachedTopAudioTrack(),
    // Chỉ hiện với user đã đăng nhập — recommend_books() cần lịch sử đọc của
    // 1 user thật, không có gì để gợi ý cho khách vãng lai (không fallback
    // sang "sách mới" ở đây, NewWorksGrid đã làm việc đó rồi, tránh trùng).
    viewerId.then((id) => (id ? getRecommendedBooks(supabase, id) : [])),
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
          <RecommendedForYou books={recommended} />
          {spotlightTrack && <AudioSpotlight track={spotlightTrack} />}
          <CopyrightBand />
          <AuthorCta />
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
