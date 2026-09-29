-- Migration: thêm transaction_type = 'quest_reward' cho Hệ thống Nhiệm vụ
-- Vịnh (Quest System).
--
-- Quest system KHÔNG có ledger riêng (không có bảng token_ledger) — mọi
-- khoản thưởng quest đi qua đúng 1 đường ghi số dư hiện có:
-- apply_transaction() -> bảng transactions (xem schema.sql phần 6). Value
-- mới này chỉ để phân loại loại giao dịch, y hệt 'daily_task_reward' đã
-- có sẵn cho hệ thống nhiệm vụ hàng ngày cũ — quest reward dùng
-- reference_type = 'quest', reference_id = task_templates.id hoặc
-- hidden_quests.id (xem migrations/20260827_extend_task_templates_for_quests.sql
-- và 20260827_add_hidden_quests.sql).
--
-- Chạy riêng migration này (không gộp chung transaction với bất kỳ câu
-- lệnh nào DÙNG giá trị enum mới) — trước PostgreSQL 12, ALTER TYPE ...
-- ADD VALUE không cho dùng giá trị mới ngay trong cùng transaction; giữ
-- quy tắc này cho an toàn dù Supabase hiện tại chạy PG mới hơn.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'quest_reward';

-- Notes:
-- 1. Không cần BEGIN/COMMIT — ALTER TYPE ADD VALUE tự chạy trong transaction
--    ẩn của chính nó, và không được gọi lại bên trong 1 transaction block
--    đang mở kèm câu lệnh khác.
-- 2. Cập nhật src/lib/supabase/types.ts: thêm 'quest_reward' vào union
--    TransactionType.
