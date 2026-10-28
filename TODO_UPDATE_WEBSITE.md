# TODO cập nhật website Vịnh

## payOS — nạp/rút tự động (triển khai sau)

- [ ] Xác nhận ngân hàng nhận tiền, chủ tài khoản (cá nhân/hộ kinh doanh/doanh nghiệp) và đối tác chấp thuận mô hình token của Vịnh.
- [ ] Chọn kênh thu: QR/link thanh toán, tiền vào tài khoản theo cấu hình nhà cung cấp; kiểm tra phí, ngân hàng hỗ trợ và thời gian quyết toán.
- [ ] Chọn kênh chi: tài liệu payOS đã kiểm tra ngày 22/10/2026 yêu cầu ví Bảo Kim liên kết và được nạp tiền làm nguồn chi. Không mặc định API chi sẽ tự trừ tài khoản ngân hàng của Vịnh. Xác nhận lại khi triển khai.
- [ ] Đăng ký/kích hoạt dịch vụ, chuẩn bị thông tin xác thực, API key, checksum key, IP máy chủ nếu được yêu cầu. Không lưu khóa vào Git.
- [ ] Nạp: tạo đơn, kiểm tra chữ ký webhook, số tiền và mã đơn, cộng token đúng một lần; xử lý webhook trễ/trùng và giao dịch thiếu/thừa tiền.
- [ ] Rút: hàng đợi và khóa số dư, ID lệnh chi duy nhất, hạn mức, trạng thái chưa rõ kết quả; truy vấn lại trước khi gửi lại/hoàn token. Tắt hoặc xác thực callback rút giả lập hiện tại trước khi mở tiền thật.
- [ ] Đồng bộ số dư nguồn chi và giao dịch thật vào phần ngân quỹ/đối soát; lưu riêng tiền ngân hàng, tiền đang chuyển và tiền ở nguồn chi để tránh cộng trùng.
- [ ] Xác nhận yêu cầu pháp lý và hợp đồng cho mô hình nạp–chi tiêu–rút; thử sandbox/staging trước khi bật tiền thật.

Tài liệu: https://payos.vn/docs/api/ và https://payos.vn/dang-ky-dich-vu-chi-ho/.

## Ngân quỹ — giai đoạn sau bản thủ công

- [ ] Tách số dư theo từng tài khoản và nguồn chi; kết nối API khi được ngân hàng/đối tác cấp quyền.
- [ ] Mở rộng dự phòng sang tiền commission chưa ghi có vào ví, hoàn tiền/tranh chấp và lịch chi 7/30 ngày.
- [ ] Đối soát hai chiều tự động, phát hiện giao dịch nội bộ chưa có sao kê theo kỳ chốt được xác nhận đầy đủ.
