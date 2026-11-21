import type { Metadata } from "next";
import { lora } from "@/lib/fonts";
import { NowPlaying } from "@/components/audio/now-playing";
import { AudioQueue } from "@/components/audio/audio-queue";
import { getCachedAudioCatalog } from "@/lib/cache/public-data";


export const metadata: Metadata = {
  title: "Đang phát — Vịnh Audio",
};

/**
 * Không nhận track qua URL (?id=...) — NowPlayingProvider (root layout)
 * giữ trạng thái phát xuyên suốt điều hướng client-side trong App Router,
 * nên bấm 1 track ở /audio rồi vào đây là đủ, không cần refetch. Chỉ
 * server-fetch lại toàn bộ catalog để AudioQueue lọc "cùng giọng đọc".
 */
export default async function AudioPlayerPage() {
  const tracks = await getCachedAudioCatalog();

  return (
    <div className={`${lora.variable} grid flex-1 grid-cols-1 bg-brand-ink-dark lg:grid-cols-[1fr_360px]`}>
      <NowPlaying />
      <AudioQueue tracks={tracks} />
    </div>
  );
}
