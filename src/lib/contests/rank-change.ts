/**
 * Cột "Thay đổi" ▲▼ ở BXH (Phase 3, Slice 3.4 — K9). So hạng hiện tại với
 * bản chụp 0h giờ VN (snapshot_contest_ranks — hạng cuối ngày hôm qua). Chỉ
 * so hạng, không dính số phiếu (Q3). Thuần — không truy vấn.
 */
export type RankChange = { direction: "up" | "down" | "same"; by: number } | { direction: "new" };

/** previous = hạng trong bản chụp; undefined = bài chưa có trong bản chụp → "Mới". */
export function rankChange(previous: number | undefined, current: number): RankChange {
  if (previous === undefined) return { direction: "new" };
  const by = previous - current;
  if (by > 0) return { direction: "up", by };
  if (by < 0) return { direction: "down", by: -by };
  return { direction: "same", by: 0 };
}

export function rankChangeText(c: RankChange): string {
  switch (c.direction) {
    case "up":
      return `▲ ${c.by}`;
    case "down":
      return `▼ ${c.by}`;
    case "new":
      return "Mới";
    default:
      return "—";
  }
}

/** Nhãn đọc màn hình: "Tăng 2 hạng so với hôm qua". */
export function rankChangeAria(c: RankChange): string {
  switch (c.direction) {
    case "up":
      return `Tăng ${c.by} hạng so với hôm qua`;
    case "down":
      return `Giảm ${c.by} hạng so với hôm qua`;
    case "new":
      return "Mới vào bảng từ hôm qua";
    default:
      return "Giữ hạng so với hôm qua";
  }
}
