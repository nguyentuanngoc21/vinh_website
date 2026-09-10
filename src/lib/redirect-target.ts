/**
 * Chuẩn hoá 1 giá trị "next"/callback URL thành đường dẫn AN TOÀN để
 * redirect tới — chỉ chấp nhận đường dẫn NỘI BỘ ("/..." nhưng không phải
 * "//..."), vì "//evil.com" vẫn được trình duyệt hiểu là URL tuyệt đối
 * (protocol-relative), có thể bị lợi dụng làm open redirect ra domain
 * khác. Không có gì khác — module thuần TS, không đụng React/DOM/cookie —
 * nên dùng được ở CẢ client (redirect sau khi đăng nhập/đăng ký, xem
 * login-form.tsx/register-form.tsx) LẪN server (dựng `emailRedirectTo` cho
 * link xác nhận email, xem api/auth/register, api/auth/resend-otp) mà
 * không lệch quy tắc giữa 2 nơi.
 */
export function resolveRedirectTarget(nextPath: string | null | undefined, fallback = "/"): string {
  if (nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")) return nextPath;
  return fallback;
}
