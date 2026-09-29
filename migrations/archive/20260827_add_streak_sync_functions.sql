-- Migration: sync_reading_streak() + rescue_streak_with_tokens() — state
-- machine cho streak đọc-liên-tục, chốt qua trao đổi trực tiếp (không có
-- trong bản phác spec gốc):
--
--   - Kho thẻ nghỉ (streak_rest_days_banked): +1 thẻ mỗi 7 ngày streak
--     liên tục, TRẦN = min(31, 1 + floor(streak_days / 100)) — trần tăng
--     theo mốc streak (100 ngày -> trần 2, 200 ngày -> trần 3, ...,
--     3000 ngày -> trần tối đa 31). "31 ngày nghỉ" là TRẦN CỦA KHO, không
--     phải quota/tuần (1 tuần không chứa được 31 ngày nghỉ).
--   - Lỡ ĐÚNG 1 ngày: có thẻ trong kho -> tự trừ 1 thẻ, streak KHÔNG tăng
--     cho ngày đó (giống streak freeze — ngày bị lỡ "vô hình") nhưng cũng
--     KHÔNG reset. Hết thẻ -> vào trạng thái "at risk"
--     (streak_at_risk_since = now()), ĐÓNG BĂNG streak, chờ user trả
--     token cứu (rescue_streak_with_tokens) trong khung ân hạn 48h — hết
--     hạn không cứu thì reset thật.
--   - Lỡ ≥ 2 ngày liên tiếp mà kho không đủ bù hết: KHÔNG có cứu (rescue
--     chỉ áp dụng lỡ đúng 1 ngày) — reset ngay, không có ân hạn.
--
-- Cần cột ở migrations/20260827_add_quest_streak_to_profiles.sql (chạy
-- TRƯỚC file này) và transaction_type 'streak_rescue' ở
-- migrations/20260827_add_streak_rescue_transaction_type.sql.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

-- Gọi mỗi khi user có 1 hành động đọc thật (mở chương, hoàn thành 1
-- reading_session, v.v.) — xem StreakService.recordReadingActivity()
-- trong src/lib/quests/streak-service.ts. p_activity_date mặc định hôm
-- nay — chỉ truyền khác đi khi backfill/test.
create function public.sync_reading_streak(p_user_id uuid, p_activity_date date default current_date)
returns public.profiles as $$
declare
  v_profile public.profiles;
  v_gap integer;
  v_needed integer;
  v_cap integer;
begin
  select * into v_profile from public.profiles where id = p_user_id for update;
  if v_profile is null then
    raise exception 'User % not found', p_user_id;
  end if;

  -- Chưa từng đọc — khởi tạo streak = 1, không có gì để tính gap.
  if v_profile.streak_updated_at is null then
    update public.profiles set
      current_quest_streak = 1,
      streak_updated_at = p_activity_date,
      streak_rest_days_banked = 0,
      streak_at_risk_since = null
    where id = p_user_id
    returning * into v_profile;
    return v_profile;
  end if;

  -- Event đến trễ/trùng (retry, lệch giờ client) với ngày CŨ HƠN ngày đã
  -- ghi nhận gần nhất — không được lùi lại tính lại, chỉ no-op. Chỉ ngày
  -- BẰNG hoặc SAU streak_updated_at mới xử lý tiếp.
  if p_activity_date < v_profile.streak_updated_at then
    return v_profile;
  end if;

  v_gap := p_activity_date - v_profile.streak_updated_at;

  -- Đã tính cho đúng ngày này rồi — no-op, chỉ gỡ at_risk nếu lỡ còn sót
  -- (không nên xảy ra, nhưng dọn cho chắc).
  if v_gap = 0 then
    if v_profile.streak_at_risk_since is not null then
      update public.profiles set streak_at_risk_since = null where id = p_user_id returning * into v_profile;
    end if;
    return v_profile;
  end if;

  -- Liên tục đúng nhịp — tăng streak, tính lại trần kho theo streak MỚI,
  -- rồi tích luỹ thêm 1 thẻ nếu vừa chạm mốc 7 ngày.
  if v_gap = 1 then
    v_profile.current_quest_streak := v_profile.current_quest_streak + 1;
    v_cap := least(31, 1 + (v_profile.current_quest_streak / 100));
    if v_profile.current_quest_streak % 7 = 0 then
      v_profile.streak_rest_days_banked := least(v_cap, v_profile.streak_rest_days_banked + 1);
    end if;
    update public.profiles set
      current_quest_streak = v_profile.current_quest_streak,
      streak_updated_at = p_activity_date,
      streak_rest_days_banked = v_profile.streak_rest_days_banked,
      streak_at_risk_since = null
    where id = p_user_id
    returning * into v_profile;
    return v_profile;
  end if;

  -- v_gap >= 2: có ít nhất 1 ngày trống hoàn toàn ở giữa.
  v_needed := v_gap - 1;

  if v_profile.streak_rest_days_banked >= v_needed then
    -- Đủ thẻ bù hết — (các) ngày bị lỡ "vô hình" (không +1, không reset),
    -- chỉ +1 cho hôm nay (ngày đang đọc thật).
    update public.profiles set
      current_quest_streak = current_quest_streak + 1,
      streak_rest_days_banked = streak_rest_days_banked - v_needed,
      streak_updated_at = p_activity_date,
      streak_at_risk_since = null
    where id = p_user_id
    returning * into v_profile;
    return v_profile;
  end if;

  if v_needed = 1 then
    -- Lỡ đúng 1 ngày, hết thẻ — vào "at risk", ĐÓNG BĂNG streak (không
    -- +1 cho hôm nay) tới khi được cứu hoặc hết ân hạn. Không ghi đè
    -- streak_at_risk_since nếu đã đang at_risk từ trước — giữ đúng mốc
    -- gốc, không cho "làm mới" ân hạn bằng cách gọi lại hàm này nhiều lần
    -- (vd mở app lại) mà chưa hề đọc thêm.
    if v_profile.streak_at_risk_since is null then
      update public.profiles set streak_at_risk_since = now() where id = p_user_id returning * into v_profile;
    end if;
    return v_profile;
  end if;

  -- v_needed >= 2 và kho không đủ bù hết — lỡ nhiều ngày liên tiếp, NGOÀI
  -- phạm vi cứu (rescue chỉ áp dụng lỡ đúng 1 ngày) — reset thật ngay,
  -- không có ân hạn, bắt đầu streak mới tính từ hôm nay.
  update public.profiles set
    current_quest_streak = 1,
    streak_updated_at = p_activity_date,
    streak_rest_days_banked = 0,
    streak_at_risk_since = null
  where id = p_user_id
  returning * into v_profile;
  return v_profile;
end;
$$ language plpgsql security definer;

-- p_user_id là tham số trần (không tự suy ra từ auth.uid()), giống mọi
-- hàm reward khác trong hệ thống (apply_transaction, claim_daily_task...)
-- — REVOKE EXECUTE khỏi PUBLIC/anon/authenticated, CHỈ service_role gọi
-- được. Không làm việc này thì bất kỳ user đăng nhập nào cũng gọi thẳng
-- RPC bằng anon key + JWT của họ, truyền p_user_id là NGƯỜI KHÁC, để tự
-- ý tăng/reset streak của người khác. (Xem "LƯU Ý" cuối file — rủi ro
-- này rất có thể cũng áp dụng cho các hàm reward cũ hơn, ngoài phạm vi
-- migration này.)
revoke execute on function public.sync_reading_streak(uuid, date) from public, anon, authenticated;
grant execute on function public.sync_reading_streak(uuid, date) to service_role;

-- Trả token cứu streak sau khi lỡ 1 ngày, trong khung ân hạn 48h kể từ
-- streak_at_risk_since. p_token_cost do caller (TS, config.ts) truyền
-- vào — KHÔNG hardcode số ở đây, giống create_withdrawal_request() nhận
-- p_amount_vnd đã tính sẵn từ tokensToVnd() thay vì tự tính lại trong SQL.
create function public.rescue_streak_with_tokens(p_user_id uuid, p_token_cost integer)
returns public.profiles as $$
declare
  v_profile public.profiles;
begin
  if p_token_cost <= 0 then
    raise exception 'p_token_cost must be positive, got %', p_token_cost;
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if v_profile is null then
    raise exception 'User % not found', p_user_id;
  end if;

  if v_profile.streak_at_risk_since is null then
    raise exception 'Streak is not at risk — nothing to rescue';
  end if;

  if now() > v_profile.streak_at_risk_since + interval '48 hours' then
    -- Ân hạn đã hết — reset thật ngay tại đây (không chờ lần
    -- sync_reading_streak() kế tiếp), tránh treo trạng thái "at risk" quá
    -- hạn nếu user không đọc lại ngay sau đó.
    update public.profiles set
      current_quest_streak = 0,
      streak_rest_days_banked = 0,
      streak_at_risk_since = null,
      streak_updated_at = null
    where id = p_user_id;
    raise exception 'Grace period expired — streak already reset';
  end if;

  -- Trừ token TRƯỚC (apply_transaction tự raise nếu không đủ số dư — khi
  -- đó statement này raise, toàn bộ hàm rollback, streak_at_risk_since
  -- vẫn còn nguyên để user thử lại). reference_id để null — không có 1
  -- "quest" cụ thể nào để trỏ tới, khác quest_reward/streak_bonus.
  perform public.apply_transaction(p_user_id, 'streak_rescue', -p_token_cost, 'streak_rescue', null);

  -- Bù đúng 1 ngày bị lỡ — dịch streak_updated_at lùi 1 ngày so với hôm
  -- nay, để lần sync_reading_streak() kế tiếp (khi user đọc thật) thấy
  -- gap = 1 (nhịp bình thường), không phải gap = 0 (tránh cộng nhầm cho
  -- cả ngày đã lỡ). streak KHÔNG +1 ở đây — việc cứu chỉ xoá "lỗi", không
  -- tự tính điểm cho ngày lỡ đó.
  update public.profiles set
    streak_updated_at = current_date - 1,
    streak_at_risk_since = null
  where id = p_user_id
  returning * into v_profile;

  return v_profile;
end;
$$ language plpgsql security definer;

revoke execute on function public.rescue_streak_with_tokens(uuid, integer) from public, anon, authenticated;
grant execute on function public.rescue_streak_with_tokens(uuid, integer) to service_role;

COMMIT;

-- Notes:
-- 1. streak_rest_days_banked KHÔNG có ý nghĩa nếu user chưa từng đạt 7
--    ngày streak liên tục — bình thường (default 0), không phải lỗi.
-- 2. "Không giới hạn số lần rescue" là quyết định chủ động (đã hỏi lại) —
--    hệ quả: 1 user đủ token có thể giữ streak dài vô hạn dù đọc rất thất
--    thường (chỉ cần không lỡ ≥ 2 ngày liên tiếp cùng lúc) — số streak
--    hiển thị KHÔNG còn phản ánh hành vi đọc thật 100% trong trường hợp
--    này. Nếu dùng streak làm input cho chân dung độc giả, cân nhắc lọc
--    riêng theo số lần rescue (transactions.type = 'streak_rescue') thay
--    vì tin thẳng current_quest_streak.
-- 3. LƯU Ý (ngoài phạm vi migration này, chỉ ghi lại để theo dõi): các hàm
--    reward CŨ hơn nhận p_user_id trần (apply_transaction,
--    claim_daily_task, create_withdrawal_request, grant_platform_bonus...)
--    dường như KHÔNG có REVOKE EXECUTE FROM PUBLIC tường minh nào trong
--    schema.sql — mặc định Postgres cấp EXECUTE cho PUBLIC khi tạo hàm
--    mới, nghĩa là (trừ khi Supabase tự revoke ngầm ở cấp project, chưa
--    xác minh được) user đăng nhập có thể gọi thẳng các RPC này bằng anon
--    key + JWT của chính họ, tự chọn p_user_id là NGƯỜI KHÁC. Nếu đúng
--    vậy, đây là lỗ hổng nghiêm trọng hơn cả lỗ hổng GRANT trên profiles
--    đã vá (migrations/20260827_restrict_profiles_column_grants.sql) —
--    cần xác minh trực tiếp trên project Supabase thật (`\df+` hoặc
--    information_schema.routine_privileges) và vá riêng, không phải việc
--    của Quest System.
-- 4. Cập nhật src/lib/supabase/types.ts (Functions.sync_reading_streak,
--    Functions.rescue_streak_with_tokens nếu file có khai báo Functions —
--    kiểm tra convention hiện tại trước khi thêm).
