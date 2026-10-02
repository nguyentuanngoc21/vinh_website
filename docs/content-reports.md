# Báo cáo tác phẩm/chương

Chạy `migrations/20261002_content_reports.sql` trong Supabase SQL Editor trước khi triển khai code. Migration không cần cron hoặc Vault. Với database mới, dùng baseline đã cập nhật.

Người dùng đăng nhập có thể báo cáo tác phẩm công khai hoặc chương đang xuất bản từ trang tác phẩm/trang đọc. Lý do gồm nội dung phản cảm, thiếu/sai nhãn độ tuổi và nghi ngờ đạo văn. Mô tả bắt buộc; liên kết nguồn đối chiếu tùy chọn, chỉ chấp nhận HTTP/HTTPS. Hệ thống không truy cập liên kết này.

`/admin/bao-cao` hiển thị báo cáo theo thời gian, phân trang 30 dòng. Admin có thể chuyển sang đang xem xét, đã xử lý hoặc không đủ căn cứ. Đóng báo cáo yêu cầu ghi chú; lưu người xử lý và thời gian. Dùng liên kết quản lý tác phẩm để gỡ tác phẩm/chương qua công cụ hiện có. Báo cáo không tự gỡ nội dung. Nút "Sửa nhãn độ tuổi" trên mỗi báo cáo mở hộp sửa nhãn của tác phẩm (xem `migrations/20261002_book_age_ratings.sql`): admin đặt độ tuổi/cảnh báo, bắt buộc lý do, mặc định khoá nhãn; lịch sử ghi người sửa và thời gian. Báo cáo đã đóng hiển thị người xử lý.

Danh tính người báo cáo không công khai. Bảng chỉ cho service role truy cập; API xác minh phiên đăng nhập và quyền admin hiện tại. Index duy nhất chặn báo cáo trùng đang mở trên cùng tác phẩm/chương cho mỗi người. Giới hạn 10 lượt gửi/giờ/người dùng là best-effort theo server instance; chưa phải giới hạn phân tán.

Kiểm tra sau triển khai: gửi từng lý do ở trang tác phẩm và chương; thử gửi trùng; thử gửi khi chưa đăng nhập; kiểm tra admin thấy báo cáo, mở nguồn đối chiếu, cập nhật trạng thái và ghi chú. Tài khoản thường không được truy cập API quản trị hoặc bảng báo cáo trực tiếp.
