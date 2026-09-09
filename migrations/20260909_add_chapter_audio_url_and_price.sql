-- Migration: thêm link audio + giá audio riêng cho chapters — trước migration
-- này, chương chỉ có 1 giá duy nhất (`price`, cho phần TRUYỆN CHỮ). Tác giả
-- giờ có thể dán 1 link audio đơn giản (không qua cơ chế "share link nội bộ
-- id&token" của ChapterAudioPanel/audio_narrations — xem publish-panel.tsx)
-- kèm giá riêng cho bản audio đó, hiển thị thành 1 hàng "Truyện audio" thêm
-- vào panel Giá khi có link.
--
-- Cố tình KHÔNG dùng lại chapter_audio_links/audio_narrations (cơ chế "Tự
-- thu & gắn"/"Dán link chia sẻ" đã có) — 2 bảng đó không có cột giá, và mở
-- rộng chúng để thêm giá + gắn vào purchase_transactions là việc lớn hơn
-- nhiều (nhiều chương có thể share 1 audio_narration, giá lại là khái niệm
-- theo TỪNG CHƯƠNG). Cột mới ở đây CHỈ lưu link + giá do tác giả tự nhập,
-- CHƯA enforce việc mua/chặn nghe (xem ghi chú ở cuối file) — đó là việc
-- tiếp theo, ngoài phạm vi migration này.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

-- audio_url: link do tác giả dán, hiển thị cho độc giả/enforce sau — NULL
-- = chương này không có bản audio riêng (khác "" rỗng, tránh lẫn giữa
-- "chưa từng nhập" và "đã xoá link đi").
ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS audio_url text;

-- audio_price: cùng công thức với price (migrations/20260820_add_chapter_price.sql)
-- — số token để MỞ audio, 0 = miễn phí. Không CHECK > 0 vì đây là giá niêm
-- yết (được phép = 0), giống hệt lý do `price` không CHECK > 0.
ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS audio_price integer NOT NULL DEFAULT 0;

ALTER TABLE public.chapters
  DROP CONSTRAINT IF EXISTS chapters_audio_price_check;

ALTER TABLE public.chapters
  ADD CONSTRAINT chapters_audio_price_check CHECK (audio_price >= 0);

COMMIT;

-- Notes:
-- 1. Không cần RLS mới — cùng 2 cột `price`/`is_exclusive`, được policy
--    "authors update chapters on their own books" (docs/supabase/schema.sql)
--    cover sẵn.
-- 2. Idempotent (IF NOT EXISTS/IF EXISTS) — chạy lại an toàn.
-- 3. Sau khi chạy, cập nhật riêng (đã làm sẵn trong cùng commit này):
--      - docs/supabase/schema.sql — thêm đoạn ALTER TABLE này gần
--        `price`/`is_exclusive`.
--      - src/lib/supabase/types.ts — thêm `audio_url`/`audio_price` trên
--        chapters.Row/Insert/Update.
-- 4. audio_price hiện CHỈ là giá niêm yết hiển thị/lưu trên chapter —
--    CHƯA enforce chặn nghe (khác `price`, đã vá ở
--    src/app/read/[bookSlug]/[chapterId]/page.tsx + POST
--    /api/chapters/[chapterId]/purchase). Việc chặn nghe theo audio_price
--    (bảng ghi nhận đã mua riêng cho audio, khác purchase_transactions vốn
--    chỉ có (buyer_id, chapter_id) không phân biệt text/audio) là việc
--    tiếp theo.
