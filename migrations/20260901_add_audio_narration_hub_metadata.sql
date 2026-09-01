-- Migration: real genre/play-count/listening-progress data for the
-- "Audio" hub (/audio, src/components/audio-hub/*) — audio_narrations
-- only had title/audio_url/duration_seconds before this, and nothing ever
-- inserted a row outside the book-cover-style flow captured in schema.sql
-- phần 9's usage notes (narrators had no independent-upload page despite
-- /audio's "Đăng tải Audio" CTA), so the table was always empty in
-- practice. This also backs the new /audio/new upload page and a real
-- playback session (mini player, "Nghe tiếp", "Audio đang nghe").
--
-- genre: plain text + CHECK, same shape/values as books.genre
-- (migrations/20260825_update_book_genres.sql) — narrators pick it at
-- upload time; for audio linked to a book's chapters (chapter_audio_links)
-- the app fills it in from that book's genre instead of asking twice, see
-- src/lib/audio/get-audio-catalog.ts.
--
-- play_count: same "SECURITY DEFINER counter column" pattern as
-- books.view_count/increment_book_view_count()
-- (migrations/20260824_add_book_tags_and_view_count.sql) — a play isn't
-- tied to "1 action per signed-in user" (same listener can replay, no
-- login required to listen), so a per-user table is the wrong shape.
--
-- audio_progress: per-(user, audio_narration) last playback position, 1
-- row/pair (upsert on save, not an append-only log) — same shape/reasoning
-- as book_progress (migrations/20260824_add_book_progress.sql) for
-- "Tiếp tục đọc". Powers "Audio đang nghe" (most-recently-updated row) and
-- "Nghe tiếp" (next few) on real per-user data — both sections render
-- nothing (not a fabricated placeholder) for a listener with no rows yet.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

ALTER TABLE public.audio_narrations
  ADD COLUMN IF NOT EXISTS genre text,
  ADD COLUMN IF NOT EXISTS play_count integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.audio_narrations
    ADD CONSTRAINT audio_narrations_play_count_check CHECK (play_count >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.audio_narrations
    ADD CONSTRAINT audio_narrations_genre_check
    CHECK (genre IS NULL OR genre IN (
      'Linh dị', 'Cổ tích & Thần thoại', 'Dã sử', 'Trinh thám',
      'Tâm lý - tội phạm', 'Tình cảm', 'Đời sống - Xã hội',
      'Khoa học viễn tưởng', 'Tiên hiệp/ kiếm hiệp', 'Kỳ ảo'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- View công khai cho Audio hub — thêm genre/play_count, CỐ Ý vẫn không có
-- share_token (giữ nguyên lý do gốc ở schema.sql phần 9). Cột mới PHẢI
-- xếp sau cùng — xem ghi chú tương tự ở
-- migrations/20260901_add_design_item_gallery_metadata.sql (CREATE OR
-- REPLACE VIEW không cho phép đổi thứ tự/tên cột cũ).
CREATE OR REPLACE VIEW public.public_audio_narrations AS
  SELECT id, narrator_id, title, audio_url, duration_seconds, source, created_at, genre, play_count
  FROM public.audio_narrations;

-- security definer: tăng play_count an toàn dưới race condition, không
-- cho client tự set bằng bất kỳ số nào — chỉ +1 đúng 1 bản ghi/lần gọi.
-- Không yêu cầu đăng nhập (nghe không cần tài khoản), giống
-- increment_book_view_count.
CREATE OR REPLACE FUNCTION public.increment_audio_play_count(p_audio_narration_id uuid)
RETURNS void AS $$
  UPDATE public.audio_narrations SET play_count = play_count + 1 WHERE id = p_audio_narration_id;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.increment_audio_play_count(uuid) TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.audio_progress (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  audio_narration_id uuid NOT NULL REFERENCES public.audio_narrations (id) ON DELETE CASCADE,
  position_seconds integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, audio_narration_id)
);

DO $$ BEGIN
  ALTER TABLE public.audio_progress
    ADD CONSTRAINT audio_progress_position_seconds_check CHECK (position_seconds >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.audio_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage their own audio progress" ON public.audio_progress;
CREATE POLICY "users manage their own audio progress"
  ON public.audio_progress FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMIT;

-- Notes:
-- 1. Idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS
--    / DO $$ .. EXCEPTION WHEN duplicate_object) — chạy lại an toàn.
-- 2. Sau khi chạy, cập nhật docs/supabase/schema.sql (phần 9, ngay dưới
--    audio_narrations/public_audio_narrations, + audio_progress gần
--    book_progress) + src/lib/supabase/types.ts (cả hai đã cập nhật sẵn
--    trong cùng commit với migration này).
-- 3. app tự ghi audio_progress qua client cookie-bound của chính người
--    nghe (RLS auth.uid() = user_id), KHÔNG qua service-role — xem
--    src/app/api/audio/progress/route.ts.
