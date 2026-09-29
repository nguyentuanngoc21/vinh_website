-- Migration: ngân hàng thụ hưởng trên hồ sơ (bank_code/bank_name/
-- bank_account_number) + lấp khoảng trống cccd_last4 (đã khai báo sẵn
-- trong src/lib/supabase/types.ts từ trước nhưng chưa có cột thật trong
-- DB — dùng để hiện số CCCD dạng che bớt ở "Thông tin cá nhân" mà không
-- phải SELECT bảng identity_verifications nhạy cảm hơn).
--
-- cccd_verified giờ có thể được set true tự động (OCR khớp ảnh, xem
-- src/app/api/profile/identity/route.ts), không chỉ lúc đăng ký — thêm
-- trigger enforce_cccd_verified_authority() bảo vệ y hệt cách
-- enforce_role_change_authority() bảo vệ cột role (schema.sql phần 5):
-- chỉ context tin cậy (service-role, auth.uid() null) hoặc admin/
-- super_admin mới đổi được cột này — policy "update own profile" hiện có
-- (auth.uid() = id) vốn không chặn cột nào ngoài role, nên nếu không có
-- trigger này thì user thường tự UPDATE profiles set cccd_verified=true
-- được, vô hiệu hoá toàn bộ mục đích xác minh.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cccd_last4 text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bank_code text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bank_account_number text;

CREATE OR REPLACE FUNCTION public.enforce_cccd_verified_authority()
RETURNS trigger AS $$
BEGIN
  IF NEW.cccd_verified IS DISTINCT FROM OLD.cccd_verified THEN
    IF auth.uid() IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    ) THEN
      RAISE EXCEPTION 'cccd_verified can only be set by a trusted server context or an admin';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_cccd_verified_authority ON public.profiles;
CREATE TRIGGER enforce_cccd_verified_authority
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_cccd_verified_authority();

COMMIT;

-- Notes:
-- 1. Idempotent — chạy lại an toàn.
-- 2. Cập nhật docs/supabase/schema.sql: 3 cột ngân hàng + cccd_last4 thêm
--    ngay sau khối token_balance/token_balance_pending (phần 6, đúng chỗ
--    các cột bổ sung sau này của profiles đã được thêm); trigger mới thêm
--    ngay sau enforce_role_change_authority (phần 5) — đã cập nhật cùng
--    lúc với migration này, xem schema.sql.
-- 3. src/lib/supabase/types.ts: profiles.Row/Insert đã thêm 3 cột ngân
--    hàng; cccd_last4 vốn đã có trong types từ trước (không đổi type,
--    chỉ giờ mới có cột thật đứng sau).
-- 4. identity_verifications.Insert cho phép truyền status tường minh
--    ('approved') cho luồng OCR tự động xác minh — KHÔNG đổi Update: never
--    của bảng đó, và KHÔNG ảnh hưởng luồng admin duyệt tay tương lai
--    (chưa xây, vẫn có thể set status='pending' rồi duyệt sau nếu cần).
