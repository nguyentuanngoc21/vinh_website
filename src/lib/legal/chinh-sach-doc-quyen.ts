// Bản NHÁP, viết tay — không có file ".docx" nguồn trong docs/ như hai văn
// bản kia (dieu-khoan-su-dung.ts, chinh-sach-bao-mat.ts). Khi có bản
// Word chính thức: đặt tên "Chính sách độc quyền xuất bản - UTD ddMMyyyy.docx"
// vào docs/, thêm 1 entry vào DOCS trong scripts/convert-legal-docs.mjs rồi
// chạy `node scripts/convert-legal-docs.mjs` — script sẽ ghi đè file này.
//
// Ngày cập nhật dưới đây (chinhSachDocQuyenUpdatedAt) là ngày soạn bản nháp
// này; đổi cùng lúc với nội dung mỗi khi sửa tay, và đổi lại một lần nữa khi
// bản .docx thật thay thế nó.

export const chinhSachDocQuyenHtml =
  "<p><strong>Chính sách độc quyền xuất bản</strong></p>" +
  "<p><em>Bản nháp — áp dụng cho tác giả đăng ký xuất bản tác phẩm ở chế độ độc quyền trên Vịnh Câu Chuyện.</em></p>" +
  "<h1><strong>1. Phạm vi độc quyền</strong></h1>" +
  "<p>Tác phẩm tham gia chương trình độc quyền không được đăng tải trên bất kỳ nền tảng đọc trực tuyến nào khác trong 12 tháng kể từ ngày xuất bản chương đầu tiên ở chế độ độc quyền.</p>" +
  "<h1><strong>2. Quyền lợi kèm theo</strong></h1>" +
  "<p>Tác phẩm độc quyền được ưu tiên đề xuất trên trang chủ, nhận tỷ lệ chia doanh thu 80% (so với 70% của tác phẩm tự do) và một gói thiết kế bìa miễn phí từ Vịnh Studio.</p>" +
  "<h1><strong>3. Chấm dứt sớm</strong></h1>" +
  "<p>Tác giả có thể yêu cầu chấm dứt độc quyền sớm với thông báo trước 30 ngày qua trung tâm hỗ trợ. Toàn bộ quyền lợi ưu tiên tại Điều 2 dừng lại ngay khi độc quyền chấm dứt; tác phẩm đã published quá 3 ngày ở chế độ độc quyền không thể tự ý chuyển về tự do mà không qua yêu cầu này.</p>" +
  "<h1><strong>4. Điều kiện áp dụng</strong></h1>" +
  "<p>Tác giả phải xác nhận đã đọc và đồng ý Chính sách này trước khi được phép bật chế độ độc quyền cho bất kỳ tác phẩm nào. Việc xác nhận có hiệu lực cho tới khi Chính sách được cập nhật nội dung — khi đó tác giả cần xác nhận lại trước khi bật độc quyền cho tác phẩm mới hoặc tác phẩm đang độc quyền.</p>";

export const chinhSachDocQuyenUpdatedAt = "2026-08-28";
