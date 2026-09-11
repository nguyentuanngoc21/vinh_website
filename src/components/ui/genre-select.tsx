"use client";

import { useRef, type KeyboardEvent } from "react";
import type { BookGenre } from "@/lib/supabase/types";
import { BOOK_GENRES } from "@/lib/covers/genre-styles";

type GenreSelectProps = {
  value: BookGenre | null;
  onChange: (genre: BookGenre) => void;
  className?: string;
};

/**
 * Picker genre dạng chip — TÁI DÙNG đúng style của
 * src/components/ranking-genres.tsx (rounded-full, active
 * bg-[#F7EFD8]/text-brand-gold-dark, inactive bg-neutral-bg/text-ink),
 * chỗ đó chỉ decorative (cursor-default, không onClick); ở đây có
 * onClick thật, single-select.
 *
 * `role="radiogroup"` (không phải "listbox") — chọn 1 trong 1 tập cố định,
 * đúng ngữ nghĩa radio hơn. Trước đây chỉ có onClick chuột; giờ thêm
 * roving-tabindex (chỉ chip active nằm trong Tab order, còn lại
 * tabIndex={-1}) + ArrowLeft/ArrowRight/Home/End di chuyển VÀ chọn luôn
 * (đúng hành vi radiogroup chuẩn, không tách focus khỏi selection).
 */
export function GenreSelect({ value, onChange, className }: GenreSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = value ? BOOK_GENRES.indexOf(value) : -1;
    let nextIndex = -1;
    if (e.key === "ArrowRight") nextIndex = (currentIndex + 1 + BOOK_GENRES.length) % BOOK_GENRES.length;
    else if (e.key === "ArrowLeft") nextIndex = (currentIndex - 1 + BOOK_GENRES.length) % BOOK_GENRES.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = BOOK_GENRES.length - 1;
    if (nextIndex < 0) return;

    e.preventDefault();
    const genre = BOOK_GENRES[nextIndex];
    onChange(genre);
    rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[nextIndex]?.focus();
  };

  return (
    <div
      ref={rootRef}
      role="radiogroup"
      aria-label="Thể loại"
      onKeyDown={onKeyDown}
      className={`flex flex-wrap gap-2 ${className ?? ""}`}
    >
      {BOOK_GENRES.map((genre, index) => {
        const active = genre === value;
        // Roving tabindex chuẩn cần ÍT NHẤT 1 chip tabbable — nếu chưa
        // chọn gì (value === null) thì chip đầu tiên tạm giữ vị trí đó,
        // không thì cả nhóm biến mất khỏi Tab order.
        const isTabStop = value === null ? index === 0 : active;
        return (
          <button
            key={genre}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={isTabStop ? 0 : -1}
            onClick={() => onChange(genre)}
            className={
              "cursor-pointer rounded-full px-[16px] py-2 text-[13.5px] font-medium transition-colors " +
              (active
                ? "bg-[#F7EFD8] font-semibold text-brand-gold-dark"
                : "bg-neutral-bg text-ink hover:text-brand-gold-dark")
            }
          >
            {genre}
          </button>
        );
      })}
    </div>
  );
}
