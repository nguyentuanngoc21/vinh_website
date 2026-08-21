-- Migration: thêm giá + độc quyền cho chapters — UI "Giá chương"/"Quyền độc
-- quyền" ở panel xuất bản (src/components/author/publish-panel.tsx) trước
-- đây chỉ là state cục bộ, không có cột nào để lưu. Khác migration genre
-- hôm trước (đó là "quên nối" 1 field đã có ở mock) — 2 cột này CHƯA TỪNG
-- tồn tại trong schema.
--
-- Run in the Supabase SQL editor (or via psql), same as
-- 20260819_add_book_genre.sql. Test in staging first.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Giá + độc quyền trên chapters
-- ---------------------------------------------------------------------
-- price: số token để đọc chương này. 0 = miễn phí — không có CHECK > 0
-- như purchase_transactions.amount (chỗ đó là số tiền 1 GIAO DỊCH thật,
-- luôn > 0; đây là GIÁ NIÊM YẾT, được phép = 0).
ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS price integer NOT NULL DEFAULT 0;

ALTER TABLE public.chapters
  DROP CONSTRAINT IF EXISTS chapters_price_check;

ALTER TABLE public.chapters
  ADD CONSTRAINT chapters_price_check CHECK (price >= 0);

-- is_exclusive: true = chỉ phân phối trên Vịnh (mặc định, khớp UI mock
-- cũ luôn để "Độc quyền" là lựa chọn active sẵn).
ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS is_exclusive boolean NOT NULL DEFAULT true;

COMMIT;

-- Notes:
-- 1. Không cần RLS mới — 2 cột này được policy "authors update their own
--    books"/"authors update chapters on their own books" (phần 3,
--    docs/supabase/schema.sql) cover sẵn, không phải link chéo bảng cần
--    hàm riêng như cover_design_item_id.
-- 2. Idempotent (IF NOT EXISTS/IF EXISTS) — chạy lại an toàn.
-- 3. Sau khi chạy, cập nhật riêng (không nằm trong file SQL này):
--      - docs/supabase/schema.sql — thêm đoạn ALTER TABLE này gần định
--        nghĩa bảng chapters.
--      - src/lib/supabase/types.ts — thêm field `price`/`is_exclusive`
--        trên chapters.Row/Insert.
-- 4. price hiện tại chỉ là GIÁ NIÊM YẾT hiển thị/lưu trên chapter — chưa
--    tự động nối vào create_purchase()/purchase_transactions (route mua
--    chương thật, nếu có, vẫn tự truyền p_amount riêng — việc nối 2 chỗ
--    này lại với nhau là 1 việc khác, ngoài phạm vi migration này).
