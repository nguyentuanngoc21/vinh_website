-- Migration: Contest Engine — chi trả giải vào ví tác giả (Slice 1.7, D10 + Q6).
-- Phụ thuộc migrations/20260926_add_contest_engine_core.sql.
--
-- Admin chi THỦ CÔNG từng giải (không tự chi khi công bố kết quả). Dùng lại
-- đúng luồng thưởng có sẵn grant_platform_bonus() — giao dịch platform_bonus
-- qua apply_transaction() (sổ cái ví), không có thời gian treo, không lẫn vào
-- doanh thu tác giả. Không thêm transaction_type mới.
--
-- pay_contest_award() khoá dòng giải rồi kiểm: kết quả đã công bố, giải chưa
-- thu hồi, chưa chi, có số token > 0 → chi cho tác giả của bài → ghi
-- payout_transaction_id + paid_at trong CÙNG transaction. Bấm 2 lần không chi
-- 2 lần. Giải đã chi mà sau đó bị thu hồi: trừ lại bằng admin_adjustment có
-- lý do (không sửa giao dịch cũ) — ngoài phạm vi hàm này.
--
-- Idempotent: create or replace function; FK thêm trong khối kiểm tồn tại.
-- Test: docs/supabase/tests/20260926_contest_award_payout.test.sql.

do $$ begin
  alter table public.contest_awards
    add constraint contest_awards_payout_transaction_fk
    foreign key (payout_transaction_id) references public.transactions (id);
exception when duplicate_object then null; end $$;

create or replace function public.pay_contest_award(p_award_id uuid, p_admin_id uuid)
returns public.contest_awards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_award public.contest_awards;
  v_contest public.contests;
  v_author uuid;
  v_txn public.transactions;
begin
  if p_admin_id is null or not exists (
    select 1 from public.profiles where id = p_admin_id and role in ('admin', 'super_admin')
  ) then
    raise exception 'Actor is not an admin' using hint = 'not_admin';
  end if;

  select * into v_award from public.contest_awards where id = p_award_id for update;
  if not found then
    raise exception 'Award % not found', p_award_id using hint = 'award_not_found';
  end if;
  select * into v_contest from public.contests where id = v_award.contest_id;

  if v_contest.status not in ('results', 'archived')
     or v_contest.results_published_at is null or v_contest.results_published_at > now() then
    raise exception 'Results are not published yet' using hint = 'results_not_published';
  end if;
  if v_award.revoked_at is not null then
    raise exception 'Award was revoked' using hint = 'award_revoked';
  end if;
  if v_award.payout_transaction_id is not null then
    raise exception 'Award already paid' using hint = 'award_already_paid';
  end if;
  if v_award.prize_tokens <= 0 then
    raise exception 'Award has no token prize' using hint = 'award_no_tokens';
  end if;

  select author_id into v_author from public.contest_submissions where id = v_award.submission_id;

  v_txn := public.grant_platform_bonus(
    p_admin_id,
    v_author,
    v_award.prize_tokens,
    format('Giải %s — %s', v_award.award_name, v_contest.title)
  );

  update public.contest_awards
     set payout_transaction_id = v_txn.id, paid_at = now()
   where id = p_award_id
  returning * into v_award;
  return v_award;
end;
$$;

revoke execute on function public.pay_contest_award(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pay_contest_award(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------
-- Notes — cập nhật cùng thay đổi này:
--   - docs/supabase/schema.sql: thêm nguyên khối này ở CUỐI file.
--   - src/lib/supabase/types.ts: Functions.pay_contest_award.
--   - src/lib/contests/errors.ts: results_not_published, award_revoked,
--     award_already_paid, award_no_tokens.
--   - POST /api/admin/contests/[contestId]/awards/[awardId]/pay + nút "Chi trả"
--     ở tab Giải thưởng (/admin/cuoc-thi/[contestId]).
-- ---------------------------------------------------------------------
