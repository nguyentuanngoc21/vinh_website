-- Migration: dọn NỘI DUNG NẶNG (không xoá hàng) của truyện/chương đã xoá
-- quá 30 ngày — tối ưu dung lượng, giữ nguyên hàng metadata vĩnh viễn cho
-- audit trail (lý do gỡ, ai gỡ, khi nào...). KHÔNG xoá thật book/chapter
-- (2 bảng orders.book_id/author_name_agreements.book_id tham chiếu books
-- KHÔNG có ON DELETE CASCADE — DELETE thật sẽ vỡ khoá ngoại hoặc phá huỷ
-- vĩnh viễn hồ sơ giao dịch/thoả thuận đứng tên nếu ép cascade, không an
-- toàn cho 1 sản phẩm có giao dịch token thật).
--
-- content_purged_at KHÔNG NULL = đã dọn — chapters.content rỗng ("", cột
-- NOT NULL nên không dùng null), books.cover_design_item_id/synopsis về
-- null. Cờ này cũng dùng để UI (content-table.tsx/chapter-moderation-table.tsx)
-- ẩn mặc định khỏi bảng admin (có nút bấm hiện lại) VÀ tắt nút "Khôi phục"
-- (phục hồi 1 hàng đã rỗng nội dung là vô nghĩa, tránh đánh lừa admin).
--
-- Ai chạy: src/app/api/admin/cron/purge-deleted-content/route.ts, đăng ký
-- trong vercel.json (cron hàng ngày) — xem route đó cho logic đầy đủ.
--
-- Run in the Supabase SQL editor (or via psql). Idempotent.

BEGIN;

ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS content_purged_at timestamptz;

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS content_purged_at timestamptz;

-- Không thêm vào GRANT UPDATE của authenticated — chỉ cron (service-role,
-- bỏ qua GRANT) ghi cột này, tác giả/admin qua client thường không tự
-- set/unset được.

COMMIT;

-- Notes:
-- 1. Sau khi chạy, cập nhật (không nằm trong file SQL này):
--      - docs/supabase/schema.sql — thêm 2 cột content_purged_at.
--      - src/lib/supabase/types.ts — books/chapters Row thêm content_purged_at.
--      - vercel.json — thêm cron path mới, xem
--        src/app/api/admin/cron/purge-deleted-content/route.ts.
-- 2. Vẫn KHÔNG có DELETE thật ở bất kỳ đâu — chỉ set field rỗng/null.
