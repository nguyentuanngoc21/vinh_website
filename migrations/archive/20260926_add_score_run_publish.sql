-- Migration: công bố lượt tính chung cuộc (Contest Engine, Slice 2.6b).
-- Phụ thuộc migrations/20260926_add_final_scoring.sql (chạy trước).
--
--   - publish_contest_score_run(): chọn 1 lượt tính CHÍNH THỨC làm kết quả của
--     cuộc thi. Chỉ lượt dùng version cấu hình đang áp dụng. Đã có lượt được
--     công bố → bắt buộc lý do; lượt cũ được đánh dấu thay thế (superseded_at),
--     không xoá (audit — J3 mục 14).
--   - Mỗi cuộc thi tối đa 1 lượt đang công bố (unique index một phần).
--   - Cột công bố của contest_score_runs chỉ đổi qua hàm này; phần còn lại của
--     lượt tính bất biến (trigger).
-- Giải: hệ thống đề xuất theo snapshot; admin xác nhận thành contest_awards
-- bằng luồng trao giải sẵn có (J10) — không tạo giải tự động ở đây.
--
-- Idempotent: create or replace, if not exists.
-- Test: docs/supabase/tests/20260926_score_run_publish.test.sql.

create unique index if not exists contest_score_runs_one_published
  on public.contest_score_runs (contest_id) where published_at is not null and superseded_at is null;

create or replace function public.contest_score_runs_guard_update()
returns trigger
language plpgsql
as $$
begin
  if new.contest_id is distinct from old.contest_id or new.config_version is distinct from old.config_version
     or new.kind is distinct from old.kind or new.window_start is distinct from old.window_start
     or new.window_end is distinct from old.window_end or new.input_digest is distinct from old.input_digest
     or new.flags is distinct from old.flags or new.computed_by is distinct from old.computed_by
     or new.computed_at is distinct from old.computed_at then
    raise exception 'Score runs are immutable' using hint = 'score_run_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists contest_score_runs_guard_update on public.contest_score_runs;
create trigger contest_score_runs_guard_update
  before update on public.contest_score_runs
  for each row execute function public.contest_score_runs_guard_update();

create or replace function public.publish_contest_score_run(
  p_run_id uuid,
  p_admin_id uuid,
  p_reason text
) returns public.contest_score_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.contest_score_runs;
  v_contest public.contests;
  v_current uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and role in ('admin', 'super_admin')) then
    raise exception 'Actor is not an admin' using hint = 'not_admin';
  end if;
  select * into v_run from public.contest_score_runs where id = p_run_id for update;
  if not found then
    raise exception 'Score run % not found', p_run_id using hint = 'score_run_not_found';
  end if;
  select * into v_contest from public.contests where id = v_run.contest_id for update;
  if v_run.kind <> 'final' then
    raise exception 'Only final runs can be published' using hint = 'score_run_not_final';
  end if;
  if v_run.superseded_at is not null or v_run.published_at is not null then
    raise exception 'Run was already published' using hint = 'invalid_status_transition';
  end if;
  if v_run.config_version is distinct from v_contest.scoring_config_version then
    raise exception 'Run uses an old scoring config version' using hint = 'score_run_stale';
  end if;

  select id into v_current from public.contest_score_runs
  where contest_id = v_run.contest_id and published_at is not null and superseded_at is null
  for update;
  if v_current is not null then
    if v_reason is null then
      raise exception 'A reason is required to replace published results' using hint = 'reason_required';
    end if;
    update public.contest_score_runs set superseded_at = now() where id = v_current;
  end if;

  update public.contest_score_runs
     set published_at = now(), published_by = p_admin_id, publish_reason = v_reason
   where id = p_run_id
  returning * into v_run;
  return v_run;
end;
$$;

revoke execute on function public.publish_contest_score_run(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.publish_contest_score_run(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------
-- Notes — cập nhật cùng thay đổi này:
--   - docs/supabase/schema.sql: thêm nguyên khối này ở CUỐI file.
--   - src/lib/supabase/types.ts: Functions publish_contest_score_run.
--   - final-scoring-service.ts (công bố, lượt đang công bố, BXH công khai),
--     tab "Chấm điểm" (nút công bố), tab "Giải thưởng" (đề xuất → xác nhận),
--     microsite BXH "Chung cuộc" / "Ban giám khảo", chuyển sang "Đã có kết quả"
--     cần lượt đã công bố khi cuộc thi dùng chấm chung cuộc.
-- ---------------------------------------------------------------------
