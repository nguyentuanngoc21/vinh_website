-- =======================================================================
-- 14_age_ratings.sql — Nhãn độ tuổi + cảnh báo nội dung cấp truyện
-- (books.age_rating / content_warnings / age_rating_locked_*), nhật ký
-- book_age_rating_events, admin_set_book_age_rating, xác thực tuổi qua CCCD
-- (cccd_birth_year, is_age_verified_adult, viewer_can_read_adult), và thay
-- policy SELECT công khai của chapters để chặn truyện 18+ với người chưa
-- xác thực tuổi, và view adult_audio_narration_ids (audio gắn chương 18+).
--
-- Gộp từ migration: migrations/20261002_book_age_ratings.sql (bỏ phần ghi
-- sự kiện cho truyện đã có — project mới chưa có truyện nào).
--
-- Phụ thuộc (phải chạy trước): 01_extensions_and_accounts.sql (profiles,
-- identity_verifications), 02_books_and_chapters.sql (books, chapters),
-- 08_audio.sql (chapter_audio_links).
-- Chỉ dùng cho project MỚI, TRỐNG — xem migrations/baseline/README.md.
-- =======================================================================

-- ---------------------------------------------------------------------
-- 1. Cột + ràng buộc
-- ---------------------------------------------------------------------
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS age_rating text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS content_warnings text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS age_rating_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS age_rating_locked_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_age_rating_check;
ALTER TABLE public.books ADD CONSTRAINT books_age_rating_check
  CHECK (age_rating IN ('all', '16', '18'));

ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_content_warnings_check;
ALTER TABLE public.books ADD CONSTRAINT books_content_warnings_check
  CHECK (content_warnings <@ ARRAY[
    'violence', 'gore', 'gore_extreme', 'sexual_mild', 'sexual_explicit', 'self_harm',
    'abuse', 'domestic_violence', 'horror', 'substances', 'profanity'
  ]::text[]);

ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_age_rating_warnings_check;
ALTER TABLE public.books ADD CONSTRAINT books_age_rating_warnings_check
  CHECK (
    (cardinality(content_warnings) = 0 OR age_rating <> 'all')
    AND (NOT (content_warnings && ARRAY['gore_extreme', 'sexual_explicit', 'abuse']::text[]) OR age_rating = '18')
  );

ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_age_rating_lock_check;
ALTER TABLE public.books ADD CONSTRAINT books_age_rating_lock_check
  CHECK ((age_rating_locked_at IS NULL) = (age_rating_locked_by IS NULL));

-- Tác giả sửa nhãn qua PATCH /api/authoring/books/[bookId] (session thật,
-- RLS + GRANT cột như genre/tags). Cột khoá KHÔNG mở cho tác giả.
GRANT UPDATE (age_rating, content_warnings) ON public.books TO authenticated;

-- ---------------------------------------------------------------------
-- 2. Nhật ký
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.book_age_rating_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books (id) ON DELETE CASCADE,
  -- null = sự kiện tạo truyện (trạng thái ban đầu).
  from_rating text,
  to_rating text NOT NULL,
  from_warnings text[],
  to_warnings text[] NOT NULL,
  locked boolean NOT NULL,
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  actor_kind text NOT NULL CHECK (actor_kind IN ('author', 'admin', 'system')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS book_age_rating_events_book_idx
  ON public.book_age_rating_events (book_id, created_at);

ALTER TABLE public.book_age_rating_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins view book age rating events" ON public.book_age_rating_events;
CREATE POLICY "admins view book age rating events"
  ON public.book_age_rating_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
  ));

REVOKE INSERT, UPDATE, DELETE ON public.book_age_rating_events FROM anon, authenticated;

-- Actor admin hợp lệ của câu lệnh hiện tại (biến phiên do RPC admin đặt),
-- null nếu không có/không phải admin.
CREATE OR REPLACE FUNCTION public.age_rating_admin_actor()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setting text := nullif(current_setting('vinh.age_rating_actor', true), '');
BEGIN
  IF v_setting IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_setting::uuid AND role IN ('admin', 'super_admin')
  ) THEN
    RETURN v_setting::uuid;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.age_rating_admin_actor() FROM public, anon, authenticated;

-- Chặn tác giả đổi nhãn khi admin đã khoá. Service-role/SQL tay không qua
-- RPC vẫn bị chặn — đổi nhãn đang khoá chỉ qua admin_set_book_age_rating.
CREATE OR REPLACE FUNCTION public.enforce_book_age_rating_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF old.age_rating_locked_at IS NOT NULL
     AND (old.age_rating IS DISTINCT FROM new.age_rating
          OR old.content_warnings IS DISTINCT FROM new.content_warnings
          OR old.age_rating_locked_at IS DISTINCT FROM new.age_rating_locked_at)
     AND public.age_rating_admin_actor() IS NULL THEN
    RAISE EXCEPTION 'Age rating is locked by an admin'
      USING errcode = 'check_violation', hint = 'age_rating_locked';
  END IF;
  RETURN new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_book_age_rating_lock() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_book_age_rating_lock ON public.books;
CREATE TRIGGER enforce_book_age_rating_lock
  BEFORE UPDATE OF age_rating, content_warnings, age_rating_locked_at ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.enforce_book_age_rating_lock();

CREATE OR REPLACE FUNCTION public.log_book_age_rating_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := public.age_rating_admin_actor();
  v_actor uuid;
  v_kind text;
  v_reason text := nullif(current_setting('vinh.age_rating_reason', true), '');
BEGIN
  IF tg_op = 'UPDATE'
     AND old.age_rating IS NOT DISTINCT FROM new.age_rating
     AND old.content_warnings IS NOT DISTINCT FROM new.content_warnings
     AND (old.age_rating_locked_at IS NULL) = (new.age_rating_locked_at IS NULL) THEN
    RETURN new;
  END IF;

  IF v_admin IS NOT NULL THEN
    v_actor := v_admin;
    v_kind := 'admin';
  ELSIF auth.uid() IS NOT NULL AND auth.uid() = new.author_id THEN
    v_actor := auth.uid();
    v_kind := 'author';
    v_reason := NULL;
  ELSE
    v_actor := auth.uid();
    v_kind := 'system';
    v_reason := NULL;
  END IF;

  INSERT INTO public.book_age_rating_events
    (book_id, from_rating, to_rating, from_warnings, to_warnings, locked, actor_id, actor_kind, reason)
  VALUES (
    new.id,
    CASE WHEN tg_op = 'UPDATE' THEN old.age_rating END,
    new.age_rating,
    CASE WHEN tg_op = 'UPDATE' THEN old.content_warnings END,
    new.content_warnings,
    new.age_rating_locked_at IS NOT NULL,
    v_actor,
    v_kind,
    v_reason
  );
  RETURN new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_book_age_rating_event() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS log_book_age_rating_event ON public.books;
CREATE TRIGGER log_book_age_rating_event
  AFTER INSERT OR UPDATE OF age_rating, content_warnings, age_rating_locked_at ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.log_book_age_rating_event();

-- Admin/super_admin đặt nhãn, bắt buộc lý do. p_lock = true: khoá luôn (tác
-- giả không tự hạ được); false: mở khoá, trả quyền sửa cho tác giả.
CREATE OR REPLACE FUNCTION public.admin_set_book_age_rating(
  p_book_id uuid,
  p_admin_id uuid,
  p_rating text,
  p_warnings text[],
  p_reason text,
  p_lock boolean
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
    RAISE EXCEPTION 'Reason is required' USING errcode = 'check_violation', hint = 'age_rating_reason_required';
  END IF;

  PERFORM set_config('vinh.age_rating_actor', p_admin_id::text, true);
  PERFORM set_config('vinh.age_rating_reason', left(v_reason, 500), true);

  UPDATE public.books
     SET age_rating = p_rating,
         content_warnings = coalesce(p_warnings, '{}'),
         age_rating_locked_at = CASE WHEN p_lock THEN now() END,
         age_rating_locked_by = CASE WHEN p_lock THEN p_admin_id END
   WHERE id = p_book_id
   RETURNING * INTO v_book;

  -- Xoá biến phiên ngay — không để lọt sang câu lệnh khác cùng transaction.
  PERFORM set_config('vinh.age_rating_actor', '', true);
  PERFORM set_config('vinh.age_rating_reason', '', true);

  RETURN v_book; -- null nếu không có truyện
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_book_age_rating(uuid, uuid, text, text[], text, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_book_age_rating(uuid, uuid, text, text[], text, boolean) TO service_role;

-- ---------------------------------------------------------------------
-- 3. Xác thực tuổi qua CCCD
-- ---------------------------------------------------------------------
-- Năm sinh từ số CCCD 12 số: chữ số 4 = thế kỷ + giới tính (0/1 → 1900,
-- 2/3 → 2000, 4/5 → 2100, 6/7 → 2200, 8/9 → 1800), chữ số 5-6 = 2 số cuối
-- năm sinh. null nếu không đúng định dạng.
CREATE OR REPLACE FUNCTION public.cccd_birth_year(p_cccd text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_cccd IS NULL OR p_cccd !~ '^[0-9]{12}$' THEN NULL
    ELSE (CASE substr(p_cccd, 4, 1)
            WHEN '0' THEN 1900 WHEN '1' THEN 1900
            WHEN '2' THEN 2000 WHEN '3' THEN 2000
            WHEN '4' THEN 2100 WHEN '5' THEN 2100
            WHEN '6' THEN 2200 WHEN '7' THEN 2200
            ELSE 1800
          END) + substr(p_cccd, 5, 2)::integer
  END;
$$;

-- Đủ 18 tuổi đã xác thực. Chỉ service_role gọi trực tiếp với user bất kỳ
-- (route server); khách/người dùng chỉ hỏi được cho CHÍNH MÌNH qua
-- viewer_can_read_adult() — không dò được tuổi người khác.
CREATE OR REPLACE FUNCTION public.is_age_verified_adult(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS d)
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.identity_verifications iv ON iv.user_id = p.id AND iv.status = 'approved'
    CROSS JOIN today
    WHERE p.id = p_user_id
      AND p.cccd_verified
      AND public.cccd_birth_year(iv.cccd_number) IS NOT NULL
      AND (
        public.cccd_birth_year(iv.cccd_number) <= extract(year FROM today.d)::integer - 19
        OR (
          p.date_of_birth IS NOT NULL
          AND extract(year FROM p.date_of_birth)::integer = public.cccd_birth_year(iv.cccd_number)
          AND p.date_of_birth <= (today.d - interval '18 years')::date
        )
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_age_verified_adult(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_age_verified_adult(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.viewer_can_read_adult()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND public.is_age_verified_adult(auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.viewer_can_read_adult() FROM public;
GRANT EXECUTE ON FUNCTION public.viewer_can_read_adult() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. RLS chapters: truyện 18+ chỉ cho người đã xác thực tuổi
-- ---------------------------------------------------------------------
-- (select ...) bọc hàm → Postgres tính 1 lần mỗi câu truy vấn (initplan),
-- không gọi lại cho từng hàng chương.
DROP POLICY IF EXISTS "published chapters follow their book's visibility" ON public.chapters;
CREATE POLICY "published chapters follow their book's visibility"
  ON public.chapters FOR SELECT
  USING (
    published AND EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = book_id AND b.published AND b.deleted_at IS NULL
        AND (b.age_rating <> '18' OR (SELECT public.viewer_can_read_adult()))
    )
    OR EXISTS (SELECT 1 FROM public.books b WHERE b.id = book_id AND b.author_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- 5. Audio gắn với chương truyện 18+
-- ---------------------------------------------------------------------
-- Danh sách id audio đã gắn vào ít nhất 1 chương của truyện 18+ — app lọc
-- chúng khỏi các danh sách công khai (/audio, audio nổi bật, tìm kiếm, Kết
-- nối). View chạy quyền owner (bỏ qua RLS chapters) để khách cũng lọc được;
-- chỉ lộ id audio, không lộ nội dung chương. Người đã xác thực vẫn nghe
-- audio trong trang đọc chương (src/lib/audio/get-chapter-audio.ts).
CREATE OR REPLACE VIEW public.adult_audio_narration_ids AS
  SELECT DISTINCT l.audio_narration_id
  FROM public.chapter_audio_links l
  JOIN public.chapters c ON c.id = l.chapter_id
  JOIN public.books b ON b.id = c.book_id
  WHERE b.age_rating = '18';

GRANT SELECT ON public.adult_audio_narration_ids TO anon, authenticated, service_role;
