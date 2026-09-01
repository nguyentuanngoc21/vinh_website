"use client";

import { useRouter } from "next/navigation";
import { PlayCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { formatClock, type AudioTrack } from "@/lib/audio/get-audio-catalog";
import { useNowPlaying } from "@/lib/audio/now-playing-context";
import type { ListeningProgressItem } from "@/lib/audio/get-listening-progress";

/** items = tiến độ nghe thật của người xem, KHÔNG gồm track đã hiện ở
 * ContinueListening (audio/page.tsx tự lọc trước khi truyền xuống). Rỗng
 * thì không render gì — không bịa danh sách "nghe tiếp". */
export function ResumeRow({ items }: { items: ListeningProgressItem[] }) {
  const router = useRouter();
  const { play } = useNowPlaying();

  if (items.length === 0) return null;

  const resume = (track: AudioTrack, positionSeconds: number) => {
    play(track, positionSeconds);
    router.push("/audio/now-playing");
  };

  return (
    <section className="px-11 pb-2 pt-3.5">
      <div className="mb-4 flex items-end justify-between">
        <h2 className="text-[21px] font-bold text-brand-ink">Nghe tiếp</h2>
      </div>
      <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-3">
        {items.map(({ track, positionSeconds }) => {
          const duration = track.durationSeconds ?? 0;
          const pct = duration > 0 ? Math.min(100, Math.round((positionSeconds / duration) * 100)) : 0;
          return (
            <button
              key={track.id}
              type="button"
              onClick={() => resume(track, positionSeconds)}
              className="flex cursor-pointer items-center gap-3.5 rounded-2xl border border-cream bg-white p-3.5 text-left transition-[transform,box-shadow] duration-[250ms] hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(0,0,0,.14)]"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-brand-ink to-brand-ink-dark text-white">
                {track.narratorName[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold text-ink">{track.title}</div>
                <div className="mt-[3px] text-[12.5px] text-stone">
                  {formatClock(positionSeconds)}
                  {duration > 0 ? ` · còn ${formatClock(duration - positionSeconds)}` : ""}
                </div>
                {duration > 0 && (
                  <div className="mt-[9px] h-1 rounded-full bg-[#efece8]">
                    <div style={{ width: `${pct}%` }} className="h-1 rounded-full bg-brand-gold" />
                  </div>
                )}
              </div>
              <PlayCircleIcon weight="fill" size={30} color="var(--color-brand-gold)" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
