-- Migration: bổ sung metadata còn thiếu cho service_tag_options — đối
-- chiếu lại thiết kế gốc (Vịnh Cá nhân.dc.html, TAG_GROUPS/VOICE_GROUPS)
-- sau khi người dùng báo giao diện tag sai. Thiết kế có cấu trúc 4 TẦNG
-- (không phải danh sách phẳng): mỗi tầng có nhãn "Tầng N", 1 câu rule/hint
-- riêng, chọn-1 hay chọn-nhiều tùy tầng, và cảnh báo riêng cho 1 số lựa
-- chọn nhạy cảm (NSFW 18+, Gore, Fanart vi phạm bản quyền) — migrations/
-- 20260901_add_service_tag_catalog.sql CHƯA có các cột này.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.
--
-- SỬA (không idempotent ở bản đầu — thiếu IF NOT EXISTS, vi phạm quy ước
-- chung của repo): người dùng chạy lần đầu đã thành công (cột đã tồn
-- tại), lần chạy lại báo lỗi 42701 "column already exists" vì thiếu
-- IF NOT EXISTS. Đã thêm vào — an toàn chạy lại nhiều lần từ nay.

BEGIN;

alter table public.service_tag_options
  add column if not exists tier text,
  add column if not exists rule text,
  -- true = chọn nhiều (multi), false = chọn đúng 1 (vd "Mức độ hoàn
  -- thiện" — mỗi mức là 1 gói giá riêng, không phải thẻ tự do).
  add column if not exists multi boolean not null default true,
  -- Optional = nhóm được phép bỏ trống (Mục voice: v1/v2 chỉ cần ít nhất
  -- 1 trong 2 nhóm có chọn, không bắt buộc CẢ HAI).
  add column if not exists optional boolean not null default false,
  -- Cảnh báo hiển thị NGAY khi seller chọn đúng option này (NSFW 18+,
  -- Gore, Fanart vi phạm bản quyền) — null = không cảnh báo gì.
  add column if not exists warn_text text;

COMMIT;

-- Notes:
-- 1. Cập nhật docs/supabase/schema.sql phần 12d (service_tag_options).
-- 2. Cập nhật src/lib/supabase/types.ts.
-- 3. Chạy lại scripts/seed_service_tag_options.sql (đã sửa: xoá seed cũ,
--    seed lại đúng tier/rule/multi/optional/warn_text + đúng 4 lựa chọn
--    "Mức độ hoàn thiện" và đủ 5 lựa chọn "Nội dung nhận" theo thiết kế
--    gốc — 2 nhóm này trước đó bị thiếu/sai so với TAG_GROUPS thật).
