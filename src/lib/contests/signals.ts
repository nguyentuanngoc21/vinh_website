/**
 * Logic thuần cho các hàng khám phá dựa trên tín hiệu (Phase 2, Slice 2.3).
 * Số liệu (độc giả hợp lệ, độc giả mới 7 ngày) đến từ bảng điểm cache —
 * xem migrations/20260926_add_contest_scores.sql.
 */

/** P5: tỷ lệ chọn từ nhóm "dưới ngưỡng độc giả hợp lệ"; phần còn lại từ nhóm "ngoài top 10 lượt xem". */
export const HIDDEN_GEM_LOW_READER_SHARE = 0.8;
/** Số thẻ tối đa của hàng Viên ngọc ẩn; ít hơn MIN thì ẩn cả hàng (đặc tả UX). */
export const HIDDEN_GEM_COUNT = 10;
export const HIDDEN_GEM_MIN = 3;

/** PRNG có seed (mulberry32 trên hash FNV-1a) — cùng seed cho cùng dãy số. */
export function seededRandom(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * P5 — mỗi ô của hàng Viên ngọc ẩn: xác suất `share` lấy từ nhóm ít độc giả
 * hợp lệ, còn lại từ nhóm ngoài top 10 lượt xem. Nhóm được chọn đã hết thì
 * lấy từ nhóm còn lại. Hai nhóm có thể trùng bài — mỗi bài chỉ xuất hiện 1 lần.
 * Hai nhóm đến từ SQL đã xáo theo seed; seed ở đây quyết định nhóm cho từng ô,
 * nên cùng người xem trong cùng ngày thấy cùng một hàng.
 */
export function pickHiddenGems<T extends { submission_id: string }>(
  lowReaders: T[],
  lowViews: T[],
  input: { seed: string; count?: number; share?: number }
): T[] {
  const count = input.count ?? HIDDEN_GEM_COUNT;
  const share = input.share ?? HIDDEN_GEM_LOW_READER_SHARE;
  const rand = seededRandom(input.seed);
  const picked: T[] = [];
  const seen = new Set<string>();
  const queues = [lowReaders.slice(), lowViews.slice()];
  const takeFrom = (q: T[]): T | null => {
    while (q.length) {
      const item = q.shift()!;
      if (!seen.has(item.submission_id)) return item;
    }
    return null;
  };
  while (picked.length < count) {
    const first = rand() < share ? 0 : 1;
    const item = takeFrom(queues[first]) ?? takeFrom(queues[1 - first]);
    if (!item) break;
    seen.add(item.submission_id);
    picked.push(item);
  }
  return picked;
}

export type TrendingGrowth = { kind: "new" } | { kind: "percent"; value: number };

/**
 * P4 — mức tăng độc giả hợp lệ mới: 7 ngày gần nhất so với 7 ngày trước đó.
 * Trước đó chưa có ai → "Mới"; không tăng → null (không hiện chip).
 */
export function trendingGrowth(readers7d: number, readersPrev7d: number): TrendingGrowth | null {
  if (readers7d <= 0) return null;
  if (readersPrev7d <= 0) return { kind: "new" };
  if (readers7d <= readersPrev7d) return null;
  return { kind: "percent", value: Math.round(((readers7d - readersPrev7d) / readersPrev7d) * 100) };
}

export function growthLabel(g: TrendingGrowth | null): string | null {
  if (!g) return null;
  return g.kind === "new" ? "Mới" : `+${g.value.toLocaleString("vi-VN")}%`;
}
