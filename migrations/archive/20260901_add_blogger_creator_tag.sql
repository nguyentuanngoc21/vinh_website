-- Migration: thêm creator_tag = 'blogger'.
--
-- Kết nối (/ket-noi) thêm chip lọc "Blogger" cùng nhóm với 'author' /
-- 'illustrator' / 'narrator' hiện có (xem schema.sql phần 1,
-- public.creator_tag). Đây chỉ là NHÃN TỰ KHAI — giống 3 giá trị cũ,
-- chưa có UI nào cho user tự set creator_tags (xem ghi chú ở
-- connect-directory.tsx) — không kéo theo bảng "blog_posts" hay tính
-- năng viết blog thật nào; mục "Blog" trong danh sách tác phẩm ở Kết nối
-- CỐ Ý không làm ở migration này (xem ghi chú đầu docs/supabase/schema.sql
-- về việc mục Blog đã bị gỡ khỏi UI vì chưa có dữ liệu thật, không hiển
-- thị số liệu bịa).
--
-- Không cần BEGIN/COMMIT — ALTER TYPE ... ADD VALUE không được phép chạy
-- trong cùng transaction với câu lệnh dùng giá trị đó (xem cùng lý do ở
-- migrations/20260827_add_streak_bonus_transaction_type.sql).
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

ALTER TYPE public.creator_tag ADD VALUE IF NOT EXISTS 'blogger';

-- Notes:
-- 1. Cập nhật docs/supabase/schema.sql phần 1 (dòng khai báo
--    `create type public.creator_tag as enum (...)`) — thêm 'blogger' vào
--    danh sách để tài liệu khớp DB thật.
-- 2. Cập nhật src/lib/supabase/types.ts — thêm "blogger" vào union
--    CreatorTag.
-- 3. Cập nhật src/components/connect/connect-directory.tsx —
--    CREATOR_TAG_LABELS thêm blogger: "Blogger", FILTER_TAGS thêm
--    "Blogger". KHÔNG thêm mục "Blog" vào SECTION_KEYS/works — repo chưa
--    có bảng dữ liệu blog thật (xem ghi chú đầu schema.sql).
