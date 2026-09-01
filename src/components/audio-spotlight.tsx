"use client";

import { useRouter } from "next/navigation";
import { SkipBackIcon, SkipForwardIcon, PlayIcon, PauseIcon } from "@phosphor-icons/react/dist/ssr";
import { formatDurationShort, formatPlayCount, type AudioTrack } from "@/lib/audio/get-audio-catalog";
import { useNowPlaying } from "@/lib/audio/now-playing-context";

/**
 * Trước đây hardcode cứng "Vũng Vịnh Cuối Trời — Chương 14", đã bỏ khỏi
 * trang chủ (xem git blame). Giờ nhận track thật — bản thu được nghe
 * nhiều nhất trong kho (src/app/page.tsx chọn qua playCount) — và phát
 * bằng đúng trình phát site-wide (NowPlayingProvider), không còn progress
 * bar 62% giả. Nếu kho audio rỗng, page.tsx không render component này.
 */
export function AudioSpotlight({ track }: { track: AudioTrack }) {
  const router = useRouter();
  const { track: current, isPlaying, currentTime, duration, play, toggle, skip } = useNowPlaying();

  const isCurrent = current?.id === track.id;
  const pct = isCurrent && duration > 0 ? (currentTime / duration) * 100 : 0;

  const handlePlayPause = () => {
    if (isCurrent) {
      toggle();
      return;
    }
    play(track);
  };

  const goToPlayer = () => router.push("/audio/now-playing");

  return (
    <section className="px-11 pb-2 pt-10">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-6 rounded-[20px] bg-neutral-bg p-8">
        <button
          type="button"
          onClick={goToPlayer}
          className="h-24 w-24 cursor-pointer rounded-2xl bg-gradient-to-br from-[#1d3b4a] to-[#7a2e1c]"
          aria-label={`Mở trình phát — ${track.title}`}
        />
        <button type="button" onClick={goToPlayer} className="cursor-pointer text-left">
          <div className="text-xs font-semibold tracking-[.5px] text-brand-gold-dark">
            AUDIO NỔI BẬT
          </div>
          <div className="my-1.5 text-xl font-bold text-ink">{track.title}</div>
          <div className="text-sm text-[#6a6a6a]">
            Diễn đọc: {track.narratorName} · {formatDurationShort(track.durationSeconds)} ·{" "}
            {formatPlayCount(track.playCount)} lượt nghe
          </div>
          <div className="mt-3.5 h-1.5 w-full max-w-[520px] overflow-hidden rounded-full bg-[#dcdcdc]">
            <div style={{ width: `${pct}%` }} className="h-full bg-brand-gold" />
          </div>
        </button>
        <div className="flex items-center gap-[18px]">
          <button
            type="button"
            onClick={() => (isCurrent ? skip(-15) : play(track))}
            className="cursor-pointer"
            aria-label="Lùi 15 giây"
          >
            <SkipBackIcon size={22} color="#6a6a6a" />
          </button>
          <button
            type="button"
            onClick={handlePlayPause}
            className="flex h-[54px] w-[54px] cursor-pointer items-center justify-center rounded-full bg-brand-gold text-brand-ink"
          >
            {isCurrent && isPlaying ? <PauseIcon weight="fill" size={22} /> : <PlayIcon weight="fill" size={22} />}
          </button>
          <button
            type="button"
            onClick={() => (isCurrent ? skip(15) : play(track))}
            className="cursor-pointer"
            aria-label="Tới 15 giây"
          >
            <SkipForwardIcon size={22} color="#6a6a6a" />
          </button>
        </div>
      </div>
    </section>
  );
}
