-- Migration: mở rộng task_templates/user_daily_tasks để làm nền cho Hệ
-- thống Nhiệm vụ Vịnh (Quest System), THAY VÌ tạo bảng system_quests mới.
--
-- Lý do đổi hướng so với bản spec gốc: task_templates + user_daily_tasks
-- (schema.sql phần 7) đã làm đúng thứ "system_quests" + "user_quest_progress"
-- định làm lại — 1 bảng định nghĩa nhiệm vụ + 1 bảng tiến trình/ngày mỗi
-- user, cùng 2 hàm increment_task_progress()/claim_daily_task() để ghi
-- progress và trả thưởng an toàn (chống nhận 2 lần). Tạo thêm 1 cặp bảng
-- song song chỉ khác tên sẽ cho ra 2 khái niệm "nhiệm vụ" chồng nhau
-- trong UI. Quyết định: MỞ RỘNG cặp bảng cũ.
--
-- quest_examples_pool và hidden_quests (2 migration khác, cùng ngày) vẫn
-- là bảng MỚI — không có tương đương cũ để mở rộng.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

-- --- task_templates: các cột spec Quest System cần, để 1 template có thể
-- vừa là "nhiệm vụ hàng ngày" cũ (quest_type NULL, mọi cột quest đều NULL)
-- vừa là 1 "system quest" mới (quest_type NOT NULL). ---

-- quest_type: NULL cho các task_templates cũ đã tồn tại trước migration
-- này (vd 'read_3_chapters') — chúng không thuộc taxonomy quest, không
-- cần backfill giả. Bắt buộc có giá trị cho mọi template mới thuộc Quest
-- System, vì quest_examples_pool tra cứu/so khớp few-shot theo đúng cột
-- này (KHÔNG dùng để tra bảng thưởng nào — task_templates.reward_tokens
-- vẫn là số gốc, không có bảng "reward_rules" chung, xem
-- migrations/20260827_add_hidden_quests.sql).
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS quest_type text;

ALTER TABLE public.task_templates
  ADD CONSTRAINT task_templates_quest_type_check
  CHECK (quest_type IS NULL OR quest_type IN (
    'discovery', 'engagement', 'lore_hunt', 'cross_compare', 'prediction', 'topup'
  ));

-- Vị trí neo trong chương mà quest này hỏi tới — {chapter_id, paragraph_index,
-- char_start, char_end}. NULL cho quest không gắn 1 vị trí cụ thể (vd
-- quest 'topup', hoặc nhiệm vụ hàng ngày cũ). Không có paragraph_id dạng
-- FK — chapters.content là 1 cột text duy nhất, không có bảng paragraph
-- riêng; paragraph_index là chỉ số tính phía client lúc render (tách theo
-- \n\n), lưu lại đây chỉ để hiển thị lại đúng chỗ, không dùng để JOIN.
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS chapter_ref jsonb;

-- genre: dùng để match few-shot pool cùng thể loại (quest_examples_pool.genre)
-- và để random pool có thể ưu tiên thể loại user đang đọc. Text tự do,
-- KHÔNG check theo books_genre_check — 1 quest có thể áp dụng chung nhiều
-- genre (giá trị NULL) hoặc đúng 1 genre, không cần ép khớp enum của books.
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS genre text;

-- author_id: NULL cho quest chung toàn nền tảng (vd nhiệm vụ đọc N chương
-- bất kỳ); NOT NULL khi quest gắn vào đúng 1 sách/tác giả cụ thể (lore_hunt,
-- cross_compare). Không FK vào books — 1 quest có thể tham chiếu nhiều
-- chương của nhiều sách khác nhau (cross_compare), nên chỉ giữ author_id
-- để lọc/báo cáo, chi tiết chương thật nằm trong chapter_ref.
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS author_id uuid references auth.users (id);

-- generated_by: 'manual' (mặc định, backfill đúng cho mọi row đã có sẵn —
-- chúng đều do admin soạn tay) hoặc version string của model sinh quest
-- (vd 'claude-sonnet-4-6-v1') ở Phase 2+. Text tự do, không enum — version
-- string thay đổi liên tục theo model, ép enum sẽ phải ALTER TYPE mỗi lần.
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS generated_by text NOT NULL DEFAULT 'manual';

-- quality_flag: gắn khi thời gian nhận -> hoàn thành quá nhanh so với thời
-- gian đọc tối thiểu ước tính (xem ràng buộc "áp dụng mọi phase" trong
-- spec) — KHÔNG chặn hoàn thành, chỉ đánh dấu để giảm trọng số dữ liệu khi
-- dùng cho chân dung độc giả.
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS quality_flag text;

-- similarity_to_pool_score: điểm giống với quest_examples_pool lúc sinh
-- (Phase 2+) — NULL cho quest thủ công (không có gì để so sánh, không
-- phải 0, vì 0 nghĩa là "khác biệt hoàn toàn" — 1 giá trị có ý nghĩa).
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS similarity_to_pool_score double precision;

ALTER TABLE public.task_templates
  ADD CONSTRAINT task_templates_similarity_score_check
  CHECK (similarity_to_pool_score IS NULL OR similarity_to_pool_score BETWEEN 0 AND 1);

-- auto_flag_reason: lý do rule-based check gắn quality_flag/similarity thấp
-- (Phase 2+) — dữ liệu dùng để tinh chỉnh prompt sinh quest, không phải
-- cột hiển thị cho user.
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS auto_flag_reason text;

-- --- user_daily_tasks: track việc reset, cần cho cơ chế "reset 1-2 lần/
-- ngày, cooldown giảm xác suất xuất hiện lại" (spec mục 1.3). Số đếm
-- nhanh cho UI (vd disable nút reset khi đã dùng hết lượt hôm nay) — lịch
-- sử chi tiết "quest nào bị reset -> quest nào thay vào" nằm ở bảng
-- quest_reset_events (migrations/20260827_add_quest_reset_events.sql),
-- KHÔNG lặp lại ở đây. ---
ALTER TABLE public.user_daily_tasks ADD COLUMN IF NOT EXISTS reset_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.user_daily_tasks
  ADD CONSTRAINT user_daily_tasks_reset_count_check CHECK (reset_count >= 0);

COMMIT;

-- Notes:
-- 1. Idempotent — chạy lại an toàn (IF NOT EXISTS trên mọi ADD COLUMN;
--    ADD CONSTRAINT sẽ lỗi nếu chạy 2 lần — bỏ qua constraint đã tồn tại
--    nếu re-run, giống các migration ADD CONSTRAINT khác trong thư mục
--    này không tự chống trùng).
-- 2. KHÔNG có cột "status" (pending|published|rejected_auto|...) như
--    system_quests bản spec gốc — cột đó phục vụ vòng đời duyệt quest do
--    AI sinh (Phase 2+, bảng quest_candidates riêng đã có sẵn trong spec,
--    không đổi). Ở Phase 1 (soạn thủ công), `active` hiện có trên
--    task_templates đã đủ đóng vai trò "hiện/ẩn trong random pool".
-- 3. Cập nhật docs/supabase/schema.sql (thêm vào cuối phần 7) +
--    src/lib/supabase/types.ts (Tables.task_templates.Row + Insert,
--    Tables.user_daily_tasks.Row — Insert/Update của user_daily_tasks vẫn
--    là `never`, không đổi, vì reset vẫn phải đi qua 1 hàm security
--    definer mới, không phải UPDATE trực tiếp — xem
--    migrations/20260827_add_quest_reset_events.sql).
