import type { ReadingSource } from "@/lib/supabase/types";

/**
 * Nguồn truy cập của phiên đọc (chỉ cho analytics, không vào điểm cuộc thi). Trang truyện
 * /truyen/[slug]?from=... ghi nguồn vào sessionStorage theo bookId; reader.tsx đọc lại khi gửi
 * nhịp đọc. Hết hạn sau 30 phút để một lượt vào từ cuộc thi không gán mãi cho các lần đọc sau.
 */
const KEY_PREFIX = "vinh:read-src:";
const TTL_MS = 30 * 60 * 1000;

/** Giá trị `?from=` của trang truyện → nguồn đọc. */
const FROM_PARAM: Record<string, ReadingSource> = {
  "cuoc-thi": "contest",
  "goi-y": "recommendation",
};

export function readingSourceFromParam(from: string | undefined): ReadingSource | null {
  return (from && FROM_PARAM[from]) || null;
}

export function rememberReadingSource(bookId: string, source: ReadingSource) {
  try {
    sessionStorage.setItem(KEY_PREFIX + bookId, JSON.stringify({ source, at: Date.now() }));
  } catch {
    // sessionStorage bị chặn (chế độ riêng tư) — chỉ mất thông tin nguồn.
  }
}

export function recallReadingSource(bookId: string): ReadingSource | null {
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + bookId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { source?: ReadingSource; at?: number };
    if (!parsed.source || typeof parsed.at !== "number" || Date.now() - parsed.at > TTL_MS) return null;
    return parsed.source;
  } catch {
    return null;
  }
}
