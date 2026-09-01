-- Migration: danh mục tag cố định cho service_listings (Mục 2.2 đặc tả:
-- "Người dùng không tự tạo tag mới — chỉ chọn từ danh sách có sẵn hoặc
-- gửi 'Đề xuất tag mới' vào hàng đợi duyệt của admin"). Lưu DB (không phải
-- hằng số TS) vì "do Nền tảng quản lý" ngụ ý admin thêm/sửa được không
-- cần deploy code — đúng tinh thần bảng cấu hình như task_templates
-- (schema.sql phần 7), không phải taxonomy cứng như BookGenre (constraint
-- text, xem migrations/20260825_update_book_genres.sql — khác nhau vì
-- genre hiếm đổi/cần review kỹ, còn tag dịch vụ dự kiến mở rộng thường
-- xuyên qua hàng đợi duyệt).
--
-- Seed ban đầu LẤY LẠI đúng taxonomy "Thiết kế"/"Audio" đã có sẵn ở mega
-- menu Trang chủ (Vịnh Trang chủ.dc.html) — không bịa danh sách mới cho
-- product_type/art_style/voice_type/instrument. Riêng finish_level (mức
-- độ hoàn thiện, ảnh hưởng bảng giá) và content_rating (nội dung nhận,
-- NSFW 18+ kích hoạt xác thực tuổi bắt buộc — Mục 2.2) là 2 nhóm hoàn
-- toàn mới, ngoại suy từ đúng 2 ví dụ trong file thiết kế (Vịnh Cá
-- nhân.dc.html: "Full color + đổ bóng", "SFW (an toàn)") — có thể chỉnh
-- qua bảng này bất kỳ lúc nào không cần migration mới.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

create table public.service_tag_options (
  id uuid primary key default gen_random_uuid(),
  service_type public.service_type not null,
  -- Khoá nhóm — dùng ở UI để gom option cùng 1 dropdown/checklist. Không
  -- phải enum vì nhóm mới có thể xuất hiện khi thêm service_type khác.
  group_key text not null,
  group_label text not null,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (service_type, group_key, label)
);

alter table public.service_tag_options enable row level security;

create policy "public can view tag options"
  on public.service_tag_options for select
  using (true);

-- Không có policy insert/update/delete — chỉ service_role (route admin
-- duyệt service_tag_suggestions, hoặc thao tác tay trong SQL Editor) ghi
-- được.

create index service_tag_options_lookup_idx on public.service_tag_options (service_type, group_key, sort_order);

-- Hàng đợi "Đề xuất tag mới" — user KHÔNG tự thêm thẳng vào
-- service_tag_options, chỉ gửi đề xuất vào đây, admin duyệt (phase admin
-- review UI làm sau, bảng tạo trước để route submit có chỗ ghi).
create table public.service_tag_suggestions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references auth.users (id) on delete cascade,
  service_type public.service_type not null,
  group_key text not null,
  label text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.service_tag_suggestions enable row level security;

create policy "users view their own tag suggestions"
  on public.service_tag_suggestions for select
  using (auth.uid() = submitted_by);

create policy "admins view all tag suggestions"
  on public.service_tag_suggestions for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- Không có policy insert cho "authenticated" — route submit dùng
-- service-role (getAuthedUserId() gate ở tầng Next.js), tránh user gửi
-- đề xuất thay mặt người khác dù RLS insert check auth.uid() cũng chặn
-- được, giữ nhất quán với các route khác trong hệ thống Order.

create index service_tag_suggestions_status_idx on public.service_tag_suggestions (status, created_at);

-- Cờ riêng-tư MỖI ĐƠN (khác is_private của service_listings — đó là
-- listing có công khai hiển thị ở Kết nối hay không; cái này là 1 đơn ĐÃ
-- HOÀN TẤT cụ thể có được dùng làm sample tự động (Mục 2.2 "sample_source
-- = auto") hay đưa vào bảng xếp hạng/gợi ý hay không). Mặc định false —
-- một đơn completed bình thường VẪN được dùng làm sample tự động trừ khi
-- 1 trong 2 bên chủ động đánh dấu riêng tư (UI đánh dấu này thuộc phase
-- Module 4/6, cột thêm ở đây trước để Phase 2 truy vấn "auto" query được
-- ngay, không phải rồi lại ALTER TABLE lần nữa).
alter table public.orders add column is_private boolean not null default false;

COMMIT;

-- Notes:
-- 1. Cập nhật docs/supabase/schema.sql phần 12 — thêm service_tag_options/
--    service_tag_suggestions + cột orders.is_private.
-- 2. Cập nhật src/lib/supabase/types.ts — bảng service_tag_options/
--    service_tag_suggestions, orders.Row thêm is_private.
-- 3. Seed dữ liệu ban đầu KHÔNG nằm trong migration này (dữ liệu, không
--    phải cấu trúc) — chạy scripts/seed_service_tag_options.sql riêng
--    ngay sau migration này, cùng đợt.
