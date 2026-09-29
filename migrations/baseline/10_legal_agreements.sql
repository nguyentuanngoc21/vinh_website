-- =======================================================================
-- Baseline 10 — Văn bản pháp lý  (10_legal_agreements.sql)
-- =======================================================================
-- Phạm vi: agreement_acceptances — lần xác nhận gần nhất mỗi văn bản (tab
-- "Cam kết & Thỏa thuận").
--
-- Đối tượng tạo trong file này:
--   Bảng:
--     agreement_acceptances
--
-- Gộp từ migration (migrations/archive/):
--   20260828_add_agreement_acceptances.sql
--
-- Phụ thuộc (phải chạy trước): không có
-- Chỉ dùng cho project MỚI, TRỐNG — xem migrations/baseline/README.md.
-- =======================================================================

-- migrations/archive/20260828_add_agreement_acceptances.sql — 1 dòng/(user, văn
-- bản) giữ lần xác nhận GẦN NHẤT cho tab "Cam kết & Thỏa thuận" (/ca-nhan).
-- agreement_id tham chiếu AgreementId trong src/lib/legal/registry.ts,
-- không có bảng "agreements" riêng — danh sách văn bản là hằng số trong
-- code. accepted_version = "UTD" (yyyy-MM-dd) của văn bản lúc xác nhận; khi
-- văn bản được cập nhật (updatedAt đổi), version cũ không còn khớp nữa và
-- ứng dụng tự coi là "Chưa xác nhận" — không cần cột trạng thái riêng.
create table public.agreement_acceptances (
  user_id uuid not null references auth.users (id) on delete cascade,
  agreement_id text not null check (char_length(agreement_id) between 1 and 64),
  accepted_at timestamptz not null default now(),
  accepted_version text not null,
  primary key (user_id, agreement_id)
);

alter table public.agreement_acceptances enable row level security;

create policy "users manage their own agreement acceptances"
  on public.agreement_acceptances for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

