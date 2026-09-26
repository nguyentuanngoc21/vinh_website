"use client";

import { useEffect } from "react";
import type { ReadingSource } from "@/lib/supabase/types";
import { rememberReadingSource } from "@/lib/reading/reading-source";

/** Ghi nhớ nguồn vào trang truyện (xem src/lib/reading/reading-source.ts) — không hiển thị gì. */
export function ReadingSourceMarker({ bookId, source }: { bookId: string; source: ReadingSource }) {
  useEffect(() => {
    rememberReadingSource(bookId, source);
  }, [bookId, source]);
  return null;
}
