-- Contest Engine Phase 3, Slice 3.5: sửa sau buổi chạy thử toàn trình (28/09/2026).
--
--   1. Bảng phiếu bình chọn hiện PHIẾU ĐÃ LỌC (chỉ người đọc thật) — quyết
--      định của chủ dự án. Số lấy từ bảng điểm (refresh_contest_scores): tính
--      lại khi có người xem, tối đa 1 lần / 15 phút, cộng cron 0h (P8) — không
--      đếm theo từng phiếu để tránh nghẽn khi nhiều người bình chọn cùng lúc.
--      Trong lúc bình chọn số phiếu đang ẩn, chỉ hạng trễ tối đa 15 phút.
--      snapshot_contest_ranks(): bảng phiếu chụp theo phiếu đã lọc
--      (get_contest_score_ranking 'popular'), cuộc thi popular-v1 giữ phiếu thô.
--   2. set_contest_submission_status(): tác giả chỉ rút bài khi cuộc thi còn
--      "Đang nhận bài" — admin đóng sớm thì chặn rút ngay (bản chụp đã chốt).
--
-- Idempotent: create or replace.
-- Test: docs/supabase/tests/20260928_contest_dry_run_fixes.test.sql.

-- ---------------------------------------------------------------------
-- 1. Chụp hạng bảng phiếu theo phiếu đã lọc (định nghĩa lại Slice 3.4)
-- ---------------------------------------------------------------------
create or replace function public.snapshot_contest_ranks(p_contest_id uuid, p_day date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.contest_status;
  v_filtered boolean;
  v_day date := coalesce(p_day, (now() at time zone 'Asia/Ho_Chi_Minh')::date);
  v_total integer := 0;
  v_page integer;
  v_rank integer;
  v_at timestamptz;
  v_id uuid;
  r record;
begin
  select c.status, coalesce(c.scoring_config ->> 'popular_formula_id', 'popular-v2') = 'popular-v2'
    into v_status, v_filtered
    from public.contests c where c.id = p_contest_id;
  if v_status is null then
    raise exception 'Contest % not found', p_contest_id using hint = 'contest_not_found';
  end if;

  -- Bảng phiếu bình chọn: chỉ biến động trong khung bình chọn. Cùng nguồn với
  -- BXH công khai: phiếu đã lọc (popular-v2) hoặc phiếu thô (popular-v1).
  if v_status = 'community_voting' and not exists (
    select 1 from public.contest_rank_snapshots s
     where s.contest_id = p_contest_id and s.kind = 'popular' and s.snapshot_day = v_day
  ) then
    v_rank := null; v_at := null; v_id := null;
    loop
      v_page := 0;
      for r in
        select * from public.get_contest_score_ranking(p_contest_id, 'popular', 100, v_rank, v_at, v_id) where v_filtered
        union all
        select * from public.get_contest_ranking(p_contest_id, 100, v_rank, v_at, v_id) where not v_filtered
      loop
        insert into public.contest_rank_snapshots (contest_id, kind, snapshot_day, submission_id, rank)
        values (p_contest_id, 'popular', v_day, r.submission_id, r.rank);
        v_page := v_page + 1;
        v_rank := r.rank; v_at := r.submitted_at; v_id := r.submission_id;
      end loop;
      v_total := v_total + v_page;
      exit when v_page < 100;
    end loop;
  end if;

  -- Trending: từ lúc nhận bài đến hết chấm (cùng tập cuộc thi được cron tính lại điểm).
  if v_status in ('submission_open', 'submission_closed', 'community_voting', 'judging') and not exists (
    select 1 from public.contest_rank_snapshots s
     where s.contest_id = p_contest_id and s.kind = 'trending' and s.snapshot_day = v_day
  ) then
    v_rank := null; v_at := null; v_id := null;
    loop
      v_page := 0;
      for r in select * from public.get_contest_score_ranking(p_contest_id, 'trending', 100, v_rank, v_at, v_id) loop
        insert into public.contest_rank_snapshots (contest_id, kind, snapshot_day, submission_id, rank)
        values (p_contest_id, 'trending', v_day, r.submission_id, r.rank);
        v_page := v_page + 1;
        v_rank := r.rank; v_at := r.submitted_at; v_id := r.submission_id;
      end loop;
      v_total := v_total + v_page;
      exit when v_page < 100;
    end loop;
  end if;

  return v_total;
end;
$$;

revoke execute on function public.snapshot_contest_ranks(uuid, date) from public, anon, authenticated;
grant execute on function public.snapshot_contest_ranks(uuid, date) to service_role;

-- ---------------------------------------------------------------------
-- 2. Rút bài chỉ khi còn "Đang nhận bài" (định nghĩa lại Slice 1.1)
-- ---------------------------------------------------------------------
-- Đổi trạng thái bài dự thi — ai được làm gì (IV.4, D6):
--   author: chỉ rút (→ withdrawn) bài của chính mình, từ submitted/eligible,
--           khi cuộc thi còn submission_open và trước submission_end (admin
--           đóng nhận bài sớm → bản chụp đã chốt, không rút được nữa);
--   admin:  mọi chuyển hợp lệ trong ma trận trừ withdrawn; ineligible/
--           disqualified bắt buộc lý do (hiển thị cho tác giả);
--   system: submitted → eligible/ineligible (duyệt tự động).
create or replace function public.set_contest_submission_status(
  p_submission_id uuid,
  p_to public.contest_submission_status,
  p_actor_id uuid,
  p_actor_kind text,
  p_reason text default null
) returns public.contest_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.contest_submissions;
  v_contest public.contests;
  v_result public.contest_submissions;
begin
  select * into v_sub from public.contest_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Submission % not found', p_submission_id using hint = 'submission_not_found';
  end if;
  select * into v_contest from public.contests where id = v_sub.contest_id;

  if v_sub.status = p_to then
    raise exception 'Submission is already %', p_to using hint = 'no_change';
  end if;

  if p_actor_kind = 'author' then
    if p_to <> 'withdrawn' then
      raise exception 'Authors can only withdraw' using hint = 'not_allowed';
    end if;
    if v_sub.author_id is distinct from p_actor_id then
      raise exception 'Submission is not owned by caller' using hint = 'not_owner';
    end if;
    if v_sub.status not in ('submitted', 'eligible')
       or v_contest.status <> 'submission_open'
       or now() >= v_contest.submission_end then
      raise exception 'Submission can no longer be withdrawn' using hint = 'withdraw_closed';
    end if;
  elsif p_actor_kind = 'admin' then
    if not exists (
      select 1 from public.profiles where id = p_actor_id and role in ('admin', 'super_admin')
    ) then
      raise exception 'Actor is not an admin' using hint = 'not_admin';
    end if;
    if p_to = 'withdrawn' then
      raise exception 'Only the author can withdraw' using hint = 'not_allowed';
    end if;
    if p_to in ('ineligible', 'disqualified') and coalesce(btrim(p_reason), '') = '' then
      raise exception 'A reason is required' using hint = 'reason_required';
    end if;
  elsif p_actor_kind = 'system' then
    if p_actor_id is not null or v_sub.status <> 'submitted' or p_to not in ('eligible', 'ineligible') then
      raise exception 'System can only review submitted entries' using hint = 'not_allowed';
    end if;
  else
    raise exception 'Unknown actor kind %', p_actor_kind using hint = 'not_allowed';
  end if;

  -- Ma trận (không phụ thuộc người thực hiện) được trigger guard kiểm.
  update public.contest_submissions
     set status = p_to,
         status_reason = case when p_to in ('ineligible', 'disqualified') then btrim(p_reason) else null end,
         status_changed_by = p_actor_id,
         status_changed_at = now()
   where id = p_submission_id
  returning * into v_result;

  insert into public.contest_submission_events (submission_id, from_status, to_status, actor_id, actor_kind, reason)
  values (p_submission_id, v_sub.status, p_to, p_actor_id, p_actor_kind, nullif(btrim(p_reason), ''));

  return v_result;
end;
$$;

revoke execute on function public.set_contest_submission_status(uuid, public.contest_submission_status, uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_contest_submission_status(uuid, public.contest_submission_status, uuid, text, text) to service_role;
