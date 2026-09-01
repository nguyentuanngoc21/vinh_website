"use client";

import { useRouter } from "next/navigation";
import { WaveformIcon, PlayIcon } from "@phosphor-icons/react/dist/ssr";
import { formatClock, type AudioTrack } from "@/lib/audio/get-audio-catalog";
import { useNowPlaying } from "@/lib/audio/now-playing-context";

type ContinueListeningProps = {
  track: AudioTrack;
  positionSeconds: number;
};

/** Chỉ render khi có audio_progress thật của người đang xem (xem
 * src/lib/audio/get-listening-progress.ts) — không có thì /audio/page.tsx
 * không render component này, không bịa trạng thái "đang nghe". */
export function ContinueListening({ track, positionSeconds }: ContinueListeningProps) {
  const router = useRouter();
  const { play } = useNowPlaying();

  const duration = track.durationSeconds ?? 0;
  const pct = duration > 0 ? Math.min(100, Math.round((positionSeconds / duration) * 100)) : 0;
  const remaining = duration > 0 ? Math.max(0, duration - positionSeconds) : null;

  const resume = () => {
    play(track, positionSeconds);
    router.push("/audio/now-playing");
  };

  return (
    <section className="px-11 pb-5 pt-9">
      <div className="grid grid-cols-1 items-center gap-8 rounded-[22px] bg-brand-ink-dark p-8 text-white sm:grid-cols-[220px_1fr] sm:gap-11 sm:p-11">
        <button
          type="button"
          onClick={resume}
          className="relative flex h-[220px] w-full cursor-pointer flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-br from-brand-ink to-[#7a2e1c] p-[22px] text-left font-[family-name:var(--font-lora)] text-2xl font-bold leading-[1.2] shadow-[0_24px_48px_rgba(0,0,0,.45)] sm:h-[260px]"
        >
          {track.title}
          <span className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/18">
            <PlayIcon weight="fill" size={18} />
          </span>
        </button>
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-gold/18 px-3.5 py-1.5 text-xs font-semibold text-brand-gold-light">
            <WaveformIcon weight="fill" /> AUDIO ĐANG NGHE
          </div>
          <h1 className="my-2.5 text-[32px] font-bold leading-[1.15] tracking-[-0.5px] sm:text-[44px]">
            {track.title}
          </h1>
          <div className="text-[15px] text-sidebar-text-dim-2">
            Diễn đọc <b className="font-semibold text-white">{track.narratorName}</b>
            {track.genre ? ` · ${track.genre}` : ""}
          </div>
          {duration > 0 && (
            <div className="mt-[22px] max-w-[440px]">
              <div className="h-1.5 rounded-full bg-white/16">
                <div style={{ width: `${pct}%` }} className="h-1.5 rounded-full bg-brand-gold" />
              </div>
              <div className="mt-[7px] flex justify-between text-xs font-medium text-sidebar-text-dim">
                <span>{formatClock(positionSeconds)}</span>
                <span>còn {formatClock(remaining ?? 0)}</span>
              </div>
            </div>
          )}
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={resume}
              className="flex cursor-pointer items-center gap-[9px] rounded-full bg-brand-gold px-[30px] py-3.5 text-[15px] font-semibold text-brand-ink"
            >
              <PlayIcon weight="fill" /> Nghe tiếp
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
