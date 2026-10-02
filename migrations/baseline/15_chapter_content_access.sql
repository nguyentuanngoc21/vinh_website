-- =======================================================================
-- 15_chapter_content_access.sql — Chặn đọc chapters.content qua REST API
-- =======================================================================
-- anon/authenticated chỉ có SELECT từng cột của chapters, TRỪ `content`. Nội
-- dung chương chỉ đọc qua server (service-role) sau khi route kiểm quyền (đã
-- mua, độ tuổi, chủ sở hữu). INSERT/UPDATE content giữ nguyên.
--
-- Đặt CUỐI (sau mọi file thêm cột vào chapters: 02, 12…) vì danh sách cột tính
-- từ information_schema lúc chạy. Migration thêm cột chapters về sau phải tự
-- `grant select (<cột>) on public.chapters to anon, authenticated;`.
--
-- Gộp từ migration: migrations/20261002_chapter_content_access.sql
-- Phụ thuộc (phải chạy trước): 02_books_and_chapters.sql, 12_content_retention.sql.
-- Chỉ dùng cho project MỚI, TRỐNG — xem migrations/baseline/README.md.
-- =======================================================================
DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'chapters' AND column_name <> 'content';

  EXECUTE 'REVOKE SELECT ON public.chapters FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.chapters TO anon, authenticated', v_cols);
END;
$$;
