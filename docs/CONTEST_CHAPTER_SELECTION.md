# Dự thi bằng chương của truyện đang viết

Tại trang gửi bài, chọn truyện → **Chọn chương của truyện đang viết** → đánh dấu các chương → **Kiểm tra các chương đã chọn** → đồng ý thể lệ → gửi bài.

- Truyện vẫn phải được xuất bản và thuộc tác giả đang đăng nhập.
- Mỗi chương được chọn phải được tạo **và xuất bản lần đầu** từ thời điểm mở nhận bài, trước thời điểm đóng nhận bài. Bản nháp tạo trước cuộc thi không hợp lệ, dù xuất bản trong cuộc thi.
- Quy định ngày xuất bản lần đầu của **truyện** được thay bằng kiểm tra thời gian của các chương được chọn. Các quy định khác của cuộc thi vẫn áp dụng.
- Số chương, số chữ, bản chụp chấm thi, lượt đọc, điều kiện bình chọn và tương tác theo chương chỉ tính danh sách đã chọn.
- Chỉ các chương dự thi phải miễn phí cả đọc và audio đến khi công bố kết quả. Các chương ngoài bài dự thi vẫn có thể thu phí, trừ khi truyện đồng thời dự cuộc thi khác bằng toàn bộ truyện.
- Danh sách được chốt khi gửi bài; chương mới thêm sau đó không tự động tham gia. Nội dung chương đã chọn vẫn sửa được đến khi đóng nhận bài. Nếu thể lệ cho phép rút và nộp lại, tác giả có thể chọn lại danh sách trước hạn.
- Trang truyện hiển thị danh sách chương dự thi với liên kết đọc trực tiếp. Giám khảo đọc bản chụp của chính các chương đó.

## Cập nhật cơ sở dữ liệu

Chạy `migrations/20261009_chapter_publication_time.sql` nếu chưa áp dụng, sau đó chạy `migrations/20261012_contest_chapter_selection.sql` trước khi triển khai code. Migration mới giữ các bài dự thi cũ ở chế độ toàn bộ truyện (`selected_chapter_ids = null`).

Ngày xuất bản của chương lịch sử đã được migration 20261009 điền bằng ngày tạo vì hệ thống trước đó chưa ghi ngày xuất bản. Chương tạo trước thời gian cuộc thi vẫn bị loại khỏi chế độ chọn chương. Với cuộc thi bao phủ thời gian dữ liệu lịch sử này, quản trị cần kiểm tra thêm bằng chứng xuất bản.

Kiểm thử DB: `docs/supabase/tests/20261012_contest_chapter_selection.test.sql` trên dev/staging. Script cố ý kết thúc bằng lỗi `PASS ... (rolled back)` để không lưu dữ liệu giả.
