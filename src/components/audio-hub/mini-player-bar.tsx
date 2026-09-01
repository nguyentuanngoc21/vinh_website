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
    <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-5 bg-brand-ink-dark px-4 py-3 text-white sm:px-11">
      <div className="hidden h-[46px] w-[46px] shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-ink to-[#7a2e1c] text-sm font-bold sm:flex">
        {track.narratorName[0]}
      </div>
      <div className="hidden min-w-[150px] sm:block">
        <div className="truncate text-sm font-semibold">{track.title}</div>
        <div className="truncate text-xs text-sidebar-text-dim">Diễn đọc {track.narratorName}</div>
      </div>
      <div className="flex items-center gap-4 text-sidebar-text">
        <button type="button" onClick={() => skip(-15)} className="cursor-pointer" aria-label="Lùi 15 giây">
          <SkipBackIcon size={20} />
        </button>
        <button
          type="button"
          onClick={toggle}
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-brand-gold text-brand-ink"
        >
          {isPlaying ? <PauseIcon weight="fill" size={17} /> : <PlayIcon weight="fill" size={17} />}
        </button>
        <button type="button" onClick={() => skip(15)} className="cursor-pointer" aria-label="Tới 15 giây">
          <SkipForwardIcon size={20} />
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
