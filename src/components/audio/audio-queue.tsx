"use client";

import { HeadphonesIcon, SpeakerHighIcon } from "@phosphor-icons/react/dist/ssr";
import { formatDurationShort, formatPlayCount, type AudioTrack } from "@/lib/audio/get-audio-catalog";
import { useNowPlaying } from "@/lib/audio/now-playing-context";

/**
 * Trước đây "Danh sách chương" — 8 chương giả với trạng thái khóa/mở khóa
 * (chapter_audio_links CHƯA nối, xem ghi chú phạm vi ở
 * src/lib/audio/get-audio-catalog.ts). Đây là kho các bản thu ĐỘC LẬP,
 * không phải chương của 1 quyển sách, nên đổi thành "Cùng giọng đọc" —
 * các bản thu khác thật của cùng người vừa đang nghe, bấm để chuyển bài
 * ngay (không rời trang).
 */
export function AudioQueue({ tracks }: { tracks: AudioTrack[] }) {
  const { track: current, play } = useNowPlaying();

  if (!current) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 bg-[#FBF8F1] p-10 text-center">
        <p className="text-sm text-stone-alt">Chưa phát bản thu nào.</p>
      </div>
    );
  }

  const related = tracks.filter((t) => t.narratorId === current.narratorId && t.id !== current.id);

  return (
    <div className="flex flex-col overflow-hidden bg-[#FBF8F1]">
      <div className="border-b border-cream-border px-6 pb-3.5 pt-[22px]">
        <div className="text-lg font-bold text-brand-ink">Cùng giọng đọc {current.narratorName}</div>
        <div className="mt-[3px] text-[13px] text-stone-alt">
          {related.length === 0 ? "Chưa có bản thu khác" : `${related.length} bản thu khác`}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {related.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-stone-alt">
            Đây là bản thu duy nhất của {current.narratorName} trong kho hiện tại.
          </div>
        )}
        {related.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => play(t)}
            className="flex w-full cursor-pointer items-center gap-[13px] rounded-[10px] p-3 text-left transition-colors hover:bg-info-bg"
          >
            <div className="w-[30px] shrink-0 text-center">
              <HeadphonesIcon size={16} color="#b3a994" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-[#3a352e]">{t.title}</div>
              <div className="text-xs text-stone-alt">
                {formatDurationShort(t.durationSeconds)} · {formatPlayCount(t.playCount)} nghe
              </div>
            </div>
          </button>
        ))}
        <div className="mt-2 flex items-center gap-[13px] rounded-[10px] bg-[#F7EFD8] p-3">
          <div className="w-[30px] shrink-0 text-center">
            <SpeakerHighIcon weight="fill" size={18} color="var(--color-brand-gold-dark)" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-brand-ink">{current.title}</div>
            <div className="text-xs text-stone-alt">Đang phát</div>
          </div>
        </div>
      </div>
    </div>
  );
}
