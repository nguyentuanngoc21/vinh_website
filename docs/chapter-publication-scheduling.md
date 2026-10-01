# Hẹn giờ đăng chương

## Trước khi triển khai

1. Áp dụng `migrations/20261001_chapter_publication_schedules.sql` trong dev/staging, chạy `docs/supabase/tests/20261001_chapter_publication_schedules.test.sql`, rồi áp dụng migration ở môi trường triển khai.
2. Đặt `CRON_SECRET` ở môi trường triển khai. Không để bộ lập lịch gọi endpoint khi thiếu secret.
3. Cấu hình gọi `GET /api/authoring/cron/publish-scheduled` mỗi phút với header `Authorization: Bearer <CRON_SECRET>`.

Vercel Pro hỗ trợ cron mỗi phút; Hobby chỉ hỗ trợ mỗi ngày và không phù hợp hẹn giờ theo phút. Nếu dùng Pro, thêm mục sau vào `crons` trong `vercel.json`, giữ các mục hiện có:

```json
{"path":"/api/authoring/cron/publish-scheduled","schedule":"* * * * *"}
```

Nếu dùng bộ lập lịch ngoài, gọi cùng endpoint mỗi phút với header secret. Không đăng ký đồng thời hai bộ lập lịch. Tài liệu chính thức: https://vercel.com/docs/cron-jobs/usage-and-pricing

Không tự thêm cron mỗi phút vào cấu hình chung vì chưa xác định gói triển khai; tránh làm lỗi deploy của dự án Hobby.

## Dùng Supabase Cron khi Vercel đang ở gói Hobby

Sau khi mã mới đã deploy Production:

1. Trong Supabase Vault, tạo `publication_site_url` chứa origin HTTPS Production và `publication_cron_secret` chứa đúng giá trị `CRON_SECRET` Production trên Vercel. Nhập secret trực tiếp trong Dashboard; không lưu vào Git hoặc gửi qua chat.
2. Chạy `scripts/setup-publication-cron.sql` trong SQL Editor của đúng project Production. Script kiểm tra Vault, bật `pg_cron`/`pg_net`, và tạo job `vinh-publish-scheduled` mỗi phút. Chạy lại script cập nhật cùng job, không tạo thêm job trùng.
3. Kiểm tra job trong Supabase Cron. Job không xuất hiện trong Vercel Cron Jobs vì do Supabase chạy.
4. Hẹn một chương thử sau 3–5 phút. Kiểm tra HTTP 200 và trạng thái “Đã hoàn tất”. Các câu SQL kiểm tra được ghi ở cuối script; không truy vấn header hoặc secret.

Job chỉ gọi HTTP khi có lịch đến hạn. “Succeeded” trong Cron History chỉ xác nhận đã xếp yêu cầu HTTP vào hàng đợi; cần xem `net._http_response.status_code` hoặc Vercel Logs để xác nhận xử lý thành công. Nếu HTTP 401, đối chiếu giá trị secret ở Vault với Vercel; nếu 404, kiểm tra mã mới đã deploy và domain đang trỏ tới deployment đó.

Tài liệu: [Supabase Cron](https://supabase.com/docs/guides/cron/quickstart), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net), [Vault](https://supabase.com/docs/guides/database/vault).

## Hành vi

- Chọn chương nháp và giá ở trang tổng quan, nhập thời gian theo Việt Nam (UTC+7), chọn đăng cùng lúc hoặc mỗi ngày một chương.
- Giá để trống giữ giá tại thời điểm thực thi; giá nhập rõ được lưu trong lịch. Nội dung là nội dung chương tại thời điểm thực thi, không phải bản chụp lúc hẹn giờ.
- Thứ tự đăng theo `order_index` tại lúc tạo lịch. Đổi thứ tự truyện sau đó không đổi lịch đã lưu.
- Lịch được xử lý ở lượt quét đầu tiên sau thời điểm hẹn, không cam kết chính xác từng giây. Mỗi lượt quét xử lý tối đa 50 lịch. Lịch mỗi ngày bị trễ nhiều ngày sẽ bắt kịp từng chương qua các lượt quét.
- Huỷ lịch chỉ huỷ các lượt còn lại, không đưa chương đã đăng về nháp.
- Một chương không thể nằm trong hai lịch đang chờ. Retry HTTP dùng cùng mã lịch không tạo trùng.
- Khi đến giờ, kiểm tra lại chủ truyện, truyện bị xoá, chương bị gỡ/xoá, phiên bản thỏa thuận độc quyền và các trigger cuộc thi/giá hiện có.
- Cập nhật chương, công khai truyện, nhiệm vụ và tiến độ lịch nằm trong cùng giao dịch cho từng lịch. Cron chạy trùng dùng khóa hàng và `SKIP LOCKED`.
- Lỗi chuyển lịch sang “Cần xử lý” và lưu lý do. Sửa nguyên nhân rồi tạo lịch mới cho các chương còn nháp. Tác giả có thể tải lại danh sách để xem tiến độ.

## Kiểm tra

`npx.cmd vitest run src/lib/authoring/publication-schedule.test.ts src/app/api/authoring/cron/publish-scheduled/route.test.ts`

SQL regression script cần PostgreSQL/Supabase thật. Chưa có cơ sở dữ liệu thử nghiệm trong workspace để chạy script này tự động.
