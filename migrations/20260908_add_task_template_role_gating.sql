-- Migration: gate nhiệm vụ ngày theo "for_role" — tác giả/người thu âm/
-- thiết kế, dựa trên sản phẩm THẬT đã đăng (không phải profiles.creator_tags
-- — cột đó tự khai, chưa có UI để user tự set, và không mang quyền hạn gì
-- theo thiết kế gốc, xem schema.sql phần 1). Đọc giả vẫn là mặc định —
-- for_role NULL = áp dụng chung cho mọi người, đúng convention đã dùng
-- cho quest_type NULL (migrations/20260827_extend_task_templates_for_quests.sql).
--
-- Việc "unlock" role tính bằng EXISTS trực tiếp trên books/audio_narrations/
-- design_items tại thời điểm sinh pool (xem
-- src/lib/quests/creator-roles.ts) — KHÔNG cache lại trên profiles, vì hệ
-- thống không bao giờ xoá hàng thật (soft-delete/purge chỉ rỗng nội dung,
-- giữ author_id/narrator_id/illustrator_id — xem
-- migrations/20260908_add_content_purge_retention.sql), nên EXISTS đã tự
-- nhiên vĩnh viễn (một khi true, mãi mãi true) mà không cần đồng bộ thêm.
--
-- Run in the Supabase SQL editor (or via psql). Idempotent.

BEGIN;

ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS for_role text;

ALTER TABLE public.task_templates
  ADD CONSTRAINT task_templates_for_role_check
  CHECK (for_role IS NULL OR for_role IN ('author', 'narrator', 'designer'));

COMMIT;

-- Notes:
-- 1. Không đổi RLS/GRANT của task_templates — policy "authenticated users
--    can view active task templates" (schema.sql phần 7) đã cho đọc mọi
--    cột của hàng active, for_role không cần quyền riêng. Việc LỌC theo
--    role của từng user nằm ở service layer (quest-pool-service.ts), không
--    phải RLS — cùng cách quest_type/genre/author_id đang được lọc.
-- 2. Idempotent — IF NOT EXISTS trên ADD COLUMN; ADD CONSTRAINT lỗi nếu
--    chạy lại lần 2 (không tự chống trùng, giống các migration ADD
--    CONSTRAINT khác trong thư mục này).
-- 3. Sau khi chạy, cập nhật (không nằm trong file SQL này):
--      - docs/supabase/schema.sql — thêm cột + constraint vào phần 10.
--      - src/lib/supabase/types.ts — task_templates Row/Insert thêm for_role.
--      - src/lib/quests/creator-roles.ts (mới) — tính unlocked roles.
--      - src/lib/quests/quest-pool-service.ts — lọc theo for_role khi sinh
--        pool và khi reset 1 slot.
