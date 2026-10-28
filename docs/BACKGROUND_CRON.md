# Cron chạy khi có công việc

`20261028_idle_background_cron.sql` quản lý trạng thái của đúng hai job hiện có:

- `vinh-publish-scheduled`: giữ lịch mỗi phút khi còn lịch `pending`; dừng khi worker kiểm tra thấy không còn lịch chờ. Thêm lịch mới hoặc chuyển lịch trở lại `pending` sẽ bật job ngay trong transaction đó.
- `vinh-manuscript-imports`: bật khi thêm bản thảo. Giữ hoạt động khi còn bất kỳ dòng nào, kể cả kết quả đã hoàn tất/failed để tiếp tục dọn file khi hết hạn. Worker tự dừng sau khi dọn hết hàng đợi.

Khi công việc cuối cùng kết thúc, có thể còn một lượt cron kế tiếp để nhận biết hàng đợi rỗng rồi tự dừng. Không xoá job, lịch chạy, lịch sử, cấu hình Vault hoặc dữ liệu ứng dụng. Các cron ví/token và cron Vercel hằng ngày giữ nguyên.

Việc bật lại và kiểm tra rỗng được đồng bộ bằng advisory transaction lock để tránh mất lượt bật khi có bản thảo/lịch mới đến cùng lúc. Chỉ dùng API `cron.alter_job`, không cấp quyền sửa trực tiếp bảng `cron.job`. Hai hàm điều khiển nội bộ không cấp EXECUTE cho anon/authenticated/service_role; trigger và wrapper worker chạy với owner. Không có endpoint công khai để thay lịch cron.

Chạy migration trên dev rồi chạy `docs/supabase/tests/20261028_idle_background_cron.test.sql`. Bài test tạo cron fixture trong transaction, kiểm tra trạng thái và rollback toàn bộ; không gọi HTTP cho fixture. Sau khi test qua, áp dụng migration lên production. Không chạy test fixture trên production.

Các script setup cron đã gọi đồng bộ trạng thái sau khi đăng ký. Khi dựng mới mà chưa cài feature lịch xuất bản, phần trigger xuất bản được bỏ qua; sau khi cài `20261001_chapter_publication_schedules.sql`, chạy lại migration tối ưu này trước khi bật cron xuất bản.

Để tạm dừng vận hành dù có dữ liệu mới: tắt trigger wake tương ứng và đặt `active=false` qua `cron.alter_job`. Khi mở lại, bật trigger và gọi `sync_background_cron_activity` bằng owner. Không xem một job tự chuyển sang inactive khi hàng đợi rỗng là lỗi.

Thay đổi này giảm lượt chạy rỗng và log mới. Nó không hoàn lại Logs Query đã dùng; Logs Query chỉ tăng thêm khi đọc/quét hệ thống log. Kiểm tra trạng thái bằng `cron.job`, không cần quét lại Logs Explorer.
