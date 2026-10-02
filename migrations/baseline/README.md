# Baseline schema theo domain

Thư mục này là **nguồn sự thật** cho toàn bộ schema Supabase của Vịnh ở trạng thái cuối
(snapshot 2026-09-29): gộp mọi migration tới `20260928_*` (đã lưu trữ ở
`migrations/archive/`) cộng `migrations/20260929_add_hot_path_indexes.sql` +
`migrations/20260929_add_ranking_aggregates.sql`, tách theo domain để dễ review/kiểm soát/debug.

`docs/supabase/schema.sql` là file **sinh tự động** từ thư mục này (`npm run build-schema`) —
đừng sửa tay.

## Mục đích — CHỈ cho project MỚI, TRỐNG

- Dùng để dựng 1 project Supabase mới hoàn toàn trống (dev/staging mới, preview...).
- **TUYỆT ĐỐI KHÔNG chạy trên production** (hay bất kỳ DB nào đã có dữ liệu): production đã
  áp dụng đủ mọi migration. Các file không idempotent (`create table`/`create policy`/`create
  type` trần) — chạy lại sẽ lỗi hoặc gây lệch.
- Không có data fix 1 lần nào ở đây (vd. `archive/20260825_update_book_genres.sql`, mục chuyển
  `popular-v2` của `archive/20260926_add_contest_scores.sql`, `delete` đầu
  `scripts/seed_service_tag_options.sql`) — project trống không cần.

## Thứ tự chạy

Chạy lần lượt theo tên file trong SQL editor (hoặc `psql -f`), từng file một:

| File | Nội dung |
|---|---|
| `01_extensions_and_accounts.sql` | Extension (vector, pgcrypto), enum role/tag, `profiles` + `author_public_profiles`, xác minh CCCD + bucket `identity-documents`/`avatars`, chặn đổi role/`cccd_verified`, kiểm tra đăng ký, dọn đăng ký chưa xác nhận, `role_change_logs` + `admin_set_user_role()` |
| `02_books_and_chapters.sql` | `books`/`chapters`, giá + độc quyền, chương cuối, nhân vật, tags/lượt xem, soft-delete, genre, GRANT cột `books`, kiểm duyệt chương/truyện, xoá chương nháp + sắp xếp |
| `03_reading.sql` | Gợi ý pgvector, `reading_history` + lượt đọc/ngày, vote chương, tiến độ đọc, danh sách đọc, highlights, `reading_sessions` + heartbeat, comment neo đoạn, ranking aggregates |
| `04_wallet_and_payments.sql` | Cột ví/phạt/ngân hàng trên `profiles`, `transactions` + `apply_transaction()`, settle pending, nạp/rút tiền, mua chương, thưởng nền tảng |
| `05_quests_and_achievements.sql` | Nhiệm vụ hàng ngày, Quest System (nhiệm vụ ẩn, reset, streak, mốc thưởng, quest pool), `quest_generation_jobs`, thành tựu |
| `06_social_and_messaging.sql` | Theo dõi tác giả, `direct_messages`, `notifications`, realtime publication |
| `07_design.sql` | `design_items` + album/lượt thích/bình luận, ảnh bìa sách, bucket `design-images` |
| `08_audio.sql` | `audio_narrations`, tiến độ nghe, bình luận, liên kết chương ↔ audio, bucket `audio-narrations`, `content_protection_status` |
| `09_orders_and_services.sql` | Dịch vụ commission: listings, tag catalog, `orders`, share bản thảo, bàn giao (bucket `order-deliverables`), hoàn tiền/huỷ, ghostwriting, uy tín + tranh chấp, thân các RPC Order |
| `10_legal_agreements.sql` | `agreement_acceptances` |
| `11_contests.sql` | Contest Engine: cuộc thi, bài dự thi, bình chọn, giải, snapshot, điểm, gian lận, chấm giám khảo, công bố, nhiệm vụ sự kiện, Passport, chụp hạng |
| `12_content_retention.sql` | `content_purged_at` + index hàng chờ dọn nội dung |
| `14_age_ratings.sql` | Nhãn độ tuổi + cảnh báo nội dung cấp truyện, khoá nhãn bởi admin + `book_age_rating_events`, xác thực tuổi qua CCCD (`is_age_verified_adult`), policy SELECT `chapters` chặn truyện 18+ |
| `15_chapter_content_access.sql` | Thu hồi SELECT cột `chapters.content` khỏi anon/authenticated (cấp lại các cột khác) — nội dung chương chỉ đọc qua server |
| `99_seed_data.sql` | Seed danh mục: `task_templates`, `achievement_templates`, `streak_milestones`, `service_tag_options` |

Mỗi file bắt đầu bằng header liệt kê: phạm vi, bảng/view/hàm/enum/bucket tạo trong file, cột
thêm vào bảng của file trước, migration archive đã gộp, **các file phải chạy trước**, và (nếu
có) file SAU mà thân hàm plpgsql tham chiếu tới — plpgsql bind lúc chạy nên không cần khi tạo,
nhưng hàm đó chỉ chạy đúng khi cả bộ baseline đã được áp dụng.

Chạy riêng 1 file thì chỉ cần các file trong dòng "Phụ thuộc" của nó; chạy trọn bộ theo thứ tự
tên file luôn đúng (đã kiểm: mọi tiền tố `01..k` đều chạy không lỗi trên DB trống).

## Thêm 1 migration mới

1. Viết delta cho production: `migrations/YYYYMMDD_mo_ta.sql` (idempotent — `if not exists`/
   `if exists`), chạy dev/staging + test RLS trước theo `docs/DEV_WORKFLOW.md`.
2. Sửa **file baseline đúng domain** trong thư mục này để phản ánh trạng thái cuối (thêm cột
   thẳng vào `create table`, thay thân hàm bằng bản mới, thêm policy/index...). Đối tượng phụ
   thuộc domain của file SAU thì đặt ở file sau đó, cuối file, dưới tiêu đề
   `-- --- phụ thuộc <domain> ---`. Cập nhật header của file (danh sách đối tượng, migration gộp).
3. `npm run build-schema` để sinh lại `docs/supabase/schema.sql` (`npm run build-schema -- --check`
   báo lệch, exit 1).
4. Cập nhật `src/lib/supabase/types.ts` trong cùng thay đổi.

## Debug khi dựng project mới bị lỗi

- Chạy từng file một theo thứ tự; lỗi nằm ở file vừa chạy. Header của file đó cho biết nó cần
  file nào chạy trước.
- `relation/column ... does not exist` ⇒ đối tượng đang tham chiếu tới thứ được tạo ở file sau
  (hoặc sau đó trong cùng file) — chuyển câu lệnh xuống sau chỗ tạo đối tượng kia.
- Kiểm project mới có khớp production không: chạy `docs/supabase/inventory.sql` (chỉ đọc) trên
  cả 2, so sánh kết quả.
