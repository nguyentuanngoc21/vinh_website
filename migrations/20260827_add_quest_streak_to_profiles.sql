-- Migration: profiles.current_quest_streak + streak_updated_at — lưu
-- sẵn (không tính lại mỗi lần đọc), vì streak được đọc thường xuyên
-- (hiện mỗi lần mở app) nhưng chỉ ghi khi có sự kiện completed/reset.
--
-- Kèm 2 cột phục vụ luật nghỉ/cứu streak (chốt qua trao đổi trực tiếp,
-- không có trong bản phác spec gốc):
--   - streak_rest_days_banked: kho "thẻ nghỉ" tích lũy — +1 mỗi 7 ngày
--     streak liên tục, có TRẦN tăng theo streak (không phải quota/tuần —
--     xem công thức trong sync_reading_streak() ở
--     migrations/20260827_add_streak_sync_functions.sql). Lỡ 1 ngày mà
--     kho > 0 thì tự trừ 1 thẻ, KHÔNG mất streak, không tốn token.
--   - streak_at_risk_since: mốc thời gian streak "lỡ 1 ngày, kho thẻ nghỉ
--     đã hết" — user có 1 khung ân hạn để trả token cứu (xem
--     rescue_streak_with_tokens() cùng file trên) trước khi bị reset thật.
--     NULL = streak đang khoẻ mạnh, không có gì cần cứu.
--
-- Bảo vệ giống role/cccd_verified (schema.sql phần 5) — KHÔNG dùng trigger
-- riêng cho 2 cột này sẽ để lộ lỗ hổng giống nhau: policy "users can
-- update their own profile" (phần 1) cho sửa MỌI cột của hàng mình vì RLS
-- không diễn tả được theo-cột, nên nếu không chặn, user tự PATCH
-- current_quest_streak lên bất kỳ số nào qua REST API trực tiếp (bỏ qua
-- app) để giả streak cao hơn thật. Role/cccd_verified đã có trigger riêng
-- cho đúng lỗ hổng này — streak cần y hệt.
--
-- LƯU Ý (ngoài phạm vi migration này, chỉ ghi lại để theo dõi): profiles
-- hiện KHÔNG có bất kỳ GRANT/trigger nào chặn user tự PATCH token_balance,
-- token_balance_pending, screenshot_penalty_* qua REST API bằng anon key +
-- JWT của chính họ (khác books, đã có "revoke update ... grant update
-- (cột được phép)" ở phần 9). App hiện tại luôn dùng service-role client
-- cho mọi write vào profiles (xem src/app/api/profile/me/route.ts) nên lỗ
-- hổng này chưa bị khai thác qua UI, nhưng vẫn tồn tại nếu ai gọi thẳng
-- Supabase REST API bằng anon key. Không sửa trong migration này (không
-- thuộc Quest System) — cần 1 migration riêng nếu muốn khoá.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

alter table public.profiles add column if not exists current_quest_streak integer not null default 0;
alter table public.profiles add column if not exists streak_updated_at date;
alter table public.profiles add column if not exists streak_rest_days_banked integer not null default 0;
alter table public.profiles add column if not exists streak_at_risk_since timestamptz;

alter table public.profiles
  add constraint profiles_current_quest_streak_check check (current_quest_streak >= 0);

alter table public.profiles
  add constraint profiles_streak_rest_days_banked_check check (streak_rest_days_banked >= 0);

create function public.enforce_quest_streak_authority()
returns trigger as $$
begin
  if new.current_quest_streak is distinct from old.current_quest_streak
     or new.streak_updated_at is distinct from old.streak_updated_at
     or new.streak_rest_days_banked is distinct from old.streak_rest_days_banked
     or new.streak_at_risk_since is distinct from old.streak_at_risk_since then
    if auth.uid() is not null and not exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')
    ) then
      raise exception 'streak columns can only be set by a trusted server context or an admin';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger enforce_quest_streak_authority
  before update on public.profiles
  for each row execute function public.enforce_quest_streak_authority();

COMMIT;

-- Notes:
-- 1. auth.uid() is null (service-role request, migration, SQL Editor) đi
--    qua được — reward engine cập nhật streak trong cùng request đã dùng
--    service role để gọi apply_transaction(), nên đây là ngữ cảnh tin cậy
--    sẵn có, không cần security definer riêng để "giả" auth.uid() null.
-- 2. Tính lại streak từ user_daily_tasks/user_hidden_quest_progress chỉ
--    dùng cho mục đích audit định kỳ (đối soát xem cột lưu có lệch không),
--    KHÔNG dùng cho đường đọc chính (UI đọc thẳng cột này).
-- 3. Cập nhật src/lib/supabase/types.ts (Tables.profiles.Row — thêm 4
--    cột, Update KHÔNG thêm — vẫn phải qua reward engine, không update
--    trực tiếp từ client code).
-- 4. Logic tính streak/nghỉ/cứu (sync_reading_streak, rescue_streak_with_tokens)
--    nằm ở migrations/20260827_add_streak_sync_functions.sql — file này
--    chỉ định nghĩa cột + trigger bảo vệ.
