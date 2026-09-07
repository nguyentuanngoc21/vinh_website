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
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-6 rounded-[20px] bg-neutral-bg p-8">
        <button
          type="button"
          onClick={goToPlayer}
          aria-label={`Mở trình phát — ${track.title}`}
          style={{ background: `linear-gradient(135deg, ${hashThumb(track.id)[0]}, ${hashThumb(track.id)[1]})` }}
          className="relative flex h-24 w-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl"
        >
          <HeadphonesIcon size={32} color="rgba(255,255,255,0.7)" />
        </button>
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
