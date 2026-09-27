-- Migration: phát hiện tín hiệu gian lận + admin xét (Contest Engine Phase 2, Slice 2.4).
-- Phụ thuộc migrations/20260926_add_contest_scores.sql (bảng contest_fraud_signals).
--
-- P10: hệ thống CHỈ gắn tín hiệu; chỉ tín hiệu admin xác nhận mới loại phiếu /
-- độc giả khỏi điểm (refresh_contest_scores đã đọc status = 'confirmed');
-- không bao giờ tự khoá tài khoản.
--
-- Tín hiệu (mức tài khoản, không gắn bài — xác nhận thì loại người đó ở mọi
-- bài của cuộc thi). Ngưỡng truyền từ src/lib/contests/fraud-service.ts:
--   - rapid_voting: một tài khoản có ≥ p_rapid_votes phiếu trong
--     p_rapid_minutes phút. Mức 'high' khi gấp đôi ngưỡng.
--   - new_account_mass_voting: phiếu đầu tiên đến trong p_new_account_grace_days
--     ngày sau khi tài khoản vừa đủ tuổi bình chọn (vote_rules.min_account_age_days)
--     và bầu ≥ p_new_account_votes bài.
-- Phiếu không có meaningful read KHÔNG thành tín hiệu: phiếu đã lọc (P3) tự bỏ.
-- Mỗi (cuộc thi, mã, tài khoản, bài) chỉ gắn 1 lần — kể cả khi admin đã bỏ qua,
-- quét lại không gắn lại. Bằng chứng là số liệu lúc phát hiện.
--
-- Idempotent: if not exists, create or replace.
-- Test: docs/supabase/tests/20260926_contest_fraud_detection.test.sql.

create unique index if not exists contest_fraud_signals_dedupe_idx
  on public.contest_fraud_signals (
    contest_id,
    signal_code,
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(submission_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- Trả số tín hiệu mới. Chỉ quét cuộc thi đang/đã bình chọn chưa công bố.
create or replace function public.detect_contest_fraud_signals(
  p_contest_id uuid,
  p_rapid_votes integer,
  p_rapid_minutes integer,
  p_new_account_grace_days integer,
  p_new_account_votes integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest public.contests;
  v_min_age integer;
  v_created integer := 0;
  v_rows integer;
begin
  select * into v_contest from public.contests where id = p_contest_id;
  if not found then
    raise exception 'Contest % not found', p_contest_id using hint = 'contest_not_found';
  end if;
  if v_contest.status not in ('community_voting', 'judging') then
    return 0;
  end if;
  -- Hai lần quét cùng lúc (admin + cron) không gắn trùng.
  perform pg_advisory_xact_lock(hashtext('contest_fraud:' || p_contest_id::text));
  v_min_age := coalesce((v_contest.vote_rules ->> 'min_account_age_days')::integer, 7);

  -- rapid_voting: cửa sổ bắt đầu ở mỗi phiếu, lấy cửa sổ đông nhất của từng người.
  with windows as (
    select v1.user_id, v1.created_at as window_start,
           (select count(*) from public.contest_votes v2
             where v2.contest_id = p_contest_id and v2.user_id = v1.user_id
               and v2.created_at >= v1.created_at
               and v2.created_at < v1.created_at + make_interval(mins => p_rapid_minutes))::integer as n
    from public.contest_votes v1
    where v1.contest_id = p_contest_id
  ),
  best as (
    select distinct on (w.user_id) w.user_id, w.window_start, w.n
    from windows w
    order by w.user_id, w.n desc, w.window_start
  )
  insert into public.contest_fraud_signals (contest_id, user_id, signal_code, severity, evidence)
  select p_contest_id, b.user_id, 'rapid_voting',
         case when b.n >= 2 * p_rapid_votes then 'high' else 'medium' end,
         jsonb_build_object('votes_in_window', b.n, 'window_minutes', p_rapid_minutes, 'window_start', b.window_start)
  from best b
  where b.n >= p_rapid_votes
    and not exists (
      select 1 from public.contest_fraud_signals f
      where f.contest_id = p_contest_id and f.signal_code = 'rapid_voting'
        and f.user_id = b.user_id and f.submission_id is null
    );
  get diagnostics v_rows = row_count;
  v_created := v_created + v_rows;

  insert into public.contest_fraud_signals (contest_id, user_id, signal_code, severity, evidence)
  select p_contest_id, s.user_id, 'new_account_mass_voting', 'medium',
         jsonb_build_object(
           'account_created_at', u.created_at,
           'first_vote_at', s.first_vote,
           'account_age_days_at_first_vote', round((extract(epoch from (s.first_vote - u.created_at)) / 86400.0)::numeric, 1),
           'votes', s.votes)
  from (
    select v.user_id, min(v.created_at) as first_vote, count(*)::integer as votes
    from public.contest_votes v
    where v.contest_id = p_contest_id
    group by v.user_id
  ) s
  join auth.users u on u.id = s.user_id
  where s.votes >= p_new_account_votes
    and s.first_vote < u.created_at + make_interval(days => v_min_age + p_new_account_grace_days)
    and not exists (
      select 1 from public.contest_fraud_signals f
      where f.contest_id = p_contest_id and f.signal_code = 'new_account_mass_voting'
        and f.user_id = s.user_id and f.submission_id is null
    );
  get diagnostics v_rows = row_count;
  v_created := v_created + v_rows;

  return v_created;
end;
$$;

revoke execute on function public.detect_contest_fraud_signals(uuid, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.detect_contest_fraud_signals(uuid, integer, integer, integer, integer) to service_role;

-- Admin xác nhận / bỏ qua / mở lại một tín hiệu. Khoá khi bảng điểm đã chốt
-- (đã công bố kết quả) — quyết định lúc đó không còn tác dụng lên điểm.
create or replace function public.review_contest_fraud_signal(
  p_signal_id uuid,
  p_admin_id uuid,
  p_status text,          -- 'confirmed' | 'dismissed' | 'open'
  p_note text
) returns public.contest_fraud_signals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signal public.contest_fraud_signals;
  v_contest_status public.contest_status;
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and role in ('admin', 'super_admin')) then
    raise exception 'Actor is not an admin' using hint = 'not_admin';
  end if;
  if p_status is null or p_status not in ('confirmed', 'dismissed', 'open') then
    raise exception 'Invalid review status %', p_status using hint = 'invalid_input';
  end if;

  select * into v_signal from public.contest_fraud_signals where id = p_signal_id for update;
  if not found then
    raise exception 'Signal % not found', p_signal_id using hint = 'signal_not_found';
  end if;
  select status into v_contest_status from public.contests where id = v_signal.contest_id;
  if v_contest_status in ('results', 'archived') or exists (
    select 1 from public.contest_score_state st where st.contest_id = v_signal.contest_id and st.frozen_at is not null
  ) then
    raise exception 'Scores are frozen' using hint = 'signal_locked';
  end if;

  update public.contest_fraud_signals
     set status = p_status,
         reviewed_by = case when p_status = 'open' then null else p_admin_id end,
         reviewed_at = case when p_status = 'open' then null else now() end,
         review_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_signal_id
  returning * into v_signal;
  return v_signal;
end;
$$;

revoke execute on function public.review_contest_fraud_signal(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_contest_fraud_signal(uuid, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------
-- Notes — cập nhật cùng thay đổi này:
--   - docs/supabase/schema.sql: thêm nguyên khối này ở CUỐI file.
--   - src/lib/supabase/types.ts: Functions detect_contest_fraud_signals,
--     review_contest_fraud_signal.
--   - src/lib/contests/fraud-service.ts (ngưỡng, quét, xét → tính lại điểm),
--     cron /api/contests/cron/advance, tab "Gian lận" ở /admin/cuoc-thi/[id].
-- ---------------------------------------------------------------------
