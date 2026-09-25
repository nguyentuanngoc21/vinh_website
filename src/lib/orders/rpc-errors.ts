/**
 * Turns an exception raised by the order RPCs (migrations/20260901_add_order_*.sql,
 * 20260901_add_trust_and_disputes.sql, 20260901_add_manuscript_share.sql…) into a message
 * safe to show to users. Several routes used to return `error.message` verbatim, so users
 * (web and mobile) saw raw English SQL text like "A file request is already pending…".
 *
 * - Known messages → Vietnamese (keep in sync when an RPC adds a new `raise exception`).
 * - Messages the SQL already writes in Vietnamese → shown as-is.
 * - Anything else → the route's own fallback; the raw text is only logged server-side.
 */
const RULES: [RegExp, string][] = [
  [/NO_REFUND_POLICY/, "Dịch vụ này chưa có chính sách hoàn tiền — không thể tính tự động. Liên hệ Nền tảng để được hỗ trợ."],
  [/^Order \S+ not found/, "Không tìm thấy đơn hàng."],
  [/^Only order parties can/, "Chỉ hai bên của đơn hàng mới thực hiện được thao tác này."],
  [/^Only the seller attaches a manuscript/, "Chỉ người thực hiện mới gắn được truyện vào đơn."],
  [/^Cannot attach a manuscript to a closed order/, "Đơn đã kết thúc, không gắn truyện được nữa."],
  [/^Only ghostwriting orders can attach a manuscript/, "Chỉ đơn viết thuê mới gắn được truyện."],
  [/^Book \S+ not found or not owned by seller/, "Không tìm thấy truyện, hoặc truyện không thuộc về bạn."],
  [/^Invalid author_display choice/, "Lựa chọn đứng tên không hợp lệ."],
  [/^Order has no attached manuscript/, "Đơn chưa gắn truyện nên chưa lập được thỏa thuận đứng tên."],
  [/^An author-name agreement already exists/, "Đơn này đã có thỏa thuận đứng tên."],
  [/^Agreement already fully confirmed/, "Thỏa thuận đã được hai bên xác nhận, không thay đổi được nữa."],
  [/^Agreement \S+ not found/, "Không tìm thấy thỏa thuận."],
  [/has no pending confirmation on this agreement/, "Bạn không có bước xác nhận nào đang chờ trong thỏa thuận này."],
  [/^Cannot cancel a closed order/, "Đơn đã kết thúc, không hủy được nữa."],
  [/^A cancel request is already pending/, "Đơn đang có một yêu cầu hủy chờ xử lý."],
  [/^A file request is already pending/, "Đơn đang có một yêu cầu tệp gốc chờ xử lý."],
  [/^Request \S+ not found or already resolved/, "Yêu cầu không còn hoặc đã được xử lý."],
  [/^The requester cannot resolve their own request/, "Bạn không thể tự duyệt yêu cầu của mình — bên kia cần đồng ý."],
  [/^Cannot open a dispute on this order in status/, "Không mở được tranh chấp ở trạng thái hiện tại của đơn."],
];
// Vietnamese-only letters (plus đ); plain ASCII English never matches.
const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

export function orderErrorMessage(error: unknown, fallback: string, logLabel = "[orders]"): string {
  const message = error instanceof Error ? error.message
    : typeof error === "object" && error !== null && "message" in error ? String((error as { message: unknown }).message) : "";
  for (const [pattern, text] of RULES) if (pattern.test(message)) return text;
  if (VIETNAMESE.test(message)) return message;
  console.error(logLabel, error);
  return fallback;
}
