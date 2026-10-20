-- Allow editing rule text and version while announced, before submissions open.
BEGIN;

create or replace function public.contests_guard_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_missing text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'A new contest must start as draft' using hint = 'contest_must_start_draft';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if not public.contest_status_transition_allowed(old.status, new.status) then
      raise exception 'Contest status cannot go from % to %', old.status, new.status
        using hint = 'invalid_status_transition';
    end if;
    if old.status = 'draft' then
      v_missing := public.contest_config_missing_key(new.eligibility_rules, new.vote_rules);
      if v_missing is not null then
        raise exception 'Contest config is incomplete: %', v_missing using hint = 'config_incomplete';
      end if;
    end if;
    if new.status = 'community_voting' and (new.voting_start is null or new.voting_end is null) then
      raise exception 'Voting window must be set before community voting' using hint = 'voting_window_missing';
    end if;
  end if;

  if old.status <> 'draft' and (
       new.slug is distinct from old.slug
    or new.eligibility_rules is distinct from old.eligibility_rules
    or new.vote_rules is distinct from old.vote_rules
    or new.prizes_summary is distinct from old.prizes_summary
  ) then
    raise exception 'Contest rules are locked once the contest is public' using hint = 'rules_locked';
  end if;

  -- Rule text may change while announced, strictly before the original opening time.
  -- Checking both rows prevents changing the deadline to unlock an already-started contest.
  if (new.rules_content is distinct from old.rules_content
      or new.rules_version is distinct from old.rules_version)
     and old.status <> 'draft'
     and not (old.status = 'announced' and new.status = 'announced'
              and now() < old.submission_start and now() < new.submission_start) then
    raise exception 'Contest rules are locked once the contest has started' using hint = 'rules_locked';
  end if;

  if new.scoring_config is distinct from old.scoring_config and (
       old.status in ('community_voting', 'judging', 'results', 'archived')
    or (old.voting_start is not null and now() >= old.voting_start)
  ) then
    raise exception 'Scoring formula is locked once voting has opened' using hint = 'scoring_locked';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

COMMIT;
