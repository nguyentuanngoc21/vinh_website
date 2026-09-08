"use client";

import { useRouter } from "next/navigation";
import { SkipBackIcon, SkipForwardIcon, PlayIcon, PauseIcon } from "@phosphor-icons/react/dist/ssr";
import { HeadphonesIcon } from "@phosphor-icons/react/dist/ssr";
import { formatDurationShort, formatPlayCount, type AudioTrack } from "@/lib/audio/get-audio-catalog";
import { useNowPlaying } from "@/lib/audio/now-playing-context";

/** Hash tên track để tạo gradient thumbnail riêng — thay thế gradient cứng
 * không liên quan đến track đang phát. */
const THUMB_PAIRS: [string, string][] = [
  ["#1d3b4a", "#0e7490"], // teal
  ["#2d1b4e", "#7c3aed"], // purple
  ["#1a2e1a", "#16a34a"], // green
  ["#4a1d1d", "#9d174d"], // rose
  ["#2a1f0e", "#b45309"], // amber
  ["#0f2e3d", "#0891b2"], // cyan
];

function hashThumb(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return THUMB_PAIRS[h % THUMB_PAIRS.length];
}

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
    <section className="px-4 pb-2 pt-10 sm:px-8 lg:px-11">
      <div className="flex flex-col gap-5 rounded-[20px] bg-neutral-bg p-4 sm:grid sm:grid-cols-[auto_1fr_auto] sm:gap-6 sm:p-6 md:p-8 sm:items-center">
        <div className="flex w-full min-w-0 items-center gap-3.5 sm:contents">
          <button
            type="button"
            onClick={goToPlayer}
            aria-label={`Mở trình phát — ${track.title}`}
            style={{ background: `linear-gradient(135deg, ${hashThumb(track.id)[0]}, ${hashThumb(track.id)[1]})` }}
            className="relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl sm:h-24 sm:w-24 sm:rounded-2xl"
          >
            <HeadphonesIcon size={24} className="sm:hidden" color="rgba(255,255,255,0.7)" />
            <HeadphonesIcon size={32} className="hidden sm:block" color="rgba(255,255,255,0.7)" />
          </button>
          <button type="button" onClick={goToPlayer} className="min-w-0 flex-1 cursor-pointer text-left">
            <div className="text-[11px] font-semibold tracking-[.5px] text-brand-gold-dark sm:text-xs">
              AUDIO NỔI BẬT
            </div>
            <div className="my-1 truncate text-base font-bold text-ink sm:my-1.5 sm:text-xl sm:whitespace-normal">
              {track.title}
            </div>
            <div className="truncate text-xs text-[#6a6a6a] sm:text-sm sm:whitespace-normal">
              Diễn đọc: {track.narratorName} · {formatDurationShort(track.durationSeconds)} ·{" "}
              {formatPlayCount(track.playCount)} lượt nghe
            </div>
            <div className="mt-2.5 h-1.5 w-full max-w-[520px] overflow-hidden rounded-full bg-[#dcdcdc] sm:mt-3.5">
              <div style={{ width: `${pct}%` }} className="h-full bg-brand-gold" />
            </div>
          </button>
        </div>
        <div className="flex w-full items-center justify-center gap-5 sm:w-auto sm:justify-end sm:gap-[18px]">
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
            className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-brand-gold text-brand-ink sm:h-[54px] sm:w-[54px]"
          >
            {isCurrent && isPlaying ? <PauseIcon weight="fill" size={20} /> : <PlayIcon weight="fill" size={20} />}
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
