// Bảng phạt chụp màn hình/sao chép nội dung chương — module THUẦN (không
// Supabase, không next/headers), dùng chung cho src/app/api/penalty/route.ts
// (nguồn sự thật, trừ token thật) và src/components/reading/ (nhánh fallback
// offline khi gọi server thất bại + hiển thị thông điệp). Trước đây 2 nơi
// giữ 2 bản sao đồng bộ tay — giờ chỉ sửa ở đây.

export type PenaltyRule = { percent: number; durationDays: number };
export type NextPenalty = PenaltyRule | { ban: true; durationDays: number } | { warning: true };

// Lần vi phạm đầu tiên (count=0) = CẢNH BÁO, không nằm trong bảng này —
// PENALTY_RULES[0] ứng với lần vi phạm THỨ 2 (count=1).
export const PENALTY_RULES: ReadonlyArray<PenaltyRule> = [
  { percent: 10, durationDays: 3 },
  { percent: 10, durationDays: 7 },
  { percent: 15, durationDays: 14 },
  { percent: 15, durationDays: 30 },
];

/** Mốc token để tính số token trừ theo % (xem getPenaltyDeduction). */
export const PENALTY_BASE_TOKEN = 1000;

/** Từ lần vi phạm thứ mấy (count TRƯỚC khi ghi nhận lần này) thì cấm hẳn. */
export const PENALTY_BAN_FROM_COUNT = 5;

// count=0 (vi phạm lần đầu tiên) -> CẢNH BÁO, không trừ token/không khoá —
// xem hội thoại review UI/UX: reader chưa có bước "cảnh báo trước khi
// phạt", lần đầu bị phát hiện đã trừ token ngay. Từ lần vi phạm THỨ 2 trở
// đi (count>=1) mới áp PENALTY_RULES thật, lệch 1 chỉ số so với trước đây
// (PENALTY_RULES[count-1] thay vì PENALTY_RULES[count]) để nhường chỗ cho
// bước cảnh báo — cấm vĩnh viễn dời từ count>=4 sang count>=5 theo đúng độ
// lệch đó (tổng 4 mốc phạt thật không đổi, chỉ thêm 1 mốc cảnh báo trước
// mốc đầu).
/** `count` = screenshot_penalty_count HIỆN TẠI (trước khi ghi nhận lần vi
 * phạm mới). */
export function getNextPenalty(count: number): NextPenalty {
  if (count === 0) return { warning: true };
  if (count >= PENALTY_BAN_FROM_COUNT) return { ban: true, durationDays: 30 };
  return PENALTY_RULES[count - 1];
}

/** Rule đã áp cho lần vi phạm GẦN NHẤT, theo count ĐÃ ghi nhận (sau khi
 * tăng) — count=1 là lần cảnh báo nên luôn undefined; dùng để hiển thị
 * banner phạt thường trực. */
export function getAppliedPenaltyRule(recordedCount: number): PenaltyRule | undefined {
  return PENALTY_RULES[recordedCount - 2];
}

/** Số token trừ cho 1 lần phạt `percent`% — tối thiểu 1 token. */
export function getPenaltyDeduction(percent: number): number {
  return Math.max(1, Math.ceil((PENALTY_BASE_TOKEN * percent) / 100));
}

export const PENALTY_DAY_MS = 24 * 60 * 60 * 1000;
