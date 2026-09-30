-- Migration: độc quyền mặc định = Tự do + lịch sử đổi độc quyền.
--
-- Bối cảnh (truyện "Thanh Tửu Châu", 30/09/2026): books.is_exclusive có
-- DEFAULT true, và mọi đường tạo truyện đều mặc định Độc quyền — kể cả luồng
-- "Nhập bản thảo" (import-manuscript-modal.tsx chỉ gửi { title }, API tự gán
-- true). Tác giả thành độc quyền mà không hề tích, và không có dấu vết nào để
-- biết ai/khi nào đã đổi.
--
-- 1. DEFAULT false — truyện chỉ độc quyền khi tác giả chủ động chọn. Không
--    đổi dữ liệu truyện hiện có.
-- 2. book_exclusivity_events — nhật ký mọi lần tạo truyện + đổi is_exclusive,
--    ghi bởi TRIGGER (1 nơi ghi duy nhất, không route nào quên được). Actor:
--      - admin: qua RPC admin_set_book_exclusive, RPC đặt biến phiên
--        vinh.exclusivity_actor/_reason (transaction-local) cho trigger đọc;
--        trigger kiểm lại actor đó đúng là admin/super_admin.
--      - author: auth.uid() = author_id (route tác giả dùng session thật).
--      - system: còn lại (service-role không qua RPC, SQL tay...).
-- 3. admin_set_book_exclusive — admin/super_admin đổi độc quyền, bắt buộc lý
--    do. Bỏ qua khoá 3 ngày (khoá đó chỉ nằm ở route tác giả); trigger cuộc
--    thi D11 (books_block_exclusive_off_during_contest) vẫn chặn.
--
-- Chạy ở dev/staging trước, test bằng
-- docs/supabase/tests/20260930_book_exclusivity_history.test.sql.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Mặc định Tự do
-- ---------------------------------------------------------------------
ALTER TABLE public.books ALTER COLUMN is_exclusive SET DEFAULT false;

-- ---------------------------------------------------------------------
-- 2. Nhật ký
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.book_exclusivity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books (id) ON DELETE CASCADE,
  -- null = sự kiện tạo truyện (trạng thái ban đầu).
  from_exclusive boolean,
  to_exclusive boolean NOT NULL,
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  actor_kind text NOT NULL CHECK (actor_kind IN ('author', 'admin', 'system')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS book_exclusivity_events_book_idx
  ON public.book_exclusivity_events (book_id, created_at);

ALTER TABLE public.book_exclusivity_events ENABLE ROW LEVEL SECURITY;

-- Chỉ admin đọc; không có policy ghi — chỉ trigger (security definer) ghi.
DROP POLICY IF EXISTS "admins view book exclusivity events" ON public.book_exclusivity_events;
CREATE POLICY "admins view book exclusivity events"
  ON public.book_exclusivity_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
  ));

REVOKE INSERT, UPDATE, DELETE ON public.book_exclusivity_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_book_exclusivity_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setting text := nullif(current_setting('vinh.exclusivity_actor', true), '');
  v_actor uuid;
  v_kind text;
  v_reason text := nullif(current_setting('vinh.exclusivity_reason', true), '');
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.is_exclusive IS NOT DISTINCT FROM NEW.is_exclusive THEN
    RETURN NEW;
  END IF;

  IF v_setting IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_setting::uuid AND role IN ('admin', 'super_admin')
  ) THEN
    v_actor := v_setting::uuid;
    v_kind := 'admin';
  ELSIF auth.uid() IS NOT NULL AND auth.uid() = NEW.author_id THEN
    v_actor := auth.uid();
    v_kind := 'author';
    v_reason := NULL;
  ELSE
    v_actor := auth.uid();
    v_kind := 'system';
    v_reason := NULL;
  END IF;

  INSERT INTO public.book_exclusivity_events (book_id, from_exclusive, to_exclusive, actor_id, actor_kind, reason)
  VALUES (
    NEW.id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.is_exclusive END,
    NEW.is_exclusive,
    v_actor,
    v_kind,
    v_reason
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_book_exclusivity_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS log_book_exclusivity_event ON public.books;
CREATE TRIGGER log_book_exclusivity_event
  AFTER INSERT OR UPDATE OF is_exclusive ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.log_book_exclusivity_event();

-- ---------------------------------------------------------------------
-- 3. RPC admin
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_book_exclusive(
  p_book_id uuid,
  p_admin_id uuid,
  p_exclusive boolean,
  p_reason text
) RETURNS public.books
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_book public.books;
BEGIN
  -- Kiểm lại ở DB vì service-role bỏ qua RLS.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id AND role IN ('admin', 'super_admin')) THEN
    RAISE EXCEPTION 'Not an admin' USING errcode = 'insufficient_privilege';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Reason is required' USING errcode = 'check_violation', hint = 'exclusivity_reason_required';
  END IF;

  PERFORM set_config('vinh.exclusivity_actor', p_admin_id::text, true);
  PERFORM set_config('vinh.exclusivity_reason', left(v_reason, 500), true);

  UPDATE public.books SET is_exclusive = p_exclusive WHERE id = p_book_id RETURNING * INTO v_book;

  -- Xoá biến phiên ngay — không để lọt sang câu lệnh khác cùng transaction.
  PERFORM set_config('vinh.exclusivity_actor', '', true);
  PERFORM set_config('vinh.exclusivity_reason', '', true);

  RETURN v_book; -- null nếu không có truyện
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_book_exclusive(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_book_exclusive(uuid, uuid, boolean, text) TO service_role;

COMMIT;

-- Kiểm tra sau khi chạy (chỉ đọc):
-- select column_default from information_schema.columns
--   where table_schema = 'public' and table_name = 'books' and column_name = 'is_exclusive';  -- 'false'
-- select tgname from pg_trigger where tgrelid = 'public.books'::regclass and tgname = 'log_book_exclusivity_event';
-- select proname from pg_proc where proname in ('admin_set_book_exclusive', 'log_book_exclusivity_event');
--
-- Notes:
-- 1. Idempotent — ALTER ... SET DEFAULT, IF NOT EXISTS, CREATE OR REPLACE,
--    DROP ... IF EXISTS trước CREATE.
-- 2. Không có lịch sử cho các lần đổi TRƯỚC migration này (không có nguồn
--    nào để dựng lại).
-- 3. Cập nhật cùng lúc:
--    - migrations/baseline/02_books_and_chapters.sql (+ npm run build-schema)
--    - src/lib/supabase/types.ts — bảng book_exclusivity_events, RPC
--      admin_set_book_exclusive
--    - src/app/api/admin/books/[bookId]/route.ts — is_exclusive đi qua RPC,
--      bắt buộc exclusiveReason
--    - src/app/api/admin/books/[bookId]/exclusivity-events/route.ts (GET)
--    - src/components/admin/content-table.tsx — ô lý do + lịch sử
--    - mặc định Tự do ở API tạo truyện, new-work-workspace.tsx, mobile
--      sang-tac/moi.tsx + nhap.tsx
