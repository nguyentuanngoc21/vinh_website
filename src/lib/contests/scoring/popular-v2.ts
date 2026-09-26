/**
 * Công thức "Độc giả yêu thích" v2 (P3): điểm = số phiếu ĐÃ LỌC — chỉ phiếu
 * của người có meaningful read ở truyện đó và không bị admin xác nhận gian
 * lận. Không chặn lúc bấm bình chọn (D5 giữ nguyên); lọc lúc tính điểm trong
 * refresh_contest_scores() (migrations/20260926_add_contest_scores.sql).
 *
 * Trong lúc bình chọn BXH vẫn đếm phiếu hợp lệ trực tiếp (P8); công thức này
 * áp dụng cho giải và BXH sau khi công bố kết quả, trên bảng điểm đã chốt.
 */
export const POPULAR_V2 = {
  id: "popular-v2",
  score: (input: { filteredVotes: number }): number => input.filteredVotes,
} as const;
