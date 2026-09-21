# Báo cáo kiểm thử bảo mật — 21/09/2026

## Phạm vi và kết luận

Đã hoàn thành đợt rà soát mã nguồn có trọng tâm và tái hiện cô lập trong workspace `D:\Vinh_update`. Phát hiện 4 vấn đề, trong đó 3 vấn đề mức Cao và 1 vấn đề mức Trung bình có điều kiện. Mức độ là đánh giá định tính theo tác động và điều kiện bên dưới, không phải điểm CVSS đã hiệu chỉnh cho hệ thống triển khai.

Đây **không phải pentest toàn diện trên website đang triển khai**: chưa có URL/môi trường staging và tài khoản thử nghiệm được cung cấp. Không gửi yêu cầu đến Supabase, cổng thanh toán hoặc production; không thực hiện chuyển tiền, xóa dữ liệu hay khai thác tài khoản thật. Các kết quả động sử dụng hàm thật trong mã nguồn với database, dịch vụ và response được giả lập. Chưa kiểm tra end-to-end qua HTTP/Next.js, trình duyệt, cấu hình CDN/WAF, RLS thực tế hay CVE dependency. Không khẳng định mọi endpoint đã được kiểm tra.

## F01 — Cao: callback rút tiền không xác thực

- Vị trí: `src/app/api/wallet/withdraw/callback/route.ts`, hàm `POST`; `src/lib/wallet/withdrawal-service.ts`, `handlePayoutResult`; `docs/supabase/schema.sql`, `mark_withdrawal_result`.
- Callback nhận `requestId`, `success`, `gatewayRef` từ JSON và gọi service-role RPC mà không kiểm tra chữ ký hoặc thông tin xác thực của cổng chi trả.
- Tái hiện cô lập: POST không cookie, không Authorization, không chữ ký, chứa UUID giả và `success: false`; handler trả 200 và gọi dịch vụ xử lý kết quả một lần.
- Tác động: người biết ID yêu cầu đang `processing` có thể giả mạo thành công/thất bại. SQL mô tả hoàn token khi thất bại; nếu kết nối chi trả thật, có rủi ro sai đối soát hoặc hoàn token sau khi đã trả tiền. Chưa chứng minh thiệt hại tiền thật; dịch vụ hiện ghi chú chưa tích hợp gateway chi trả. UUID không dễ đoán, nhưng tính bí mật của UUID không thay thế xác thực callback.
- Khắc phục: đóng callback cho tới khi có gateway; sau đó xác minh chữ ký trên raw body, đối chiếu giao dịch/số tiền và chống replay. Chỉ cập nhật trạng thái sau khi xác minh thành công. Kiểm tra idempotency hiện có không ngăn lần giả mạo đầu tiên.

## F02 — Cao: cron bỏ qua xác thực khi thiếu CRON_SECRET

- Các route: `api/wallet/cron/settle-pending`, `api/orders/cron/auto-confirm`, `api/admin/cron/purge-deleted-content`, `api/auth/cron/purge-unconfirmed-registrations`.
- Mã nguồn dùng `if (secret)` để kiểm tra Bearer; nhánh thiếu secret chỉ ghi lỗi rồi tiếp tục tác vụ có quyền service-role.
- Tái hiện cô lập trên settle-pending: env trống + GET không Authorization → 200 và gọi settlement. Đối chứng: cấu hình secret + cùng yêu cầu → 401, không gọi settlement.
- Tác động có điều kiện: khi triển khai thiếu secret, khách có thể kích hoạt dọn dữ liệu/nội dung hoặc xử lý giao dịch. Các bộ lọc về trạng thái/thời hạn vẫn áp dụng; không kết luận có thể xóa tùy ý hay xử lý trước hạn. Chưa xác minh biến môi trường production.
- Khắc phục: trả lỗi và dừng ngay khi secret thiếu; kiểm tra cấu hình lúc triển khai. Thêm kiểm thử thiếu secret, sai secret và secret hợp lệ cho cả bốn route.

## F03 — Cao: phiên cookie tự ký không có cơ chế thu hồi phía server

- Vị trí: `src/lib/session.ts` (`decodeSession`, `requireAdmin`), `src/lib/wallet/session.ts` (`getAuthedUserId`), `src/app/api/auth/logout/route.ts`.
- Cookie tự ký sống tối đa 30 ngày. Logout xóa cookie phía trình duyệt và gọi Supabase signOut, nhưng không vô hiệu hóa bản sao cookie đã được lấy trước đó. `getAuthedUserId` ưu tiên cookie này và trả ID sau lookup profile mà không gọi Supabase `getUser`.
- Tái hiện cô lập: cookie hợp lệ với secret chỉ dùng cho test + profile giả → trả ID người dùng, số lần kiểm tra Supabase auth bằng 0. Test này chứng minh nhánh bỏ qua kiểm tra thu hồi; không đăng nhập/đăng xuất tài khoản thật.
- Điều kiện: kẻ tấn công phải có bản sao cookie hợp lệ; không phát hiện cách giả mạo HMAC. Cookie bị sửa và cookie hết hạn đều bị từ chối trong kiểm thử đối chứng.
- Tác động: đăng xuất/thu hồi phiên Supabase không đảm bảo chặn bản sao cookie khỏi các API dùng helper này. `requireAdmin` cũng đọc role cũ trong cookie; admin đã bị hạ quyền có thể vẫn vượt guard trang. Helper `getAuthedAdminId` có kiểm tra role hiện tại trong DB, nên không quy kết mọi API admin bị ảnh hưởng.
- Khắc phục: thống nhất một nguồn phiên có kiểm tra thu hồi; hoặc lưu session ID/version gắn UUID bất biến và kiểm tra phía server. Thu hồi khi logout, đổi mật khẩu hoặc khóa tài khoản; kiểm tra quyền hiện tại tại nơi truy cập dữ liệu admin.

## F04 — Trung bình, có điều kiện: adapter nạp tiền thử nghiệm vẫn công khai

- Vị trí: `src/lib/wallet/deposit-service.ts` (`stubGatewayAdapter`, `ADAPTERS`), `src/app/api/wallet/deposit/webhook/route.ts`.
- Webhook mặc định chọn `stub` khi không truyền gateway. Adapter này chấp nhận JSON không chữ ký, không có điều kiện giới hạn môi trường.
- Tái hiện cô lập: sự kiện success giả được adapter chấp nhận khi headers trống.
- Điều kiện tác động: cần tồn tại đơn pending với `payment_gateway = 'stub'` và đúng `gateway_order_id`. Service có lọc gateway; luồng tạo đơn hiện tại tạo `zalopay`, nên chưa chứng minh có thể dùng stub để cộng tiền cho đơn ZaloPay. Không thực hiện cộng tiền trong test và không xác minh có đơn stub trên production.
- Khắc phục: loại stub khỏi runtime triển khai; gateway phải được chọn rõ ràng trong allowlist, thiếu/không hợp lệ phải bị từ chối. Nếu cần adapter thử nghiệm, chỉ bật bằng cấu hình test riêng và không dùng dữ liệu thật.

## Bằng chứng và cách chạy lại

Chạy tại gốc dự án:

```powershell
node scripts/security-review.cjs
```

Kết quả ngày kiểm tra: exit code 0; tái hiện thành công 4 hành vi nêu trên; đối chứng cookie bị sửa/hết hạn và cron có secret đều chặn đúng.

Harness không đọc `.env`, không mở kết nối mạng và chặn import chưa được mock. Nó transpile các module TypeScript đang có rồi gọi trực tiếp với dependency giả; không thay thế kiểm thử tích hợp.

Đã xem thêm guard admin, auth login/logout/reset, cấu hình Next.js, helper Supabase và một phần SQL về RLS/quyền cập nhật profiles. Không thấy các file `.env.local`, `.env.prod`, `python-service/.env` nằm trong kết quả `git ls-files` hiện tại; điều này không chứng minh lịch sử Git hoặc hệ thống triển khai chưa từng lộ secret.

## Thứ tự xử lý

1. Đóng hoặc xác thực callback rút tiền; bắt buộc secret cho cả bốn cron.
2. Bổ sung thu hồi cookie và kiểm tra quyền admin hiện tại.
3. Loại adapter stub khỏi môi trường triển khai.
4. Kiểm thử lại trên staging với tài khoản nhiều vai trò, dữ liệu giả và gateway sandbox; mở rộng sang IDOR, upload, XSS, CSRF, RLS thực tế và dependency audit.

Đợt này chỉ thêm báo cáo và script tái hiện; chưa sửa logic ứng dụng. Các thay đổi tài liệu bảng tính có sẵn trong workspace được giữ nguyên.
