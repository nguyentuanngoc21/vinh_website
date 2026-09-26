/**
 * Lỗi nghiệp vụ của cuộc thi. RPC/trigger trong
 * migrations/20260926_add_contest_engine_core.sql trả mã qua `hint`; bảng
 * dưới đổi mã thành HTTP status + thông báo tiếng Việt, dùng chung cho mọi
 * route web và mobile.
 */
const CATALOG = {
  contest_not_found: [404, "Không tìm thấy cuộc thi."],
  submission_not_found: [404, "Không tìm thấy bài dự thi."],
  book_not_found: [404, "Không tìm thấy truyện."],
  user_not_found: [404, "Không tìm thấy tài khoản."],
  not_logged_in: [401, "Vui lòng đăng nhập."],
  not_owner: [403, "Bạn không phải tác giả của truyện này."],
  not_admin: [403, "Chỉ quản trị viên được thực hiện thao tác này."],
  not_allowed: [403, "Bạn không được thực hiện thao tác này."],
  submission_closed: [409, "Cuộc thi không còn nhận bài."],
  rules_version_mismatch: [409, "Thể lệ cuộc thi không khớp phiên bản bạn đã đồng ý. Vui lòng tải lại trang và đồng ý thể lệ."],
  book_not_visible: [409, "Truyện cần đang được xuất bản để dự thi."],
  paid_chapters: [409, "Mọi chương cần miễn phí (cả giá đọc và giá audio) trước khi gửi dự thi."],
  not_exclusive: [409, "Cuộc thi chỉ nhận truyện Độc quyền trên Vịnh."],
  multi_contest_conflict: [409, "Truyện đang dự một cuộc thi không cho phép dự thêm cuộc thi khác."],
  max_entries_reached: [409, "Bạn đã gửi đủ số tác phẩm tối đa cho cuộc thi này."],
  already_submitted: [409, "Tác phẩm đã dự thi cuộc thi này."],
  not_eligible: [422, "Tác phẩm chưa đủ điều kiện dự thi."],
  withdraw_closed: [409, "Đã quá hạn rút bài dự thi."],
  no_change: [409, "Bài dự thi đã ở trạng thái này."],
  reason_required: [400, "Cần nhập lý do."],
  invalid_status_transition: [409, "Không thể chuyển sang trạng thái này."],
  voting_closed: [409, "Bình chọn chưa mở hoặc đã kết thúc."],
  entry_not_votable: [409, "Tác phẩm này không nhận bình chọn."],
  own_entry: [403, "Bạn không thể bình chọn cho tác phẩm của mình."],
  account_too_new: [403, "Tài khoản cần đủ số ngày tuổi theo thể lệ để bình chọn."],
  no_completed_chapter: [403, "Hãy đọc hết ít nhất 1 chương của tác phẩm trước khi bình chọn."],
  already_voted: [409, "Bạn đã bình chọn cho tác phẩm này."],
  ranking_not_visible: [403, "Bảng xếp hạng này chưa được công bố."],
  invalid_sort: [400, "Kiểu sắp xếp không hợp lệ."],
  invalid_cursor: [400, "Tham số phân trang không hợp lệ."],
  invalid_flag: [400, "Mã cờ hoặc cách xử lý không hợp lệ."],
  flag_exists: [409, "Bài đã có cờ này đang chờ xử lý."],
  flag_not_found: [404, "Không tìm thấy cờ đang mở."],
  invalid_input: [400, "Dữ liệu không hợp lệ."],
  award_locked: [409, "Giải đã công bố hoặc đã chi trả — hãy thu hồi thay vì xoá."],
  award_not_found: [404, "Không tìm thấy giải thưởng."],
  award_exists: [409, "Bài này đã có giải với mã này."],
  slug_taken: [409, "Đường dẫn (slug) đã được dùng cho cuộc thi khác."],
  rules_locked: [409, "Thể lệ đã khoá sau khi cuộc thi công khai."],
  scoring_locked: [409, "Công thức chấm đã khoá từ lúc mở bình chọn."],
  config_incomplete: [422, "Cấu hình cuộc thi chưa đủ."],
  voting_window_missing: [422, "Cần đặt thời gian bình chọn trước khi mở bình chọn."],
  contest_not_deletable: [409, "Chỉ xoá được cuộc thi còn ở bản nháp."],
  contest_must_start_draft: [400, "Cuộc thi mới phải bắt đầu ở bản nháp."],
  contest_paid_chapter: [409, "Truyện đang dự thi nên mọi chương phải miễn phí cho đến khi công bố kết quả."],
  contest_exclusive_lock: [409, "Truyện đang dự cuộc thi yêu cầu độc quyền nên không tắt được độc quyền cho đến khi công bố kết quả."],
} as const satisfies Record<string, readonly [number, string]>;

export type ContestErrorCode = keyof typeof CATALOG;

export class ContestError extends Error {
  readonly code: ContestErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ContestErrorCode, details?: unknown) {
    super(CATALOG[code][1]);
    this.code = code;
    this.status = CATALOG[code][0];
    this.details = details;
  }
}

export function isContestErrorCode(code: unknown): code is ContestErrorCode {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(CATALOG, code);
}

/**
 * Đổi lỗi Supabase (PostgrestError) thành ContestError nếu mang mã nghiệp
 * vụ trong `hint`; lỗi khác (mạng, bug) ném lại nguyên bản để route trả 500.
 */
export function toContestError(error: { hint?: string | null; message?: string } | null | undefined): ContestError | null {
  if (error && isContestErrorCode(error.hint)) return new ContestError(error.hint);
  return null;
}

export function throwIfError(error: { hint?: string | null; message?: string } | null | undefined, context: string): void {
  if (!error) return;
  const mapped = toContestError(error);
  if (mapped) throw mapped;
  throw new Error(`${context}: ${error.message ?? "unknown error"}`);
}
