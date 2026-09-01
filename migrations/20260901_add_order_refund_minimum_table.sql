-- Migration: Bảng % hoàn tiền TỐI THIỂU của Nền tảng — fallback khi
-- seller CHƯA tự khai refund_policy (Mục 5.1 đặc tả). Số liệu do người
-- yêu cầu cung cấp 2026-09-01:
--
--   Mốc tiến độ                    | Khách hàng hủy | Seller hủy/lỗi seller
--   Chưa có bản nháp                | 100%           | 100%
--   Có bản nháp, chưa duyệt         | 70%            | 90%
--   Đã duyệt bản nháp               | 40%            | 70%
--   Đã bàn giao, chưa xác nhận      | 10%            | 100%
--
-- (dòng cuối gốc là "Đã hoàn thiện, chưa bàn giao" — khớp vào đúng mốc
-- "delivered" của hệ thống theo xác nhận của người yêu cầu, vì đây là mốc
-- xa nhất trong máy trạng thái hiện có; % khách hủy chọn 10% trong
-- khoảng gốc "10-20% tùy TOS" theo xác nhận riêng).
--
-- SỬA LẠI 1 giả định SAI đã đưa ra ở migrations/20260901_add_order_cancel_system.sql
-- (chưa xác nhận với người yêu cầu lúc đó): "seller hủy -> luôn hoàn
-- 100%". Bảng thật cho thấy vế seller-fault CŨNG giảm dần theo tiến độ
-- (100/90/70) rồi bật lại 100% ở mốc cuối — KHÔNG phải hằng số.
--
-- Giữ nguyên hành vi khi seller ĐÃ tự khai refund_policy (Phase 2 —
-- migrations/20260901_add_service_tag_catalog.sql): vế seller-fault vẫn
-- hoàn 100% cố định — luôn ≥ sàn tối thiểu ở MỌI mốc (100≥100, 100≥90,
-- 100≥70, 100≥100) nên vẫn hợp lệ, không cần bắt seller khai thêm 1 bảng
-- riêng cho trường hợp lỗi do chính họ. Bảng sàn ở migration này CHỈ áp
-- dụng khi seller chưa khai gì cả (refund_policy is null).
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

create or replace function public.calculate_refund(p_order_id uuid, p_cancelled_by text)
returns jsonb as $$
declare
  v_order public.orders;
  v_policy jsonb;
  v_stage text;
  v_pct integer;
  v_refund integer;
  v_used_platform_minimum boolean := false;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order is null then raise exception 'Order % not found', p_order_id; end if;
  if p_cancelled_by not in ('buyer', 'seller') then raise exception 'cancelled_by must be buyer or seller'; end if;

  if exists (select 1 from public.order_events where order_id = p_order_id and event_type = 'delivered') then
    v_stage := 'delivered';
  elsif exists (select 1 from public.order_events where order_id = p_order_id and event_type = 'draft_approved') then
    v_stage := 'draft_approved';
  elsif exists (select 1 from public.order_events where order_id = p_order_id and event_type = 'draft_submitted') then
    v_stage := 'draft_pending';
  else
    v_stage := 'before_draft';
  end if;

  select refund_policy into v_policy from public.service_listings where id = v_order.listing_id;

  if p_cancelled_by = 'buyer' then
    if v_policy is not null and (v_policy ? v_stage) then
      v_pct := (v_policy ->> v_stage)::integer;
    else
      v_used_platform_minimum := true;
      v_pct := case v_stage
        when 'before_draft' then 100
        when 'draft_pending' then 70
        when 'draft_approved' then 40
        when 'delivered' then 10
      end;
    end if;
  else
    -- seller-fault: seller đã tự khai policy nào đó -> vẫn hoàn 100% cố
    -- định (quy ước cũ, luôn >= sàn nên hợp lệ). Chưa khai gì -> áp đúng
    -- bảng sàn seller-fault ở trên (KHÔNG còn hằng số 100% nữa).
    if v_policy is not null then
      v_pct := 100;
    else
      v_used_platform_minimum := true;
      v_pct := case v_stage
        when 'before_draft' then 100
        when 'draft_pending' then 90
        when 'draft_approved' then 70
        when 'delivered' then 100
      end;
    end if;
  end if;

  v_refund := round(v_order.paid * v_pct / 100.0)::integer;

  return jsonb_build_object(
    'stage', v_stage,
    'pct', v_pct,
    'refund_amount', v_refund,
    'seller_amount', v_order.paid - v_refund,
    'cancelled_by', p_cancelled_by,
    -- true = số này lấy từ bảng sàn Nền tảng (seller chưa tự khai đủ cho
    -- mốc/vai trò này), không phải từ TOS riêng của seller — hiển thị rõ
    -- cho 2 bên biết nguồn gốc con số (xem order-card.tsx).
    'used_platform_minimum', v_used_platform_minimum
  );
end;
$$ language plpgsql stable;

revoke execute on function public.calculate_refund from public, anon, authenticated;
grant execute on function public.calculate_refund to service_role;

COMMIT;

-- Notes:
-- 1. Cập nhật docs/supabase/schema.sql phần 12g — sửa ghi chú "hàm thuần
--    túy calculate_refund" để phản ánh đúng: seller-fault giờ tra bảng
--    theo mốc khi chưa có policy riêng, không còn hằng số 100%.
-- 2. Cập nhật src/lib/supabase/types.ts — Returns của calculate_refund
--    thêm field used_platform_minimum.
-- 3. Cập nhật src/components/profile/order-card.tsx — hiện chú thích khi
--    used_platform_minimum=true ("Áp dụng mức sàn của Nền tảng — dịch vụ
--    này chưa tự khai chính sách hủy/hoàn tiền").
