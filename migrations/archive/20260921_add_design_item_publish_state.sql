-- Sửa lỗi ảnh thiết kế bị công khai ngay khi upload, trước khi họa sĩ bấm
-- "Hoàn tất" ở form đăng Pinterest-style
-- (src/components/design/design-upload-form.tsx) — POST /api/design
-- (src/lib/design/design-items-service.ts) chèn thẳng vào design_items,
-- và view public_design_items (docs/supabase/schema.sql phần 9, nguồn DUY
-- NHẤT cho trang duyệt công khai /thiet-ke) trước đây chỉ lọc
-- deleted_at is null — không có khái niệm "còn đang soạn, chưa công khai".
--
-- published_at: null = draft riêng của họa sĩ (chỉ họ SELECT được qua RLS
-- "illustrators view their own design items"), có giá trị = đã công khai
-- qua public_design_items. POST /api/design vẫn insert như cũ (không set
-- cột này -> mặc định NULL -> draft); POST /api/design/publish (mới) là
-- nơi DUY NHẤT set published_at = now(), gọi khi họa sĩ bấm "Hoàn tất".
--
-- Idempotent: backfill (coi ảnh đã có TRƯỚC migration này là đã công khai,
-- giữ nguyên hành vi hiển thị hiện tại của chúng) chỉ chạy ở lần đầu cột
-- được tạo — bọc trong DO block kiểm tra information_schema, KHÔNG chạy
-- update vô điều kiện mỗi lần migration được chạy lại, vì lúc đó có thể đã
-- có draft thật (published_at NULL có chủ đích) sẽ bị publish nhầm.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'design_items' and column_name = 'published_at'
  ) then
    alter table public.design_items add column published_at timestamptz;
    update public.design_items set published_at = created_at;
  end if;
end $$;

drop view if exists public.public_design_items;
create view public.public_design_items as
  select id, illustrator_id, title, image_url, source, created_at, category, description, share_count,
         album_id, alt_text, published_at
  from public.design_items
  where deleted_at is null and published_at is not null;

-- Cho POST /api/design/publish (mới) set cột này qua client cookie-bound
-- của chính họa sĩ — RLS "illustrators update their own design items"
-- chặn theo hàng, GRANT cột dưới đây mở đúng 1 cột cần (cùng pattern grant
-- update (title, description, ...) ở migrations/20260919_add_design_albums_and_multi_upload.sql).
grant update (published_at) on public.design_items to authenticated;

-- Notes — cần cập nhật cùng lúc với migration này:
--   - docs/supabase/schema.sql: thêm published_at vào create view
--     public_design_items (phần 9, WHERE thêm "and published_at is not
--     null"), thêm alter table + grant update (published_at) sau block
--     "design_items: album_id/alt_text/deleted_at" hiện có.
--   - src/lib/supabase/types.ts: design_items.Row/.Insert thêm
--     published_at, public_design_items.Row thêm published_at.
--   - src/app/api/design/publish/route.ts (route mới): set published_at
--     = now() cho các id thuộc chính người gọi, chỉ khi còn là draft.
--   - src/components/design/design-upload-form.tsx: nút "Hoàn tất" phải
--     gọi route trên trước khi điều hướng đi, không chỉ router.push().
--   - src/app/api/design/mine/route.ts + src/app/thiet-ke/quan-ly/ (mới):
--     trang quản lý để họa sĩ xem lại và xoá ảnh ĐÃ đăng (khác form đăng
--     chỉ giữ danh sách trong state của phiên hiện tại, mất khi rời trang).
