# Thống kê ví trong Tổng quan

## Định nghĩa

- Khả dụng: tổng `profiles.token_balance`, mọi tài khoản.
- Chờ đối soát: tổng `profiles.token_balance_pending`.
- Rút đang xử lý: `withdrawal_requests.status = 'processing'`. Khoản này đã bị trừ khỏi ví khi tạo yêu cầu, vì vậy cộng riêng đúng một lần.
- Dự phòng token cho số dư ví = khả dụng + chờ đối soát + rút đang xử lý.
- Dự phòng VND = (khả dụng + chờ đối soát) × `TOKEN_TO_VND_RATE` + tổng `amount_vnd` của yêu cầu đang xử lý. Giữ tỷ giá đã chốt của yêu cầu cũ.

Đây là kịch bản dự phòng cho số dư ví, không phải số đủ điều kiện rút ngay. Không áp dụng xác minh CCCD/ngân hàng, hạn mức theo nguồn token, số lần rút hay mức rút tối thiểu. Chưa gồm phí thanh toán, nghĩa vụ commission chưa ghi có vào ví và các cam kết chi tương lai. Chưa có nguồn số dư ngân hàng để tính khả năng bao phủ.

Tổng và danh sách ví được đọc trong cùng một snapshot SQL. Bộ lọc chỉ ảnh hưởng danh sách, không ảnh hưởng tổng. Mỗi trang 25 người, gồm cả ví bằng 0. Quyền đọc RPC chỉ cấp cho `service_role`; trang xác thực admin trước khi truy vấn.

## Cập nhật cơ sở dữ liệu

1. Chạy `migrations/20261022_admin_wallet_exposure.sql` trên dev/staging.
2. Chạy `docs/supabase/tests/20261022_admin_wallet_exposure.test.sql` trên cùng môi trường để đối chiếu tổng, phân trang và quyền truy cập.
3. Áp dụng migration trước khi triển khai code đọc RPC lên môi trường tương ứng. Không chạy baseline trên DB đang có dữ liệu.

## Kiểm tra mã

`node node_modules/vitest/vitest.mjs run src/lib/admin/wallet-exposure.test.ts src/lib/admin/get-content-trends.test.ts`

Các kiểm thử bao gồm tỷ giá đã chốt của khoản rút, cộng nghĩa vụ đúng một lần, phân trang qua giới hạn API, lỗi giữa chừng, khoảng 30 ngày và biên tháng theo giờ Việt Nam.
