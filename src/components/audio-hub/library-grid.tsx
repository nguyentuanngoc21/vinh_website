"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlayCircleIcon, HeadphonesIcon } from "@phosphor-icons/react/dist/ssr";
import { AUDIO_GENRES, formatDurationShort, formatPlayCount, type AudioTrack } from "@/lib/audio/get-audio-catalog";
import { useNowPlaying } from "@/lib/audio/now-playing-context";

const GENRE_FILTERS = ["Tất cả", ...AUDIO_GENRES] as const;

export function LibraryGrid({ tracks }: { tracks: AudioTrack[] }) {
  const [genre, setGenre] = useState<(typeof GENRE_FILTERS)[number]>("Tất cả");
  const router = useRouter();
  const { play } = useNowPlaying();

  const items = useMemo(
    () => tracks.filter((t) => genre === "Tất cả" || t.genre === genre),
    [tracks, genre]
  );

  const handlePlay = (track: AudioTrack) => {
    play(track);
    router.push("/audio/now-playing");
  };

  return (
    <section className="px-11 pb-2 pt-[34px]">
      <div className="mb-[18px] flex items-center justify-between">
        <h2 className="text-[21px] font-bold text-brand-ink">Kho truyện audio</h2>
      </div>

      <div className="mb-[22px] flex flex-wrap gap-2.5">
        {GENRE_FILTERS.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => setGenre(label)}
            className={`cursor-pointer rounded-full px-[18px] py-2.5 text-sm font-medium transition-colors ${
              label === genre ? "bg-brand-ink text-white" : "bg-neutral-bg text-[#3a3a3a]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#e2ded7] px-8 py-14 text-center">
          <p className="text-sm text-stone-dark">
            {tracks.length === 0 ? "Chưa có bản thu nào trong kho Audio." : "Chưa có bản thu nào ở thể loại này."}
          </p>
          <Link
            href="/audio/new"
            className="mt-4 inline-block rounded-full bg-brand-gold px-6 py-2.5 text-sm font-semibold text-brand-ink no-underline"
          >
            Đăng tải Audio
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-[22px] sm:grid-cols-3 lg:grid-cols-4">
          {items.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handlePlay(t)}
              className="group block cursor-pointer text-left"
            >
              <div className="relative h-[210px] overflow-hidden rounded-2xl bg-gradient-to-br from-brand-ink to-brand-ink-dark shadow-[0_10px_22px_rgba(0,0,0,.16)]">
                {t.genre && (
                  <div className="absolute left-2.5 top-2.5 rounded-full bg-brand-ink-dark/60 px-2.5 py-1 text-[10px] font-semibold tracking-[.5px] text-white">
                    {t.genre}
                  </div>
                )}
                <div className="absolute bottom-2.5 right-2.5 rounded-md bg-brand-ink-dark/70 px-[9px] py-1 text-[11px] font-medium text-white">
                  {formatDurationShort(t.durationSeconds)}
                </div>
                <div className="absolute inset-0 flex scale-90 items-center justify-center bg-brand-ink-dark/35 opacity-0 transition-[opacity,transform] duration-200 group-hover:scale-100 group-hover:opacity-100">
                  <PlayCircleIcon weight="fill" size={54} color="#fff" />
                </div>
              </div>
              <div className="mt-[11px] truncate text-[15px] font-semibold text-ink">{t.title}</div>
              <div className="mt-[3px] truncate text-[13px] text-stone">Giọng đọc {t.narratorName}</div>
              <div className="mt-[7px] flex items-center gap-3 text-[12.5px] font-medium text-stone-light">
                <span className="flex items-center gap-1">
                  <HeadphonesIcon /> {formatPlayCount(t.playCount)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
