-- Migration: bảng theo dõi trạng thái bảo hộ bản quyền/"không cho AI huấn
-- luyện" thật cho nội dung công khai (ảnh minh hoạ ở Thiết kế, audio ở
-- Audio Hub) — thay cho số liệu bịa ở admin/copyright-panel.tsx ("Độ phủ
-- watermark: 98,2%", "NFT đã đúc", "Báo cáo vi phạm" — không có tính năng
-- NFT/báo cáo vi phạm nào tồn tại, các số đó chỉ là UI tĩnh dựng từ ngày
-- đầu scaffold dự án, chưa từng đấu nối dữ liệu thật).
--
-- Ghi 1 dòng ở đây khi (và chỉ khi) nội dung ĐÃ thực sự được xử lý bảo hộ
-- lúc upload:
--   - design: ảnh đã ép PNG + nhúng XMP "không cho AI huấn luyện" thật
--     (xem src/lib/copyright/public-asset-watermark.ts, gọi từ
--     src/app/api/design/route.ts).
--   - audio: KHÔNG sửa file (không có thư viện ghi tag ID3/Vorbis/APE nào
--     trong project, mỗi định dạng mp3/m4a/wav/ogg lại một kiểu tag khác
--     nhau — quyết định không thêm dependency mới cho việc này). Chỉ ghi
--     nhận "đã tuyên bố không cho AI huấn luyện" vào DB + hiển thị rõ
--     trên UI audio, đúng tinh thần "khai báo/răn đe, không phải DRM
--     thật" đã ghi chú sẵn ở src/lib/orders/xmp.ts.
--   - Truyện chữ (chapter): KHÔNG có "file" để nhúng metadata — cơ chế
--     thật duy nhất là robots.txt chặn AI-crawler đã biết + thẻ
--     <meta name="robots" content="noai, noimageai">, xem src/app/robots.ts
--     — áp dụng toàn site nên KHÔNG cần 1 dòng riêng cho từng chương ở
--     bảng này (coverage của "chapter" luôn là toàn site, không phải %).
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

create table public.content_protection_status (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('audio', 'design')),
  content_id uuid not null,
  protected boolean not null default true,
  method text not null,
  applied_at timestamptz not null default now(),
  unique (content_type, content_id)
);

alter table public.content_protection_status enable row level security;

-- Chỉ admin đọc được — bảng này phục vụ dashboard nội bộ, không có UI
-- người dùng thường nào cần query trực tiếp (route ghi dùng service-role,
-- tự bỏ qua RLS, không cần policy insert riêng).
create policy "admins view content protection status"
  on public.content_protection_status for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  ));

create index content_protection_status_type_idx
  on public.content_protection_status (content_type);

COMMIT;

-- Notes:
-- 1. Idempotent theo kiểu "chạy 1 lần" (create table sẽ lỗi nếu chạy lại
--    khi bảng đã tồn tại) — giống các migration add-table khác trong repo
--    này (vd migrations/20260901_add_manuscript_share.sql), không phải
--    dạng GRANT idempotent như 20260906_add_book_synopsis_grant.sql.
-- 2. Không backfill dữ liệu cũ — audio/ảnh đã upload TRƯỚC migration này
--    sẽ hiện đúng là "chưa bảo hộ" (không có dòng tương ứng), phản ánh
--    đúng thực tế thay vì giả vờ đã xử lý.
