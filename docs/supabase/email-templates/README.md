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
   (giữ nguyên `{{ .Token }}`, `{{ .Email }}` — đây là biến Supabase tự
   điền, không phải chữ thường).
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

Cả hai template dưới đây chỉ hiển thị **mã 6 số** (`{{ .Token }}`), KHÔNG
còn nút bấm/link (`{{ .ConfirmationURL }}`) — bản trước có cả hai song song,
nhưng link một mình không đủ tin cậy trên mobile: PKCE link chỉ đổi được
session nếu mở ĐÚNG browser đã bắt đầu request (có cookie `code_verifier`),
còn bấm link từ app Gmail/Outlook trên điện thoại thường mở sang browser
khác → luôn báo "hết hạn hoặc không hợp lệ" dù mail vừa gửi. Có cả 2 lựa
chọn trong 1 email (1 cái luôn lỗi) gây nhầm lẫn hơn là giúp, nên giờ chỉ
còn đúng một cách: nhập mã. Mã đi qua `verifyOtp` (`/api/auth/verify-otp`),
không cần browser nào cả, nên luôn hoạt động — không cần cấu hình gì thêm
trên Dashboard, `{{ .Token }}` đã tự có sẵn, chỉ cần dán lại template đã
cập nhật.

Email xác nhận đăng ký ("Confirm signup") cũng dùng chung cơ chế trên: mở
[`confirm-signup.html`](./confirm-signup.html), dán vào Supabase Dashboard →
**Authentication → Emails → Confirm signup**.

`/api/auth/confirm` (route xử lý link cũ) vẫn còn trong code nhưng không
còn email nào trỏ tới nó nữa — an toàn để giữ lại (không ai gọi tới), hoặc
xoá sau nếu muốn dọn dẹp; không bắt buộc phải xoá ngay.
