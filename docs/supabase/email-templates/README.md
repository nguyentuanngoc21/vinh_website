# Email templates

Có **hai thứ khác nhau** quyết định email trông "từ Vịnh" hay "từ Supabase":

| | Quyết định cái gì | Sửa ở đâu |
|---|---|---|
| **SMTP** | Địa chỉ + tên hiển thị ở dòng "From" trong hộp thư người nhận | Mục 1 dưới — **làm trước** |
| **Template** (`reset-password.html`) | Nội dung/giao diện email (chữ, màu, nút bấm) | Mục 2 dưới |

Phải làm mục 1 trước: Dashboard hiện tại của Supabase khoá hẳn ô
Subject/Body ở Email Templates cho tới khi Custom SMTP được bật (banner
"Set up custom SMTP to edit templates") — không phải chỉ để đổi "From" mà
thiếu SMTP thì mục 2 không bấm sửa được luôn.

## 1. Bật Custom SMTP — bắt buộc để mở khoá template

Vào **Authentication → Emails**, bấm **"Set up SMTP"**, điền:

- **Sender email**: `no-reply@<domain-của-bạn>` (vd `no-reply@vinh.vn`) —
  cần domain đã xác thực SPF/DKIM ở nơi cấp SMTP, nếu không nhiều hộp thư sẽ
  đưa email vào spam.
- **Sender name**: `Vịnh`
- **Host / Port / Username / Password**: lấy từ nhà cung cấp SMTP. Vài lựa
  chọn phổ biến: Resend (free tier ~3.000 email/tháng, setup nhanh), Google
  Workspace SMTP (nếu domain đã dùng Gmail cho công việc), SendGrid,
  Mailgun, Amazon SES.

Save xong, quay lại **Authentication → Emails → Reset password** — ô
Subject/Body sẽ mở khoá.

## 2. Áp dụng template nội dung

1. Mở [`reset-password.html`](./reset-password.html), sửa chữ/màu nếu muốn
   (giữ nguyên `{{ .ConfirmationURL }}`, `{{ .Email }}` — đây là biến
   Supabase tự điền, không phải chữ thường).
2. Vào Supabase Dashboard → **Authentication → Emails → Reset password**.
3. Ô **Subject**: đặt ví dụ `Đặt lại mật khẩu — Vịnh`.
4. Ô **Body**: bấm **Source** (chuyển sang chế độ sửa HTML thô — mặc định
   là chế độ Preview/WYSIWYG), xoá hết nội dung mặc định, dán toàn bộ nội
   dung file `reset-password.html` vào.
5. Save changes. Test lại bằng luồng quên mật khẩu thật trên web (Supabase
   không có nút "gửi thử" tách riêng).

Các biến dùng được trong mọi template (không phải chỉ Reset Password):
`{{ .SiteURL }}`, `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .Token }}`,
`{{ .TokenHash }}`. Chi tiết: [Supabase Auth Email Templates
docs](https://supabase.com/docs/guides/auth/auth-email-templates).

Email xác nhận đăng ký ("Confirm signup") cũng dùng chung cơ chế trên: mở
[`confirm-signup.html`](./confirm-signup.html), dán vào Supabase Dashboard →
**Authentication → Emails → Confirm signup**. Route `signUp()` trong
`src/app/api/auth/register/route.ts` đã set `emailRedirectTo` trỏ về
`/api/auth/confirm?next=/` — cùng route xử lý code với luồng quên mật khẩu,
chỉ khác `next` đích đến sau khi đổi code lấy session.
