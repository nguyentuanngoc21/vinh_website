/**
 * Nhãn tiếng Việt + ma trận chuyển trạng thái phía UI. Ma trận ở đây CHỈ để
 * vẽ nút; nguồn sự thật là contest_status_transition_allowed() /
 * contest_submission_transition_allowed() trong
 * migrations/20260926_add_contest_engine_core.sql (DB từ chối chuyển sai
 * dù UI có lệch). Sửa SQL thì sửa cả đây.
 */
import type { ContestStatus, ContestSubmissionStatus } from "@/lib/supabase/types";

export const CONTEST_STATUS_LABEL: Record<ContestStatus, string> = {
  draft: "Bản nháp",
  announced: "Sắp mở nhận bài",
  submission_open: "Đang nhận bài",
  submission_closed: "Đã đóng nhận bài",
  community_voting: "Đang bình chọn",
  judging: "Ban giám khảo đang chấm",
  results: "Đã có kết quả",
  archived: "Đã lưu trữ",
};

export const SUBMISSION_STATUS_LABEL: Record<ContestSubmissionStatus, string> = {
  submitted: "Chờ duyệt",
  eligible: "Hợp lệ",
  ineligible: "Không hợp lệ",
  withdrawn: "Đã rút",
  disqualified: "Bị loại",
  shortlisted: "Vào vòng trong",
};

export const NEXT_CONTEST_STATUSES: Record<ContestStatus, ContestStatus[]> = {
  draft: ["announced"],
  announced: ["submission_open"],
  submission_open: ["submission_closed"],
  submission_closed: ["community_voting", "judging", "results"],
  community_voting: ["judging", "results"],
  judging: ["results"],
  results: ["archived"],
  archived: [],
};

/** Chuyển admin được làm (không gồm withdrawn — chỉ tác giả rút bài). */
export const ADMIN_NEXT_SUBMISSION_STATUSES: Record<ContestSubmissionStatus, ContestSubmissionStatus[]> = {
  submitted: ["eligible", "ineligible", "disqualified"],
  eligible: ["ineligible", "shortlisted", "disqualified"],
  ineligible: ["eligible", "disqualified"],
  withdrawn: [],
  disqualified: [],
  shortlisted: ["disqualified"],
};

/** Chuyển bắt buộc nhập lý do (hiển thị cho tác giả). */
export const REASON_REQUIRED: ContestSubmissionStatus[] = ["ineligible", "disqualified"];

/** Mã cờ "Cần bổ sung" hay dùng (admin vẫn nhập được mã khác). */
export const COMMON_FLAG_CODES: { code: string; label: string }[] = [
  { code: "synopsis_too_short", label: "Tóm tắt quá ngắn / sơ sài" },
  { code: "missing_cover", label: "Thiếu bìa" },
  { code: "wrong_genre", label: "Sai thể loại so với nội dung" },
  { code: "presentation_rules", label: "Tựa / bìa vi phạm quy định trình bày" },
  { code: "below_min_chapters_at_close", label: "Dưới số chương tối thiểu" },
  { code: "below_min_words_at_close", label: "Dưới số chữ tối thiểu" },
];
