-- =======================================================================
-- Baseline 12 — Lưu trữ / dọn nội dung  (12_content_retention.sql)
-- =======================================================================
-- Phạm vi: content_purged_at trên books/chapters + index hàng chờ dọn (cron
-- purge-deleted-content).
--
-- Đối tượng tạo trong file này:
--   Thêm cột vào bảng của file trước:
--     chapters.content_purged_at, books.content_purged_at
--
-- Gộp từ migration (migrations/archive/):
--   20260908_add_content_purge_retention.sql
--   + migrations/20260929_add_hot_path_indexes.sql (phần của file này)
--
-- Phụ thuộc (phải chạy trước): 01_extensions_and_accounts.sql,
--   02_books_and_chapters.sql
-- Chỉ dùng cho project MỚI, TRỐNG — xem migrations/baseline/README.md.
-- =======================================================================

-- --- Dọn NỘI DUNG NẶNG (không xoá hàng) của truyện/chương đã xoá quá 30
-- ngày — tối ưu dung lượng, giữ hàng metadata vĩnh viễn cho audit trail.
-- KHÔNG xoá thật (orders.book_id/author_name_agreements.book_id tham
-- chiếu books không có ON DELETE CASCADE). Xem
-- migrations/archive/20260908_add_content_purge_retention.sql +
-- api/admin/cron/purge-deleted-content/route.ts. ---
alter table public.chapters
  add column content_purged_at timestamptz;

alter table public.books
  add column content_purged_at timestamptz;

create index if not exists chapters_pending_purge_idx
  on public.chapters (removed_at) where removed_at is not null and content_purged_at is null;
create index if not exists books_pending_purge_idx
  on public.books (deleted_at) where deleted_at is not null and content_purged_at is null;
