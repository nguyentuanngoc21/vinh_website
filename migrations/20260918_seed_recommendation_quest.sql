-- Migration: Phase 4 — nối recommend_books() vào UI thật ("Gợi ý cho bạn"
-- ở trang chủ) + import reader_view_recommendations, từ
-- nhiem-vu-thanh-tuu-hoan-thanh.xlsx.
--
-- recommend_books() (docs/supabase/schema.sql) đã tồn tại từ trước nhưng
-- CHƯA từng được gọi ở đâu trong app — mồ côi hoàn toàn (xem
-- migrations/20260917_seed_phase1_quests_achievements.sql, lý do quest
-- này bị loại khỏi Phase 1). Đã nối vào src/app/page.tsx (section mới
-- "Gợi ý cho bạn", src/components/recommended-for-you.tsx) trong cùng đợt
-- code — migration này chỉ seed dữ liệu.
--
-- reader_try_recommended_story ĐÃ GỘP vào reader_view_recommendations
-- theo yêu cầu của bạn — chỉ còn 1 quest duy nhất ở đây (không import
-- reader_try_recommended_story), giữ "Xem trang giới thiệu" (view-based)
-- thay vì "đọc ít nhất 1 chương" (đọc-based) vì dễ theo dõi đáng tin cậy
-- hơn — click từ mục gợi ý (?from=goi-y) là tín hiệu rõ ràng, còn "đọc từ
-- gợi ý" cần thêm 1 lớp theo dõi nguồn gốc tới tận lúc hoàn thành chương.
--
-- Idempotent — ON CONFLICT (code) DO NOTHING.

BEGIN;

INSERT INTO public.task_templates (code, title, description, for_role, quest_type, genre, target_count, reward_tokens, active)
VALUES
  ('reader_view_recommendations', 'Xem gợi ý cho bạn', 'Xem trang giới thiệu của 3 tác phẩm trong mục gợi ý.', NULL, 'discovery', NULL, 3, 8, true)
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- Notes:
-- 1. Không đổi schema — chỉ seed dữ liệu.
-- 2. Code mới cùng đợt (không nằm trong file SQL này):
--    - src/lib/home/get-homepage-books.ts — export toHomepageBooks() để
--      dùng chung.
--    - src/lib/recommendations/get-recommended-books.ts (MỚI) — wrap
--      recommend_books().
--    - src/components/recommended-for-you.tsx (MỚI) — section trang chủ,
--      mỗi link kèm ?from=goi-y.
--    - src/app/page.tsx — thêm section trên, chỉ hiện khi đã đăng nhập
--      (recommend_books() cần user thật, không fallback "sách mới" trùng
--      NewWorksGrid).
--    - src/app/truyen/[slug]/page.tsx — nhận thêm searchParams, tăng tiến
--      trình reader_view_recommendations khi có ?from=goi-y VÀ đã đăng
--      nhập.