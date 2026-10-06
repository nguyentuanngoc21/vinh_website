-- Migration: tác giả ghim 1 bình luận chương.
--
-- Bình luận cho CẢ chương = anchored_comments có paragraph_index NULL (section
-- "Bình luận chương" cuối trang đọc). Tác giả của truyện ghim được TỐI ĐA 1
-- bình luận gốc mỗi chương: hiện ở đầu section đó và khi hover vào chương ở
-- danh sách chương (/truyen/[slug]).
--
-- Lưu bằng cột pinned_at trên chính bình luận (không phải cột trên chapters)
-- để không phải động tới column-level grant của chapters
-- (20261002_chapter_content_access.sql). Xoá bình luận = tự bỏ ghim.
--
-- Chỉ server (service-role, sau khi route kiểm đúng tác giả) được ghi
-- pinned_at: policy "users update their own anchored comments" cho người
-- bình luận UPDATE hàng của mình qua REST, nên trigger dưới chặn anon /
-- authenticated tự đặt/sửa cột này.
--
-- Idempotent. Chạy ở dev/staging trước.

BEGIN;

ALTER TABLE public.anchored_comments
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS anchored_comments_one_pin_per_chapter
  ON public.anchored_comments (chapter_id)
  WHERE pinned_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.anchored_comments_guard_pin()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated')
     AND NEW.pinned_at IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.pinned_at ELSE NULL END) THEN
    RAISE EXCEPTION 'pinned_at chỉ được ghi qua server' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS anchored_comments_guard_pin ON public.anchored_comments;
CREATE TRIGGER anchored_comments_guard_pin
  BEFORE INSERT OR UPDATE ON public.anchored_comments
  FOR EACH ROW EXECUTE FUNCTION public.anchored_comments_guard_pin();

COMMIT;

-- Notes — cập nhật cùng lúc:
-- - migrations/baseline/03_reading.sql (phần 10f) rồi `npm run build-schema`.
-- - src/lib/supabase/types.ts: anchored_comments.pinned_at.
-- - API: src/app/api/chapters/[chapterId]/comments/[commentId]/pin/route.ts.
