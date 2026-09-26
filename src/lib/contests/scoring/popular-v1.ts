/**
 * Công thức "Độc giả yêu thích" v1 (D7): điểm = số phiếu hợp lệ. Phiếu hợp
 * lệ đã được cast_contest_vote() lọc lúc ghi (1 phiếu/bài/tài khoản, đã đọc
 * hết ≥ 1 chương, tài khoản đủ tuổi); chỉ bài eligible/shortlisted của sách
 * còn hiển thị mới được xếp hạng.
 *
 * Công thức là module có id riêng; contests.scoring_config chỉ chọn id, trọng
 * số không nằm ở route/UI. Phase 2 thêm popular-v2 (kết hợp valid reader).
 */
export const POPULAR_V1 = {
  id: "popular-v1",
  score: (input: { validVotes: number }): number => input.validVotes,
} as const;
