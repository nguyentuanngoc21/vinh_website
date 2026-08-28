-- Migration: chặn EXECUTE trực tiếp (anon/authenticated) trên các RPC
-- security-definer nhận p_user_id/p_admin_id/... TRẦN — phát hiện lúc
-- soát schema cho Quest System (đã vá cho mọi hàm MỚI viết trong Quest
-- System — complete_hidden_quest, claim_streak_milestone,
-- sync_reading_streak, rescue_streak_with_tokens — nhưng các hàm CŨ hơn
-- thì chưa từng có REVOKE nào).
--
-- KHÔNG tự verify được trên project Supabase thật từ phiên làm việc này —
-- không có kết nối Postgres trực tiếp (không connection string, không
-- Supabase CLI link), chỉ có URL + anon/service-role key (key REST API,
-- không cho chạy SQL introspection). Trước khi/sau khi chạy migration
-- này, verify bằng:
--
--   select routine_name, grantee, privilege_type
--   from information_schema.routine_privileges
--   where routine_schema = 'public'
--     and grantee in ('public', 'anon', 'authenticated')
--     and privilege_type = 'EXECUTE'
--     and routine_name in (
--       'apply_transaction', 'settle_pending_transaction',
--       'settle_due_pending_transactions', 'create_withdrawal_request',
--       'mark_withdrawal_result', 'create_purchase', 'grant_platform_bonus',
--       'increment_task_progress', 'claim_daily_task'
--     );
--
-- TRƯỚC migration: nếu ra kết quả (có dòng), lỗ hổng CÓ THẬT — Postgres
-- mặc định cấp EXECUTE cho PUBLIC khi tạo hàm mới (`GRANT EXECUTE ... TO
-- PUBLIC` ngầm), và Supabase không tự revoke việc này cho hàm do bạn tạo.
-- Nghĩa là bất kỳ user đăng nhập nào cũng gọi thẳng các RPC dưới đây bằng
-- anon key + JWT của chính họ, tự chọn p_user_id/p_admin_id là NGƯỜI
-- KHÁC, bỏ qua hoàn toàn route Next.js và session check của nó. SAU
-- migration: câu query trên phải trả về RỖNG.
--
-- Vì sao từng hàm nguy hiểm (không hàm nào tự kiểm auth.uid() khớp với
-- tham số p_user_id/p_admin_id truyền vào):
--   - apply_transaction: cộng/trừ token_balance của BẤT KỲ user nào, tự
--     chọn type/amount — nghiêm trọng nhất, đây là hàm ghi số dư duy nhất
--     trong toàn hệ thống.
--   - create_withdrawal_request: tạo yêu cầu rút tiền trừ số dư NGƯỜI
--     KHÁC, chuyển vào tài khoản ngân hàng do MÌNH chỉ định — cướp tiền
--     trực tiếp.
--   - mark_withdrawal_result: user tự gọi p_success=false trên request
--     CỦA CHÍNH MÌNH (id tự xem được qua policy select) để tự tạo hoàn
--     tiền (refund) giả trong khi giao dịch rút tiền thật vẫn có thể
--     được xử lý song song ở gateway thật — double-dip.
--   - create_purchase: tự đặt author_id = mình, buyer_id = NGƯỜI KHÁC —
--     trừ tiền người khác, cộng doanh thu cho mình, không cần mua gì.
--   - grant_platform_bonus: dù có check role bên trong hàm, check đó lại
--     dựa vào p_admin_id (tham số) — KHÔNG dựa vào auth.uid() của người
--     gọi thật. Truyền p_admin_id = id của 1 admin thật (có thể tra được
--     qua author_public_profiles/bylines) là qua được check, tự thưởng
--     bất kỳ số token cho bất kỳ ai.
--   - settle_pending_transaction/settle_due_pending_transactions: không
--     trực tiếp mất tiền (chỉ settle sớm 1 entry ĐÃ due), nhưng là hàm nội
--     bộ của cron, không nên gọi được từ client.
--   - increment_task_progress/claim_daily_task: cho phép ghi
--     progress/claim thưởng nhiệm vụ hàng ngày của NGƯỜI KHÁC — mức độ
--     hại thấp hơn (nạn nhân được lợi, không bị hại), nhưng vẫn không nên
--     gọi trực tiếp từ client.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.
--
-- KHÔNG ghi tên hàm trần (không tham số) VÀ KHÔNG ghi chữ ký cụ thể ở
-- đây, khác 2 bản thử trước — cả 2 đều gãy trên thực tế:
--   - Ghi chữ ký cụ thể (bản đầu): gãy nếu chữ ký thật khác đúng những gì
--     docs/supabase/schema.sql ghi (đúng là trường hợp của bạn).
--   - Ghi tên trần (bản 2): CHỈ work nếu tên đó không bị overload — gãy
--     ngay khi 1 hàm có ≥2 chữ ký cùng tồn tại (đúng là trường hợp
--     apply_transaction trên staging của bạn: CREATE OR REPLACE FUNCTION
--     trong 20260807_wallet_ledger_extension.sql không ghi đè được bản
--     gốc vì đổi chữ ký tham số — Postgres coi là 1 overload MỚI, giữ lại
--     cả bản cũ. "function name is not unique" nghĩa đúng là vậy.
-- Cách chắc chắn: dò TOÀN BỘ overload thật đang tồn tại của mỗi tên hàm
-- qua pg_proc, rồi revoke/grant từng overload tìm được — không cần biết
-- trước có bao nhiêu bản hay chữ ký nào, đúng với MỌI trạng thái DB.
BEGIN;

do $$
declare
  v_sig regprocedure;
  v_target_names text[] := array[
    'apply_transaction', 'settle_pending_transaction', 'settle_due_pending_transactions',
    'create_withdrawal_request', 'mark_withdrawal_result', 'create_purchase',
    'grant_platform_bonus', 'increment_task_progress', 'claim_daily_task'
  ]::text[];
begin
  for v_sig in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(v_target_names)
  loop
    -- Cấp lại CHỈ cho service_role trên MỌI overload tìm được — mọi route
    -- hiện tại đã dùng createServiceRoleClient() để gọi các RPC này (đối
    -- chiếu code hiện tại: register/route.ts, penalty/route.ts,
    -- wallet-service.ts, withdrawal-service.ts, LedgerService,
    -- quests/reward-engine.ts...), không route nào dùng client anon-key
    -- để gọi trực tiếp — nên không cần grant lại cho authenticated.
    execute format('revoke execute on function %s from public, anon, authenticated', v_sig);
    execute format('grant execute on function %s to service_role', v_sig);
    raise notice 'Locked down: %', v_sig;
  end loop;
end;
$$;

COMMIT;

-- Notes:
-- 1. KHÔNG đụng tới increment_book_view_count (đã grant tường minh cho
--    anon/authenticated từ đầu — cố ý, không có p_user_id, chỉ +1 view
--    đúng 1 sách published/lần gọi), recommend_books (security INVOKER,
--    không phải definer — RLS của reading_history tự lọc theo auth.uid()
--    thật dù p_user_id truyền vào là ai, xem comment tại chỗ định nghĩa
--    hàm), link_audio_to_chapter/regenerate_audio_share_token/
--    link_cover_to_book/regenerate_design_share_token (tự kiểm auth.uid()
--    bên trong hàm, KHÔNG nhận p_user_id — an toàn để gọi trực tiếp, đây
--    là thiết kế cố ý cho client tự gọi). Và 4 hàm Quest System mới đã vá
--    sẵn lúc viết (complete_hidden_quest, claim_streak_milestone,
--    sync_reading_streak, rescue_streak_with_tokens).
-- 2. grant_platform_bonus() vẫn còn 1 lỗ hổng THIẾT KẾ khác, ngoài phạm vi
--    REVOKE này: hàm tự kiểm role dựa vào p_admin_id (tham số), không dựa
--    vào auth.uid() của người gọi. Sau migration này chỉ service_role gọi
--    được — nhưng NẾU sau này có endpoint dùng client RLS-checked (không
--    phải service-role) gọi hàm này, p_admin_id vẫn phải được server tự
--    resolve từ session (getAuthedAdminId()), không bao giờ nhận trực
--    tiếp từ body request. Không sửa trong migration này (đổi behaviour
--    của route hiện tại, không phải Quest System) — nêu lại nếu cần vá.
-- 3. Idempotent — REVOKE/GRANT không lỗi nếu privilege chưa từng được
--    cấp/đã được cấp. An toàn chạy lại nhiều lần.
-- 4. Cập nhật docs/supabase/schema.sql — thêm các REVOKE/GRANT này ngay
--    sau mỗi định nghĩa hàm tương ứng (phần 6, 6b, 6c, 6d, 6e, 7).
-- 5. Nếu 1 hàm trong danh sách CHƯA từng được tạo trên project của bạn
--    (migration tạo nó chưa chạy), DO block ở trên đơn giản KHÔNG tìm
--    thấy overload nào để lock — không lỗi, cũng không cảnh báo gì. Xem
--    dòng `raise notice 'Locked down: %'` khi chạy (Supabase SQL Editor
--    hiện notice ở tab riêng, không phải kết quả chính) — thiếu tên hàm
--    nào trong danh sách notice nghĩa là hàm đó chưa tồn tại lúc chạy.
--    QUAN TRỌNG: nếu migration tạo hàm đó chạy SAU migration này,
--    Postgres cấp lại EXECUTE cho PUBLIC (mặc định) cho hàm mới tạo —
--    phải CHẠY LẠI migration này sau khi thêm/tạo lại bất kỳ hàm nào
--    trong danh sách trên.
-- 6. Phát hiện phụ, KHÔNG sửa trong migration này (rủi ro cao hơn, cần
--    xác nhận riêng trước khi động vào): nếu apply_transaction báo "not
--    unique" khi chạy migration này, nghĩa là đang có ≥2 overload cùng
--    tồn tại — CREATE OR REPLACE FUNCTION trong
--    20260807_wallet_ledger_extension.sql không ghi đè được bản gốc vì
--    đổi chữ ký, nên bản CŨ vẫn còn sống song song bản MỚI. Đây không chỉ
--    là vấn đề permission — PostgREST/Supabase RPC resolve overload theo
--    số lượng/tên tham số JSON gửi lên, nghĩa là 1 lời gọi
--    supabase.rpc('apply_transaction', {...}) từ code hiện tại CÓ THỂ
--    đang âm thầm chạy nhầm bản CŨ (không có p_status/p_available_at...)
--    thay vì bản mới, tuỳ số tham số truyền. Kiểm bằng:
--      select p.oid::regprocedure, pg_get_function_identity_arguments(p.oid)
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'public' and p.proname = 'apply_transaction';
--    Nếu ra 2 dòng — cần xác định bản nào code thật đang gọi trúng, rồi
--    DROP FUNCTION bản còn lại (ghi rõ chữ ký, không dùng tên trần — DROP
--    cũng cần chữ ký như REVOKE) trong 1 migration riêng, sau khi xác
--    nhận kỹ. Không tự làm ở đây vì DROP sai bản có thể phá hành vi đang
--    chạy thật trên production/staging.
