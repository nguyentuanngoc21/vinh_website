-- Migration: Phase 8 — Hệ thống Nhân vật (nhiem-vu-thanh-tuu-hoan-thanh.xlsx)
-- Không chỉ để mở khoá quest — đây là công cụ THẬT cho tác giả quản lý
-- nhân vật trong truyện của họ (yêu cầu rõ từ người dùng), quest/thành
-- tựu chỉ là 1 trong các lợi ích của dữ liệu này.
--
-- 4 bảng mới:
--   characters         — 1 nhân vật thuộc 1 sách. role (chính diện/phản
--                        diện/trung lập) + trope (free-text do tác giả tự
--                        gõ, vd "Ma vương", "Trượng nghĩa", "Lạnh lùng" —
--                        cùng tinh thần books.tags, không có danh mục cố
--                        định).
--   chapter_characters — nhân vật nào xuất hiện ở chương nào (n-n), tác
--                        giả tự gắn khi soạn chương.
--   character_follows  — độc giả follow 1 nhân vật (toggle, cùng pattern
--                        author_follows).
--   character_trope_votes — độc giả bình chọn 1 nhân vật (mang 1 trope)
--                        làm "mẫu hình yêu thích" trong 1 chương cụ thể —
--                        1 vote/chương/user (unique), đổi ý thì UPDATE
--                        không INSERT thêm.
--
-- RLS mirror đúng 2 precedent đã có trong schema:
--   - Hiển thị (characters/chapter_characters): "published chapters follow
--     their book's visibility" (chapters, phần 3) — công khai nếu sách đã
--     publish, tác giả luôn xem được sách của chính mình dù chưa publish.
--   - Toggle (character_follows): "for all" 1 policy như author_follows
--     (phần 4).
--
-- 3 metric mới cho thành tựu (achievement_templates.metric), cùng khung
-- Phase 6/7 — không cơ chế mới:
--   villain_followed_count — reader_follow_villain (≥1)
--   hero_followed_count    — reader_follow_hero (≥1)
--   character_guardian_achieved — reader_character_guardian (=1) — follow
--     ÍT NHẤT 1 nhân vật MÀ đã đọc (reading_history) HẾT MỌI chương đã
--     xuất bản có gắn nhân vật đó.
--
-- 1 nhiệm vụ ngày mới: reader_vote_trope (lore_hunt, target 1) — tăng khi
-- bình chọn ở character_trope_votes.
--
-- Idempotent — CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS rồi tạo
-- lại, CREATE OR REPLACE FUNCTION, ON CONFLICT DO NOTHING.

BEGIN;

CREATE TABLE IF NOT EXISTS public.characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  role text NOT NULL DEFAULT 'neutral' CHECK (role IN ('hero', 'villain', 'neutral')),
  -- Free-text, tác giả tự gõ — vd "Ma vương", "Trượng nghĩa", "Lạnh lùng"
  -- (ví dụ trong file gốc). Không có danh mục cố định, cùng tinh thần
  -- books.tags.
  trope text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS characters_book_id_idx ON public.characters (book_id);

ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "characters follow their book's visibility" ON public.characters;
CREATE POLICY "characters follow their book's visibility"
  ON public.characters FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.books b WHERE b.id = book_id AND b.published AND b.deleted_at IS NULL)
    OR EXISTS (SELECT 1 FROM public.books b WHERE b.id = book_id AND b.author_id = auth.uid())
  );

DROP POLICY IF EXISTS "authors manage characters in their own books" ON public.characters;
CREATE POLICY "authors manage characters in their own books"
  ON public.characters FOR ALL
  USING (EXISTS (SELECT 1 FROM public.books b WHERE b.id = book_id AND b.author_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.books b WHERE b.id = book_id AND b.author_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.chapter_characters (
  chapter_id uuid NOT NULL REFERENCES public.chapters (id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.characters (id) ON DELETE CASCADE,
  PRIMARY KEY (chapter_id, character_id)
);

CREATE INDEX IF NOT EXISTS chapter_characters_character_id_idx ON public.chapter_characters (character_id);

ALTER TABLE public.chapter_characters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chapter_characters follow their chapter's visibility" ON public.chapter_characters;
CREATE POLICY "chapter_characters follow their chapter's visibility"
  ON public.chapter_characters FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chapters c JOIN public.books b ON b.id = c.book_id
      WHERE c.id = chapter_id AND c.published AND b.published AND b.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.chapters c JOIN public.books b ON b.id = c.book_id
      WHERE c.id = chapter_id AND b.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "authors tag characters in their own chapters" ON public.chapter_characters;
CREATE POLICY "authors tag characters in their own chapters"
  ON public.chapter_characters FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.chapters c JOIN public.books b ON b.id = c.book_id
      WHERE c.id = chapter_id AND b.author_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chapters c JOIN public.books b ON b.id = c.book_id
      WHERE c.id = chapter_id AND b.author_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.character_follows (
  follower_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.characters (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, character_id)
);

CREATE INDEX IF NOT EXISTS character_follows_character_id_idx ON public.character_follows (character_id);

ALTER TABLE public.character_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage their own character follows" ON public.character_follows;
CREATE POLICY "users manage their own character follows"
  ON public.character_follows FOR ALL
  USING (auth.uid() = follower_id)
  WITH CHECK (auth.uid() = follower_id);

CREATE TABLE IF NOT EXISTS public.character_trope_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES public.chapters (id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.characters (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, chapter_id)
);

CREATE INDEX IF NOT EXISTS character_trope_votes_character_id_idx ON public.character_trope_votes (character_id);

ALTER TABLE public.character_trope_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage their own trope votes" ON public.character_trope_votes;
CREATE POLICY "users manage their own trope votes"
  ON public.character_trope_votes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- --- Thành tựu + nhiệm vụ ---

ALTER TABLE public.achievement_templates DROP CONSTRAINT IF EXISTS achievement_templates_metric_check;
ALTER TABLE public.achievement_templates
  ADD CONSTRAINT achievement_templates_metric_check
  CHECK (metric IS NULL OR metric IN (
    'books_published', 'audio_published', 'design_published',
    'chapters_read', 'genres_read_count', 'night_reads_count',
    'finished_stories_count', 'longest_consecutive_chapters',
    'distinct_reading_days_count', 'max_reading_sessions_per_day',
    'max_gap_days_same_book', 'weekend_both_days_read',
    'max_books_read_same_genre', 'max_genres_within_15_days', 'topup_count',
    'sad_ending_finished_count', 'underrated_finished_count',
    'bookmarked_books_count', 'max_bookmarked_books_same_genre',
    'saved_highlights_count',
    'villain_followed_count', 'hero_followed_count', 'character_guardian_achieved'
  ));

CREATE OR REPLACE FUNCTION public.sync_user_achievements(p_user_id uuid)
RETURNS SETOF public.user_achievements AS $$
DECLARE
  v_template public.achievement_templates;
  v_count integer;
  v_txn public.transactions;
  v_row public.user_achievements;
BEGIN
  FOR v_template IN
    SELECT * FROM public.achievement_templates
    WHERE active AND metric IS NOT NULL
      AND id NOT IN (
        SELECT achievement_id FROM public.user_achievements WHERE user_id = p_user_id
      )
  LOOP
    v_count := CASE v_template.metric
      WHEN 'books_published' THEN
        (SELECT count(*) FROM public.books WHERE author_id = p_user_id AND published)
      WHEN 'audio_published' THEN
        (SELECT count(*) FROM public.audio_narrations WHERE narrator_id = p_user_id)
      WHEN 'design_published' THEN
        (SELECT count(*) FROM public.design_items WHERE illustrator_id = p_user_id)
      WHEN 'chapters_read' THEN
        (SELECT count(DISTINCT chapter_id) FROM public.reading_history
           WHERE user_id = p_user_id AND chapter_id IS NOT NULL)
      WHEN 'genres_read_count' THEN
        (SELECT count(DISTINCT b.genre) FROM public.reading_history rh
           JOIN public.books b ON b.id = rh.book_id
           WHERE rh.user_id = p_user_id AND b.genre IS NOT NULL)
      WHEN 'night_reads_count' THEN
        (SELECT count(*) FROM public.reading_history
           WHERE user_id = p_user_id
             AND (EXTRACT(HOUR FROM timezone('utc', read_at)) >= 22
                  OR EXTRACT(HOUR FROM timezone('utc', read_at)) < 2))
      WHEN 'finished_stories_count' THEN
        (SELECT count(DISTINCT rh.book_id) FROM public.reading_history rh
           JOIN public.chapters c ON c.id = rh.chapter_id
           WHERE rh.user_id = p_user_id AND c.is_last_chapter = true)
      WHEN 'longest_consecutive_chapters' THEN
        (WITH read_chapters AS (
           SELECT DISTINCT c.book_id, c.order_index
           FROM public.reading_history rh
           JOIN public.chapters c ON c.id = rh.chapter_id
           WHERE rh.user_id = p_user_id
         ), grp AS (
           SELECT book_id, order_index - row_number() OVER (PARTITION BY book_id ORDER BY order_index) AS g
           FROM read_chapters
         )
         SELECT coalesce(max(run_length), 0) FROM (
           SELECT book_id, g, count(*) AS run_length FROM grp GROUP BY book_id, g
         ) runs)
      WHEN 'distinct_reading_days_count' THEN
        (SELECT count(DISTINCT read_at::date) FROM public.reading_history WHERE user_id = p_user_id)
      WHEN 'max_reading_sessions_per_day' THEN
        (WITH events AS (
           SELECT read_at::date AS d, read_at,
                  read_at - lag(read_at) OVER (PARTITION BY read_at::date ORDER BY read_at) AS gap
           FROM public.reading_history WHERE user_id = p_user_id
         )
         SELECT coalesce(max(session_count), 0) FROM (
           SELECT d, count(*) FILTER (WHERE gap IS NULL OR gap > INTERVAL '30 minutes') AS session_count
           FROM events GROUP BY d
         ) s)
      WHEN 'max_gap_days_same_book' THEN
        (WITH book_events AS (
           SELECT book_id, read_at - lag(read_at) OVER (PARTITION BY book_id ORDER BY read_at) AS gap
           FROM public.reading_history WHERE user_id = p_user_id
         )
         SELECT coalesce(max(extract(day FROM gap)::integer), 0) FROM book_events)
      WHEN 'weekend_both_days_read' THEN
        (SELECT CASE WHEN
           EXISTS(SELECT 1 FROM public.reading_history WHERE user_id = p_user_id AND extract(dow FROM read_at) = 6)
           AND EXISTS(SELECT 1 FROM public.reading_history WHERE user_id = p_user_id AND extract(dow FROM read_at) = 0)
         THEN 1 ELSE 0 END)
      WHEN 'max_books_read_same_genre' THEN
        (SELECT coalesce(max(cnt), 0) FROM (
           SELECT b.genre, count(DISTINCT rh.book_id) AS cnt
           FROM public.reading_history rh JOIN public.books b ON b.id = rh.book_id
           WHERE rh.user_id = p_user_id AND b.genre IS NOT NULL
           GROUP BY b.genre
         ) t)
      WHEN 'max_genres_within_15_days' THEN
        (WITH first_genre_read AS (
           SELECT b.genre, min(rh.read_at) AS first_read
           FROM public.reading_history rh JOIN public.books b ON b.id = rh.book_id
           WHERE rh.user_id = p_user_id AND b.genre IS NOT NULL
           GROUP BY b.genre
         )
         SELECT coalesce(max(cnt), 0) FROM (
           SELECT o1.genre, count(*) AS cnt
           FROM first_genre_read o1
           JOIN first_genre_read o2 ON o2.first_read BETWEEN o1.first_read AND o1.first_read + INTERVAL '15 days'
           GROUP BY o1.genre
         ) t)
      WHEN 'topup_count' THEN
        (SELECT count(*) FROM public.transactions
           WHERE user_id = p_user_id AND type = 'topup' AND status <> 'reversed')
      WHEN 'sad_ending_finished_count' THEN
        (SELECT count(DISTINCT rh.book_id) FROM public.reading_history rh
           JOIN public.chapters c ON c.id = rh.chapter_id
           JOIN public.books b ON b.id = rh.book_id
           WHERE rh.user_id = p_user_id AND c.is_last_chapter = true
             AND EXISTS (SELECT 1 FROM unnest(b.tags) tg WHERE lower(trim(tg)) = 'kết buồn'))
      WHEN 'underrated_finished_count' THEN
        (SELECT count(DISTINCT rh.book_id) FROM public.reading_history rh
           JOIN public.chapters c ON c.id = rh.chapter_id
           JOIN public.books b ON b.id = rh.book_id
           WHERE rh.user_id = p_user_id AND c.is_last_chapter = true AND b.view_count < 50)
      WHEN 'bookmarked_books_count' THEN
        (SELECT count(DISTINCT rli.book_id) FROM public.reading_list_items rli
           JOIN public.reading_lists rl ON rl.id = rli.list_id
           WHERE rl.user_id = p_user_id)
      WHEN 'max_bookmarked_books_same_genre' THEN
        (SELECT coalesce(max(cnt), 0) FROM (
           SELECT b.genre, count(DISTINCT rli.book_id) AS cnt
           FROM public.reading_list_items rli
           JOIN public.reading_lists rl ON rl.id = rli.list_id
           JOIN public.books b ON b.id = rli.book_id
           WHERE rl.user_id = p_user_id AND b.genre IS NOT NULL
           GROUP BY b.genre
         ) t)
      WHEN 'saved_highlights_count' THEN
        (SELECT count(*) FROM public.highlights WHERE user_id = p_user_id)
      WHEN 'villain_followed_count' THEN
        (SELECT count(*) FROM public.character_follows cf
           JOIN public.characters ch ON ch.id = cf.character_id
           WHERE cf.follower_id = p_user_id AND ch.role = 'villain')
      WHEN 'hero_followed_count' THEN
        (SELECT count(*) FROM public.character_follows cf
           JOIN public.characters ch ON ch.id = cf.character_id
           WHERE cf.follower_id = p_user_id AND ch.role = 'hero')
      WHEN 'character_guardian_achieved' THEN
        -- Follow >=1 nhân vật MÀ đã đọc HẾT mọi chương đã xuất bản có gắn
        -- nhân vật đó (không có chương xuất bản nào của nhân vật đó mà
        -- user CHƯA đọc).
        (SELECT CASE WHEN EXISTS (
           SELECT 1 FROM public.character_follows cf
           WHERE cf.follower_id = p_user_id
             AND NOT EXISTS (
               SELECT 1 FROM public.chapter_characters cc
               JOIN public.chapters c ON c.id = cc.chapter_id
               WHERE cc.character_id = cf.character_id AND c.published
                 AND NOT EXISTS (
                   SELECT 1 FROM public.reading_history rh
                   WHERE rh.user_id = p_user_id AND rh.chapter_id = c.id
                 )
             )
             -- Loại nhân vật CHƯA xuất hiện ở chương xuất bản nào — follow
             -- 1 nhân vật rỗng không nên tự động "hoàn thành".
             AND EXISTS (
               SELECT 1 FROM public.chapter_characters cc
               JOIN public.chapters c ON c.id = cc.chapter_id
               WHERE cc.character_id = cf.character_id AND c.published
             )
         ) THEN 1 ELSE 0 END)
      ELSE 0
    END;

    IF v_count >= v_template.threshold THEN
      v_txn := NULL;
      IF v_template.reward_tokens > 0 THEN
        v_txn := public.apply_transaction(
          p_user_id, 'achievement_bonus', v_template.reward_tokens,
          'achievement', v_template.id
        );
      END IF;

      INSERT INTO public.user_achievements (user_id, achievement_id, transaction_id)
      VALUES (p_user_id, v_template.id, v_txn.id)
      RETURNING * INTO v_row;

      RETURN NEXT v_row;
    END IF;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.sync_user_achievements FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_achievements TO service_role;

INSERT INTO public.achievement_templates (code, for_role, title, description, icon, color_token, metric, threshold, reward_tokens, active)
VALUES
  ('reader_follow_villain', NULL, 'Kẻ tìm kiếm phản diện', 'Theo dõi 1 nhân vật villain.', 'trophy', 'reader', 'villain_followed_count', 1, 10, true),
  ('reader_follow_hero', NULL, 'Người yêu chính nghĩa', 'Theo dõi 1 nhân vật người hùng.', 'trophy', 'reader', 'hero_followed_count', 1, 10, true),
  ('reader_character_guardian', NULL, 'Người bảo hộ nhân vật', 'Follow một nhân vật và đọc toàn bộ chương có nhân vật đó.', 'trophy', 'reader', 'character_guardian_achieved', 1, 30, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.task_templates (code, title, description, for_role, quest_type, genre, target_count, reward_tokens, active)
VALUES
  ('reader_vote_trope', 'Bắt đúng gu nhân vật', 'Bình chọn mẫu hình nhân vật bạn thích nhất trong chương (vd: Ma vương, Trượng nghĩa, Lạnh lùng).', NULL, 'lore_hunt', NULL, 1, 10, true)
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- Notes:
-- 1. docs/supabase/schema.sql — mirror 4 bảng mới (phần gần chapters/9)
--    + constraint mới + CREATE OR REPLACE sync_user_achievements().
-- 2. src/lib/supabase/types.ts — Tables cho characters/chapter_characters/
--    character_follows/character_trope_votes, mở rộng AchievementMetric,
--    thêm CharacterRole type.
-- 3. src/lib/quests/achievement-service.ts — getMetricCounts() thêm 3
--    công thức tương ứng.
-- 4. API MỚI (không nằm trong file SQL này):
--    - src/app/api/authoring/books/[bookId]/characters/route.ts (GET/POST)
--    - src/app/api/authoring/books/[bookId]/characters/[characterId]/route.ts (PATCH/DELETE)
--    - src/app/api/authoring/chapters/[chapterId]/characters/route.ts (GET/PUT — gắn nhân vật vào chương)
--    - src/app/api/characters/[characterId]/follow/route.ts (POST toggle)
--    - src/app/api/chapters/[chapterId]/trope-vote/route.ts (POST — tăng reader_vote_trope)
-- 5. UI MỚI:
--    - src/components/author/character-manager.tsx (CRUD nhân vật, nối
--      vào book-overview.tsx)
--    - src/components/author/chapter-characters-panel.tsx (gắn nhân vật
--      vào chương, nối vào author-workspace.tsx)
--    - src/components/story/character-list.tsx (hiện nhân vật + follow,
--      nối vào story-tabs.tsx — thêm tab "Nhân vật")
--    - src/components/reading/trope-vote-panel.tsx (bình chọn, nối vào
--      reader.tsx)