import type { Metadata } from "next";
import { Lora } from "next/font/google";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { ContinueListening } from "@/components/audio-hub/continue-listening";
import { ResumeRow } from "@/components/audio-hub/resume-row";
import { LibraryGrid } from "@/components/audio-hub/library-grid";
import { NarratorsRow } from "@/components/audio-hub/narrators-row";
import { getAudioCatalog, getNarratorStats } from "@/lib/audio/get-audio-catalog";
import { getListeningProgress } from "@/lib/audio/get-listening-progress";
import { createClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "Audio — Vịnh",
};

const RESUME_TOTAL_LIMIT = 4; // 1 cho ContinueListening (hero) + 3 cho ResumeRow

/**
 * Trước đây 100% mock (CATALOG/RESUME/NARRATORS, src/lib/audio-catalog.ts)
 * đứng sau <DevelopmentOverlay>. Giờ đọc public_audio_narrations thật
 * (genre/play_count, xem migrations/20260901_add_audio_narration_hub_metadata.sql
 * và src/lib/audio/get-audio-catalog.ts) — overlay đã gỡ. "Audio đang
 * nghe"/"Nghe tiếp" đọc audio_progress thật của người xem
 * (src/lib/audio/get-listening-progress.ts), phát bằng trình phát thật
 * (NowPlayingProvider, mounted ở root layout) — không còn hero/mini-player
 * tĩnh.
 */
export default async function AudioHubPage() {
  const supabase = await createClient();
  const viewerId = await getAuthedUserId();

  const [tracks, progress] = await Promise.all([
    getAudioCatalog(supabase),
    getListeningProgress(supabase, viewerId, RESUME_TOTAL_LIMIT),
  ]);
  const narrators = getNarratorStats(tracks);
  const [hero, ...rest] = progress;

  return (
    <div className={`${lora.variable} flex-1 bg-[#f2f2f3]`}>
      <div className="mx-auto max-w-[1280px] bg-white pb-24">
        <SiteHeader
          searchPlaceholder="Tìm truyện audio…"
          ctaLabel="Đăng tải Audio"
          ctaHref="/audio/new"
        />
        <main>
          {hero && <ContinueListening track={hero.track} positionSeconds={hero.positionSeconds} />}
          <ResumeRow items={rest} />
          <LibraryGrid tracks={tracks} />
          <NarratorsRow narrators={narrators} />
          <section className="px-11 pb-10 pt-[34px]">
            <div className="flex items-center justify-between rounded-[20px] bg-[#F7EFD8] px-10 py-8">
              <div>
                <div className="text-[22px] font-bold text-brand-ink">
                  Có giọng đọc hay?
                </div>
                <div className="mt-[5px] text-[14.5px] text-[#6b5f3a]">
                  Ghi âm tác phẩm và chia sẻ trên Vịnh — bản ghi được gắn
                  watermark âm thanh tự động.
                </div>
              </div>
              <Link
                href="/audio/new"
                className="shrink-0 whitespace-nowrap rounded-full bg-brand-gold px-[30px] py-3.5 text-[15px] font-semibold text-brand-ink no-underline"
              >
                Gửi bản thu
              </Link>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
