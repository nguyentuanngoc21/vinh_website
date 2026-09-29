-- Migration: tác giả xoá chương nháp và sắp xếp lại thứ tự chương.
--
-- Trước đây không có route/policy nào xoá hay đổi thứ tự chương (order_index
-- chỉ gán 1 lần lúc insert). Chủ dự án chốt thêm cả hai (25/09/2026), dùng
-- chung cho web và app mobile (Phase 8).
--
-- 1. Xoá chương — policy DELETE mới. Chỉ chương:
--      - thuộc sách của chính người gọi, sách chưa bị xoá mềm;
--      - đang NHÁP (published = false);
--      - không bị admin gỡ (removed_at is null — giữ bằng chứng kiểm duyệt);
--      - không phải chương cuối (is_last_chapter không đảo được — xoá sẽ lách
--        trigger prevent_unset_last_chapter).
--    "Chưa có giao dịch mua" kiểm ở route (purchase_transactions.chapter_id
--    không FK) — DELETE /api/authoring/chapters/[chapterId].
--
-- 2. reorder_book_chapters(p_book_id, p_chapter_ids) — SECURITY INVOKER, nên
--    policy "authors update chapters on their own books" vẫn áp dụng. Danh
--    sách phải chứa đủ mọi chương của sách, mỗi chương đúng 1 lần; chương
--    cuối (nếu có) phải đứng cuối. Không có unique (book_id, order_index) nên
--    cập nhật 1 câu UPDATE là đủ.
--
-- Idempotent: DROP POLICY IF EXISTS + CREATE OR REPLACE FUNCTION.
-- Test: docs/supabase/tests/20260925_chapter_delete_and_reorder.test.sql.

drop policy if exists "authors delete draft chapters on their own books" on public.chapters;
create policy "authors delete draft chapters on their own books"
  on public.chapters for delete
  using (
    not published
    and removed_at is null
    and not is_last_chapter
    and exists (
      select 1 from public.books b
      where b.id = book_id and b.author_id = auth.uid() and b.deleted_at is null
    )
  );

create or replace function public.reorder_book_chapters(p_book_id uuid, p_chapter_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total integer;
  v_last uuid;
begin
  if not exists (
    select 1 from public.books
    where id = p_book_id and author_id = auth.uid() and deleted_at is null
  ) then
    raise exception 'Book % not found or not owned by caller', p_book_id;
  end if;

  -- Khoá các chương của sách: 2 lần sắp xếp song song không ghi đè lẫn nhau.
  perform 1 from public.chapters where book_id = p_book_id for update;
  select count(*) into v_total from public.chapters where book_id = p_book_id;

  if coalesce(array_length(p_chapter_ids, 1), 0) <> v_total
     or (select count(distinct x) from unnest(p_chapter_ids) as x) <> v_total
     or exists (
       select 1 from unnest(p_chapter_ids) as x
       where not exists (select 1 from public.chapters c where c.id = x and c.book_id = p_book_id)
     ) then
    raise exception 'Chapter list must contain every chapter of the book exactly once';
  end if;

  select id into v_last from public.chapters where book_id = p_book_id and is_last_chapter;
  if v_last is not null and p_chapter_ids[v_total] <> v_last then
    raise exception 'The last chapter must stay last';
  end if;

  update public.chapters c
     set order_index = t.ord
    from unnest(p_chapter_ids) with ordinality as t(id, ord)
   where c.id = t.id and c.book_id = p_book_id and c.order_index is distinct from t.ord::integer;
end;
$$;

revoke execute on function public.reorder_book_chapters(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_book_chapters(uuid, uuid[]) to authenticated;
