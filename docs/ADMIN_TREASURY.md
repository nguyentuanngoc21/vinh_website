# Ngân quỹ và đối soát thủ công

Phần này nằm ở Tổng quan `/admin`. Chưa kết nối ngân hàng, chưa tạo lệnh chuyển tiền.

## Số dư và dự trữ

Admin nhập **tổng tiền khả dụng dành riêng cho chi trả**, thời điểm xác nhận theo giờ Việt Nam, dự phòng phí và ghi chú nguồn/phạm vi tài khoản. Không cộng trùng tiền đã chuyển giữa ngân hàng và nguồn chi; không gồm tiền phong tỏa hay tiền dành cho vận hành.

- Nhu cầu dự trữ = dự phòng số dư ví (khả dụng + chờ đối soát + khoản rút đang xử lý theo số VND đã chốt) + phí dự phòng nhập tay.
- Thiếu hụt = max(0, nhu cầu dự trữ − tiền khả dụng đã xác nhận).
- Bao phủ = tiền khả dụng / nhu cầu dự trữ × 100%. Nếu nghĩa vụ bằng 0, hiển thị “—”.
- Chưa có bản xác nhận: hiển thị chưa xác định, không mặc định số dư bằng 0.
- Chọn bản có thời điểm xác nhận mới nhất, không phải bản được nhập cuối cùng. Cảnh báo khi đã quá 24 giờ. Số dư cũ so với nghĩa vụ hiện tại chỉ là ước tính, không phản ánh tiền ngân hàng trực tiếp.
- Sao kê không tự thay đổi số dư xác nhận. Cần nhập một bản xác nhận mới sau khi kiểm tra ngân hàng. Mọi bản cũ được giữ lại; UI hiển thị 5 bản gần nhất.

Phạm vi chưa bao gồm tiền commission chưa ghi có vào ví, tranh chấp/hoàn tiền tương lai và phí chưa dự phòng. Các nghĩa vụ này không được mặc định bằng 0.

## Chuẩn CSV

UTF-8, có thể có BOM; dấu phẩy phân cột, dấu ngoặc kép theo RFC4180. Tối đa 200 KB và 200 giao dịch/lần. Không đưa dữ liệu tài khoản người nhận không cần thiết vào tệp.

```csv
external_id,direction,amount_vnd,fee_vnd,occurred_at,reference_type,reference_id
BANK-001,in,100000,0,2026-10-22T10:00:00+07:00,,
```

- `source`: nhập riêng trên form, mã cố định duy nhất cho một tài khoản/nguồn ngân hàng. Không đổi mã nguồn để nhập lại cùng sao kê.
- `external_id`: mã giao dịch duy nhất do nguồn ngân hàng cung cấp. Bản trùng cùng `(source, external_id)` và cùng nội dung được bỏ qua; khác nội dung thì từ chối toàn bộ lần nhập để tránh sửa bằng chứng âm thầm.
- `direction`: `in` (thu) hoặc `out` (chi). `amount_vnd` là tiền gốc dương chưa trừ phí; phí ở `fee_vnd`. Chỉ dùng số nguyên, không dấu phân cách; tối đa 1.000 tỷ VND mỗi giá trị.
- `occurred_at`: ISO 8601 có múi giờ. Không dùng thời gian địa phương thiếu offset.
- `reference_type`: `deposit` hoặc `withdrawal`; `reference_id` là UUID của `deposit_transactions.id` hoặc `withdrawal_requests.id`, **không phải** ID sổ token `transactions.id`. Có thể để trống cả hai rồi liên kết trên UI.
- Cần chuẩn hóa sao kê ngân hàng sang mẫu này trước khi nhập. Các cột phí và tiền gốc phải được đối chiếu theo cách ngân hàng xuất dữ liệu; không đoán định dạng số tiền.

## Kết quả đối soát

Một dòng chỉ “Khớp” khi đúng ID, đúng chiều thu/chi, đúng tiền gốc, trạng thái nội bộ `success`, và chỉ có một dòng sao kê liên kết với giao dịch nội bộ đó. Phí được tổng hợp riêng trên tất cả dữ liệu đã nhập, không được dùng làm doanh thu hoặc tự trừ vào số dư xác nhận.

Các trường hợp cần kiểm tra: chưa liên kết, không tìm thấy ID, trùng tham chiếu, sai chiều, lệch tiền, nội bộ chưa thành công (bao gồm pending/processing/failed). Phần đối chiếu chiều ngược đếm giao dịch nội bộ thành công chưa có liên kết trên toàn lịch sử và hiển thị 10 dòng mới nhất. Chưa có khái niệm “kỳ sao kê đã đầy đủ”, vì vậy các dòng này không chứng minh mất tiền.

Liên kết/sửa/bỏ tham chiếu phải nhập lý do. Bản sao kê gốc giữ nguyên; mỗi thay đổi thêm một dòng audit với admin thực hiện. Không xác nhận nạp/rút hoặc thay đổi token từ màn hình này. Không dùng kết quả “khớp” để khẳng định giao dịch ngân hàng là thật ngoài độ tin cậy của tệp admin nhập.

## Triển khai và kiểm tra

Áp dụng `migrations/20261023_admin_treasury.sql` trên dev/staging sau migration exposure ngày 22/10. Chạy `docs/supabase/tests/20261023_admin_treasury.test.sql` bằng SQL Editor owner; fixture được rollback. Chỉ triển khai code đọc RPC vào môi trường đã có migration tương ứng. Không chạy baseline trên DB đang có dữ liệu.

Kiểm tra UI: không có snapshot → lưu snapshot 0 → nhập số dư mới → nhập CSV → nhập lại CSV → sửa tham chiếu → kiểm tra lỗi sai tiền/trùng tham chiếu. Thử bằng tài khoản thường: API phải từ chối. Các bảng bật RLS, không cấp đọc/ghi trực tiếp cho anon/authenticated; API kiểm tra vai trò mới nhất và gắn người thực hiện phía server.

payOS/API ngân hàng được theo dõi ở `TODO_UPDATE_WEBSITE.md`.
