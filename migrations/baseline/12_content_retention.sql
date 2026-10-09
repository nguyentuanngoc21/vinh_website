-- =======================================================================
-- Baseline 12 — Lưu trữ / dọn nội dung  (12_content_retention.sql)
-- =======================================================================
-- Phạm vi: content_purged_at trên books/chapters + index hàng chờ dọn (cron
-- purge-deleted-content).
--
-- Đối tượng tạo trong file này:
--   Bảng: chapter_notes (đặt ở đây vì trigger dọn ghi chú cần cột
--     content_purged_at của file này)
--   Hàm: purge_chapter_notes
--   Thêm cột vào bảng của file trước:
--     chapters.content_purged_at, books.content_purged_at
--
-- Gộp từ migration (migrations/archive/):
--   20260908_add_content_purge_retention.sql
--   + migrations/20260929_add_hot_path_indexes.sql (phần của file này)
--   + migrations/20261009_chapter_notes.sql
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

-- Chapter notes / outline: 20261009_chapter_notes.sql

create table if not exists public.chapter_notes (
  chapter_id uuid primary key references public.chapters (id) on delete cascade,
  notes text not null default '' check (char_length(notes) <= 10000),
  updated_at timestamptz not null default now()
);

alter table public.chapter_notes enable row level security;
drop policy if exists "authors manage notes on their own chapters" on public.chapter_notes;
create policy "authors manage notes on their own chapters" on public.chapter_notes for all
  using (exists (select 1 from public.chapters c join public.books b on b.id = c.book_id
    where c.id = chapter_id and b.author_id = auth.uid() and b.deleted_at is null))
  with check (exists (select 1 from public.chapters c join public.books b on b.id = c.book_id
    where c.id = chapter_id and b.author_id = auth.uid() and b.deleted_at is null));

revoke all on public.chapter_notes from anon;
revoke truncate, references, trigger on public.chapter_notes from public, authenticated;
grant select, insert, update, delete on public.chapter_notes to authenticated;
grant all on public.chapter_notes to service_role;

create or replace function public.purge_chapter_notes() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.content_purged_at is not null and old.content_purged_at is null then
    delete from public.chapter_notes where chapter_id = new.id;
  end if;
  return new;
end $$;
revoke all on function public.purge_chapter_notes() from public, anon, authenticated;
drop trigger if exists chapter_purge_notes on public.chapters;
create trigger chapter_purge_notes after update of content_purged_at on public.chapters
for each row execute function public.purge_chapter_notes();

