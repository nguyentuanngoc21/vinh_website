/**
 * Mục 8 đặc tả — phát hiện (không chặn) trao đổi giao dịch ngoài nền
 * tảng trong tin nhắn: SĐT Việt Nam, chuỗi số dài kiểu số tài khoản ngân
 * hàng, và các từ khoá thường đi kèm ("chuyển khoản", "zalo", "stk"...).
 * Cố ý RỘNG (nhiều false positive hơn false negative) — hệ quả chỉ là 1
 * icon cảnh báo nhỏ cho CHÍNH người gửi thấy, không chặn gửi, nên thà bắt
 * nhầm còn hơn bỏ sót (xem route gọi hàm này).
 */

const VN_PHONE_RE = /(?:\+?84|0)(?:3|5|7|8|9)\d{8}\b/;
const LONG_DIGIT_SEQUENCE_RE = /\b\d{8,19}\b/; // số tài khoản ngân hàng thường 8-19 chữ số
const OFF_PLATFORM_KEYWORD_RE = /chuyển khoản|zalo|stk|số tài khoản|momo|viettel ?pay|facebook\.com|fb\.com|gặp ngoài|ngoài (?:app|ứng dụng|nền tảng)/i;

export function isLikelyOffPlatform(text: string): boolean {
  return VN_PHONE_RE.test(text) || LONG_DIGIT_SEQUENCE_RE.test(text) || OFF_PLATFORM_KEYWORD_RE.test(text);
}
