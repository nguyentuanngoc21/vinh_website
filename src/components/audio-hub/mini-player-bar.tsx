"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SkipBackIcon,
  SkipForwardIcon,
  PlayIcon,
  PauseIcon,
  ArrowsOutSimpleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { formatClock } from "@/lib/audio/get-audio-catalog";
import { useNowPlaying } from "@/lib/audio/now-playing-context";

/** Mounted at the bottom of every /audio page (audio/layout.tsx) — reads
 * live state from NowPlayingProvider (root layout), so it keeps playing/
 * showing the current track even after navigating between /audio pages.
 * Renders nothing until something has actually been played. */
export function MiniPlayerBar() {
  const { track, isPlaying, currentTime, duration, toggle, seek, skip } = useNowPlaying();
  const pathname = usePathname();

  // /audio/now-playing has its own full transport controls — showing the
  // mini bar there too would just duplicate them.
  if (!track || pathname === "/audio/now-playing") return null;

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2.5 bg-brand-ink-dark px-3 py-2.5 text-white sm:gap-5 sm:px-8 sm:py-3 lg:px-11">
      <div className="hidden h-[46px] w-[46px] shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-ink to-[#7a2e1c] text-sm font-bold sm:flex">
        {track.narratorName[0]}
      </div>
      <div className="min-w-0 max-w-[110px] sm:max-w-none sm:min-w-[150px]">
        <div className="truncate text-xs font-semibold sm:text-sm">{track.title}</div>
        <div className="truncate text-[10px] text-sidebar-text-dim sm:text-xs">Diễn đọc {track.narratorName}</div>
      </div>
      <div className="flex items-center gap-2 text-sidebar-text sm:gap-4">
        <button type="button" onClick={() => skip(-15)} className="cursor-pointer" aria-label="Lùi 15 giây">
          <SkipBackIcon size={18} className="sm:hidden" />
          <SkipBackIcon size={20} className="hidden sm:block" />
        </button>
        <button
          type="button"
          onClick={toggle}
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-brand-gold text-brand-ink sm:h-10 sm:w-10"
        >
          {isPlaying ? <PauseIcon weight="fill" size={16} /> : <PlayIcon weight="fill" size={16} />}
        </button>
        <button type="button" onClick={() => skip(15)} className="cursor-pointer" aria-label="Tới 15 giây">
          <SkipForwardIcon size={18} className="sm:hidden" />
          <SkipForwardIcon size={20} className="hidden sm:block" />
        </button>
      </div>
      <div className="flex flex-1 items-center gap-3">
        <span className="hidden text-xs font-medium text-sidebar-text-dim sm:inline">{formatClock(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(duration, 1)}
          value={Math.min(currentTime, Math.max(duration, 1))}
          onChange={(e) => seek(Number(e.target.value))}
          className="h-[5px] flex-1 cursor-pointer accent-[var(--color-brand-gold)]"
          style={{
            background: `linear-gradient(to right, var(--color-brand-gold) ${pct}%, rgba(255,255,255,.16) ${pct}%)`,
          }}
        />
        <span className="hidden text-xs font-medium text-sidebar-text-dim sm:inline">{formatClock(duration)}</span>
      </div>
      <Link href="/audio/now-playing" className="flex shrink-0 text-sidebar-text">
        <ArrowsOutSimpleIcon size={19} />
      </Link>
    </div>
  );
}
