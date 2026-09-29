-- Migration: Bình luận cho Thiết kế (design_items) + Audio (audio_narrations)
-- (Phase 2 của kế hoạch triển khai nhiem-vu-thanh-tuu-hoan-thanh.xlsx —
-- mở khoá designer_interact_readers/narrator_interact_listeners, trước
-- đó bị loại khỏi Phase 1 vì "chưa có bảng comment nào cho design_items/
-- audio_narrations", xem migrations/20260917_seed_phase1_quests_achievements.sql).
--
-- Cấu trúc mirror anchored_comments (docs/supabase/schema.sql phần 10f)
-- nhưng BỎ paragraph_index/char_start/char_end/quest_id (không có khái
-- niệm "đoạn văn" hay "quest neo comment" cho thiết kế/audio) — chỉ còn
-- reply 1 cấp (parent_comment_id), enforce ở API route như anchored_comments,
-- không phải CHECK DB.
--
-- design_comment_likes/audio_comment_likes mirror design_item_likes (phần
-- 9) — toggle, 1 dòng/(comment, user), RLS owner-only + aggregate qua view
-- riêng (view chạy quyền OWNER, bypass RLS cho số đếm công khai — cùng lý
-- do design_item_like_counts).
--
-- "thả tim" (designer_interact_readers) dùng design_comment_likes;
-- narrator_interact_listeners CHỈ cần reply (theo đúng mô tả trong file,
-- không có "thả tim") nên audio không cần bảng like riêng — vẫn tạo
-- audio_comment_likes để 2 tính năng đối xứng ở tầng UI (nút thả tim vẫn
-- hiện cho audio, chỉ không tính vào quest nào) thay vì tạo bất đối xứng
-- khó hiểu giữa 2 trang.
--
-- Idempotent — CREATE TABLE IF NOT EXISTS / DROP POLICY IF EXISTS rồi tạo
-- lại, an toàn chạy lại nhiều lần.

BEGIN;

CREATE TABLE IF NOT EXISTS public.design_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_item_id uuid NOT NULL REFERENCES public.design_items (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(trim(content)) > 0),
  parent_comment_id uuid REFERENCES public.design_comments (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS design_comments_design_item_id_idx ON public.design_comments (design_item_id);
CREATE INDEX IF NOT EXISTS design_comments_parent_idx ON public.design_comments (parent_comment_id) WHERE parent_comment_id IS NOT NULL;

ALTER TABLE public.design_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "design comments are publicly readable" ON public.design_comments;
CREATE POLICY "design comments are publicly readable"
  ON public.design_comments FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "users write their own design comments" ON public.design_comments;
CREATE POLICY "users write their own design comments"
  ON public.design_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users delete their own design comments" ON public.design_comments;
CREATE POLICY "users delete their own design comments"
  ON public.design_comments FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admins moderate design comments" ON public.design_comments;
CREATE POLICY "admins moderate design comments"
  ON public.design_comments FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')));

CREATE TABLE IF NOT EXISTS public.design_comment_likes (
  comment_id uuid NOT NULL REFERENCES public.design_comments (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS design_comment_likes_comment_id_idx ON public.design_comment_likes (comment_id);

ALTER TABLE public.design_comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage their own design comment likes" ON public.design_comment_likes;
CREATE POLICY "users manage their own design comment likes"
  ON public.design_comment_likes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE VIEW public.design_comment_like_counts AS
  SELECT comment_id, count(*)::integer AS like_count
  FROM public.design_comment_likes
  GROUP BY comment_id;

-- --- Audio — cùng cấu trúc, khác bảng gốc tham chiếu. ---

CREATE TABLE IF NOT EXISTS public.audio_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audio_narration_id uuid NOT NULL REFERENCES public.audio_narrations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(trim(content)) > 0),
  parent_comment_id uuid REFERENCES public.audio_comments (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audio_comments_audio_narration_id_idx ON public.audio_comments (audio_narration_id);
CREATE INDEX IF NOT EXISTS audio_comments_parent_idx ON public.audio_comments (parent_comment_id) WHERE parent_comment_id IS NOT NULL;

ALTER TABLE public.audio_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audio comments are publicly readable" ON public.audio_comments;
CREATE POLICY "audio comments are publicly readable"
  ON public.audio_comments FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "users write their own audio comments" ON public.audio_comments;
CREATE POLICY "users write their own audio comments"
  ON public.audio_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users delete their own audio comments" ON public.audio_comments;
CREATE POLICY "users delete their own audio comments"
  ON public.audio_comments FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admins moderate audio comments" ON public.audio_comments;
CREATE POLICY "admins moderate audio comments"
  ON public.audio_comments FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')));

CREATE TABLE IF NOT EXISTS public.audio_comment_likes (
  comment_id uuid NOT NULL REFERENCES public.audio_comments (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS audio_comment_likes_comment_id_idx ON public.audio_comment_likes (comment_id);

ALTER TABLE public.audio_comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage their own audio comment likes" ON public.audio_comment_likes;
CREATE POLICY "users manage their own audio comment likes"
  ON public.audio_comment_likes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE VIEW public.audio_comment_like_counts AS
  SELECT comment_id, count(*)::integer AS like_count
  FROM public.audio_comment_likes
  GROUP BY comment_id;

INSERT INTO public.task_templates (code, title, description, for_role, quest_type, genre, target_count, reward_tokens, active)
VALUES
  ('designer_interact_readers', 'Thiết kế thân thiện', 'Trả lời hoặc thả tim ít nhất 2 bình luận về thiết kế của bạn.', 'designer', 'engagement', NULL, 2, 15, true),
  ('narrator_interact_listeners', 'Giọng đọc thân thiện', 'Trả lời ít nhất 2 bình luận về audio của bạn.', 'narrator', 'engagement', NULL, 2, 15, true)
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- Notes:
-- 1. docs/supabase/schema.sql — thêm 6 bảng/view mới (design_comments,
--    design_comment_likes, design_comment_like_counts,
--    audio_comments, audio_comment_likes, audio_comment_like_counts)
--    vào phần 9 (design/audio), ngay sau design_item_likes/audio tương ứng.
-- 2. src/lib/supabase/types.ts — thêm Tables cho cả 6.
-- 3. Route MỚI (cùng đợt code, không nằm trong file SQL này):
--    - src/app/api/design/[designItemId]/comments/route.ts (GET/POST)
--    - src/app/api/design/[designItemId]/comments/[commentId]/route.ts (DELETE)
--    - src/app/api/design/[designItemId]/comments/[commentId]/like/route.ts (POST toggle)
--      — tăng tiến trình designer_interact_readers khi CHỦ tác phẩm reply
--      HOẶC thả tim bình luận của người khác (không tự thả tim/reply bình
--      luận của chính mình).
--    - src/app/api/audio/[audioNarrationId]/comments/route.ts (GET/POST)
--    - src/app/api/audio/[audioNarrationId]/comments/[commentId]/route.ts (DELETE)
--    - src/app/api/audio/[audioNarrationId]/comments/[commentId]/like/route.ts (POST toggle,
--      KHÔNG tính quest nào — narrator_interact_listeners chỉ tính reply)
--      — tăng tiến trình narrator_interact_listeners khi CHỦ audio reply
--      bình luận của người khác.
-- 4. UI MỚI: src/components/comments/content-comments-panel.tsx (component
--    dùng chung, mirror src/components/reading/paragraph-comments-panel.tsx),
--    nối vào modal chi tiết trong src/components/design/design-gallery.tsx
--    và panel trong src/components/audio/now-playing.tsx.