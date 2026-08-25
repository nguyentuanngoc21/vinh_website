"use client";

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
 */
export function GenreSelect({ value, onChange, className }: GenreSelectProps) {
  return (
    <div className={`flex flex-wrap gap-2 ${className ?? ""}`}>
      {BOOK_GENRES.map((genre) => {
        const active = genre === value;
        return (
          <button
            key={genre}
            type="button"
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
