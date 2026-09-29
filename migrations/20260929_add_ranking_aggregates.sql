-- Gộp số liệu cho /rankings và các thẻ truyện (home, tìm kiếm, cuộc thi)
-- ngay trong SQL thay vì tải hàng thô về JS.
--
-- Vì sao: PostgREST giới hạn mặc định 1000 hàng/response. get-book-rankings.ts
-- trước đây tải (a) MỌI hàng book_read_counts_daily trong ~6 tháng (sách ×
-- ngày) và (b) MỌI chương đã publish chỉ để đếm — vượt 1000 hàng là bị cắt
-- im lặng, thứ hạng/số chương sai mà không báo lỗi.
--
-- Idempotent. Không đổi dữ liệu.

-- 1. Số lượt đọc mỗi sách trong [p_from, p_to). Cùng ngữ nghĩa với việc
-- cộng book_read_counts_daily theo ngày UTC, khi p_from/p_to là nửa đêm UTC
-- (xem buildWindows() ở get-book-rankings.ts). Ẩn danh như view kia —
-- chỉ trả tổng theo sách, không lộ user_id.
create index if not exists reading_history_read_at_idx
  on public.reading_history (read_at) include (book_id);

create or replace function public.book_read_counts_between(p_from timestamptz, p_to timestamptz)
returns table (book_id uuid, read_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select rh.book_id, count(*)::integer as read_count
  from public.reading_history rh
  where rh.read_at >= p_from and rh.read_at < p_to
  group by rh.book_id;
$$;

revoke execute on function public.book_read_counts_between(timestamptz, timestamptz) from public;
grant execute on function public.book_read_counts_between(timestamptz, timestamptz) to anon, authenticated, service_role;

-- 2. Thống kê chương đã publish theo sách — thay cho việc tải mọi hàng
-- chapters để đếm (home, rankings, thẻ truyện). Chạy với quyền owner nên
-- lọc ĐÚNG điều kiện công khai của policy "published chapters follow their
-- book's visibility": chương published của sách published, chưa xoá.
create or replace view public.book_chapter_stats as
  select c.book_id,
         count(*)::integer as published_chapter_count,
         bool_or(c.is_last_chapter) as has_published_last_chapter,
         max(c.created_at) as latest_published_chapter_at
  from public.chapters c
  join public.books b on b.id = c.book_id
  where c.published and b.published and b.deleted_at is null
  group by c.book_id;

grant select on public.book_chapter_stats to anon, authenticated, service_role;
