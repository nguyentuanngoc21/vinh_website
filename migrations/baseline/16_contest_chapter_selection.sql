-- Existing stories may enter with an explicit, immutable chapter selection.
-- Apply 20261009_chapter_publication_time.sql first on existing databases.
begin;


alter table public.chapters add column if not exists published_at timestamptz;

-- Historical publication times were not recorded; created_at is the fallback.
update public.chapters set published_at = created_at
where published and published_at is null;

create or replace function public.set_chapter_published_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.published_at := case when new.published then now() else null end;
  else
    new.published_at := old.published_at;
    if new.published and not old.published and old.published_at is null then
      new.published_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists set_chapter_published_at on public.chapters;
create trigger set_chapter_published_at
before insert or update on public.chapters
for each row execute function public.set_chapter_published_at();




alter table public.contest_submissions add column if not exists selected_chapter_ids uuid[];
alter table public.contest_submissions drop constraint if exists contest_selection_nonempty;
alter table public.contest_submissions add constraint contest_selection_nonempty
  check (selected_chapter_ids is null or (cardinality(selected_chapter_ids) > 0 and array_position(selected_chapter_ids, null) is null));

-- Preserve server timestamps; publishing again must not reset the first publication.
create or replace function public.guard_contest_chapter_created_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.created_at := now();
  elsif new.created_at is distinct from old.created_at then
    raise exception 'Chapter creation time is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_contest_chapter_created_at on public.chapters;
create trigger guard_contest_chapter_created_at before insert or update of created_at on public.chapters
for each row execute function public.guard_contest_chapter_created_at();

-- One predicate used by voting, scoring, statistics and event quests.
create or replace function public.contest_submission_has_chapter(p_submission_id uuid, p_chapter_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.contest_submissions s join public.chapters ch on ch.book_id = s.book_id
    where s.id = p_submission_id and ch.id = p_chapter_id
      and (s.selected_chapter_ids is null or ch.id = any(s.selected_chapter_ids))
  );
$$;
revoke all on function public.contest_submission_has_chapter(uuid, uuid) from public, anon, authenticated;
grant execute on function public.contest_submission_has_chapter(uuid, uuid) to service_role;


drop function if exists public.submit_contest_entry(uuid, uuid, uuid, text, jsonb);

create or replace function public.submit_contest_entry(
  p_contest_id uuid,
  p_book_id uuid,
  p_user_id uuid,
  p_rules_version text,
  p_eligibility_result jsonb,
  p_chapter_ids uuid[] default null
) returns public.contest_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest public.contests;
  v_book public.books;
  v_existing public.contest_submissions;
  v_result public.contest_submissions;
  v_max integer;
begin
  select * into v_contest from public.contests where id = p_contest_id for update;
  if not found then
    raise exception 'Contest % not found', p_contest_id using hint = 'contest_not_found';
  end if;
  if v_contest.status <> 'submission_open'
     or now() < v_contest.submission_start or now() >= v_contest.submission_end then
    raise exception 'Contest is not accepting submissions' using hint = 'submission_closed';
  end if;
  if p_rules_version is distinct from v_contest.rules_version then
    raise exception 'Accepted rules version does not match' using hint = 'rules_version_mismatch';
  end if;

  select * into v_book from public.books where id = p_book_id for update;
  if not found then
    raise exception 'Book % not found', p_book_id using hint = 'book_not_found';
  end if;
  if v_book.author_id is distinct from p_user_id then
    raise exception 'Book is not owned by caller' using hint = 'not_owner';
  end if;
  if not v_book.published or v_book.deleted_at is not null then
    raise exception 'Book is not visible' using hint = 'book_not_visible';
  end if;

  perform 1 from public.chapters where book_id = p_book_id for update;
  if p_chapter_ids is not null then
    if cardinality(p_chapter_ids) = 0 or cardinality(p_chapter_ids) > 1000
       or cardinality(p_chapter_ids) <> (select count(distinct x) from unnest(p_chapter_ids) x)
       or (select count(*) from public.chapters ch
           where ch.book_id = p_book_id and ch.id = any(p_chapter_ids)
             and ch.published and ch.removed_at is null
             and ch.created_at >= v_contest.submission_start and ch.created_at < v_contest.submission_end
             and ch.published_at >= v_contest.submission_start and ch.published_at < v_contest.submission_end) <> cardinality(p_chapter_ids) then
      raise exception 'Invalid contest chapter selection' using hint = 'invalid_chapter_selection';
    end if;
    -- Recheck chapter limits under the same locks as the submission.
    if (select count(*) from public.chapters ch where ch.id = any(p_chapter_ids)) <
         coalesce((v_contest.eligibility_rules ->> 'min_published_chapters')::integer, 1)
       or (select sum(public.contest_word_count(ch.content)) from public.chapters ch where ch.id = any(p_chapter_ids)) <
         coalesce((v_contest.eligibility_rules ->> 'min_words')::integer, 0)
       or (select sum(public.contest_word_count(ch.content)) from public.chapters ch where ch.id = any(p_chapter_ids)) >
         coalesce((v_contest.eligibility_rules ->> 'max_words')::integer, 2147483647) then
      raise exception 'Chapter selection fails contest limits' using hint = 'not_eligible';
    end if;
  end if;
  if exists (
    select 1 from public.chapters
    where book_id = p_book_id and (p_chapter_ids is null or id = any(p_chapter_ids)) and removed_at is null and (price > 0 or audio_price > 0)
  ) then
    raise exception 'Every chapter must be free to enter a contest' using hint = 'paid_chapters';
  end if;

  if (v_contest.eligibility_rules ->> 'require_exclusive')::boolean and not v_book.is_exclusive then
    raise exception 'Contest requires an exclusive book' using hint = 'not_exclusive';
  end if;

  if exists (
    select 1 from public.contest_submissions s
    join public.contests oc on oc.id = s.contest_id
    where s.book_id = p_book_id
      and s.contest_id <> p_contest_id
      and s.status in ('submitted', 'eligible', 'shortlisted')
      and oc.status not in ('results', 'archived')
      and (not (v_contest.eligibility_rules ->> 'allow_multi_contest')::boolean
           or not (oc.eligibility_rules ->> 'allow_multi_contest')::boolean)
  ) then
    raise exception 'Book is in another contest that does not allow multiple entries'
      using hint = 'multi_contest_conflict';
  end if;

  if jsonb_typeof(v_contest.eligibility_rules -> 'max_entries_per_author') = 'number' then
    v_max := (v_contest.eligibility_rules ->> 'max_entries_per_author')::integer;
    if (
      select count(*) from public.contest_submissions
      where contest_id = p_contest_id and author_id = p_user_id and book_id <> p_book_id
        and status in ('submitted', 'eligible', 'shortlisted')
    ) >= v_max then
      raise exception 'Author reached the entry limit for this contest' using hint = 'max_entries_reached';
    end if;
  end if;

  select * into v_existing from public.contest_submissions
  where contest_id = p_contest_id and book_id = p_book_id for update;

  if found then
    if v_existing.status = 'withdrawn'
       and (v_contest.eligibility_rules ->> 'allow_resubmit_after_withdraw')::boolean then
      update public.contest_submissions
         set selected_chapter_ids = p_chapter_ids, status = 'eligible',
             status_reason = null,
             status_changed_by = p_user_id,
             status_changed_at = now(),
             submitted_at = now(),
             rules_version_accepted = p_rules_version,
             rules_accepted_at = now(),
             eligibility_result = coalesce(p_eligibility_result, '[]'::jsonb)
       where id = v_existing.id
      returning * into v_result;

      insert into public.contest_submission_events (submission_id, from_status, to_status, actor_id, actor_kind, reason)
      values (v_result.id, 'withdrawn', 'eligible', p_user_id, 'author', 'resubmit');
      return v_result;
    end if;
    raise exception 'Book is already entered in this contest'
      using errcode = 'unique_violation', hint = 'already_submitted';
  end if;

  insert into public.contest_submissions (
    contest_id, book_id, author_id, status, status_changed_by,
    rules_version_accepted, rules_accepted_at, eligibility_result, selected_chapter_ids
  ) values (
    p_contest_id, p_book_id, p_user_id, 'eligible', p_user_id,
    p_rules_version, now(), coalesce(p_eligibility_result, '[]'::jsonb), p_chapter_ids
  )
  returning * into v_result;

  insert into public.contest_submission_events (submission_id, from_status, to_status, actor_id, actor_kind, reason)
  values (v_result.id, null, 'eligible', p_user_id, 'author', 'submit');
  return v_result;
end;
$$;

revoke all on function public.submit_contest_entry(uuid, uuid, uuid, text, jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.submit_contest_entry(uuid, uuid, uuid, text, jsonb, uuid[]) to service_role;

create or replace function public.contest_submissions_guard_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select b.author_id into new.author_id from public.books b where b.id = new.book_id;
  if new.author_id is null then
    raise exception 'Book % not found', new.book_id using hint = 'book_not_found';
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('submitted', 'eligible') then
      raise exception 'A new submission must be submitted or eligible' using hint = 'invalid_status_transition';
    end if;
  else
    if new.selected_chapter_ids is distinct from old.selected_chapter_ids
       and not (old.status = 'withdrawn' and new.status = 'eligible') then
      raise exception 'Chapter selection is immutable' using hint = 'invalid_chapter_selection';
    end if;
    if new.contest_id is distinct from old.contest_id or new.book_id is distinct from old.book_id then
      raise exception 'Submission contest/book cannot change' using hint = 'submission_immutable';
    end if;
    if new.status is distinct from old.status
       and not public.contest_submission_transition_allowed(old.status, new.status) then
      raise exception 'Submission status cannot go from % to %', old.status, new.status
        using hint = 'invalid_status_transition';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.chapters_block_paid_during_contest()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.price > 0 or new.audio_price > 0)
     and new.removed_at is null
     and exists (
       select 1 from public.contest_submissions s join public.contests c on c.id = s.contest_id
       where s.book_id = new.book_id and s.status in ('submitted', 'eligible', 'shortlisted')
         and c.status not in ('results', 'archived')
         and (s.selected_chapter_ids is null or new.id = any(s.selected_chapter_ids))
     ) then
    raise exception 'Chapter of a book in an active contest must be free'
      using errcode = 'check_violation', hint = 'contest_paid_chapter';
  end if;
  return new;
end;
$$;

create or replace function public.take_contest_snapshots_for_book(
  p_book_id uuid,
  p_old_chapter public.chapters default null,
  p_old_book public.books default null,
  p_submission_id uuid default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_book public.books;
  v_sub record;
  v_snap uuid;
  v_count integer := 0;
begin
  if (p_old_book).id is not null then
    v_book := p_old_book;
  else
    select * into v_book from public.books where id = p_book_id;
  end if;
  if v_book.id is null then
    return 0;
  end if;

  for v_sub in
    select s.id, s.contest_id
    from public.contest_submissions s
    join public.contests c on c.id = s.contest_id
    where s.book_id = p_book_id
      and (p_submission_id is null or s.id = p_submission_id)
      and s.status in ('submitted', 'eligible', 'shortlisted')
      and c.status in ('submission_open', 'submission_closed', 'community_voting', 'judging')
      and (c.status <> 'submission_open' or now() >= c.submission_end)
      and not exists (
        select 1 from public.contest_submission_snapshots x
        where x.submission_id = s.id and x.reason = 'submission_closed'
      )
  loop
    v_snap := null;
    insert into public.contest_submission_snapshots (submission_id, contest_id, reason, book_title, synopsis, genre, tags)
    values (v_sub.id, v_sub.contest_id, 'submission_closed', v_book.title, v_book.synopsis, v_book.genre, coalesce(v_book.tags, '{}'))
    on conflict (submission_id, reason) do nothing
    returning id into v_snap;
    continue when v_snap is null;

    insert into public.contest_submission_snapshot_chapters (snapshot_id, chapter_id, order_index, title, content, word_count, content_hash)
    select v_snap, ch.id, ch.order_index, ch.title, ch.content,
           public.contest_word_count(ch.content),
           encode(sha256(convert_to(ch.content, 'UTF8')), 'hex')
    from (
      select c.id, c.order_index, c.title, c.content
      from public.chapters c
      where c.book_id = p_book_id and public.contest_submission_has_chapter(v_sub.id, c.id) and c.published and c.removed_at is null
        and ((p_old_chapter).id is null or c.id <> (p_old_chapter).id)
      union all
      select (p_old_chapter).id, (p_old_chapter).order_index, (p_old_chapter).title, (p_old_chapter).content
      where (p_old_chapter).id is not null
        and (p_old_chapter).book_id = p_book_id
        and public.contest_submission_has_chapter(v_sub.id, (p_old_chapter).id)
        and (p_old_chapter).published
        and (p_old_chapter).removed_at is null
    ) ch;

    update public.contest_submission_snapshots s
       set chapter_count = t.n, total_words = t.words
      from (
        select count(*)::integer as n, coalesce(sum(word_count), 0)::integer as words
        from public.contest_submission_snapshot_chapters where snapshot_id = v_snap
      ) t
     where s.id = v_snap;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.cast_contest_vote(
  p_user_id uuid,
  p_submission_id uuid
) returns public.contest_votes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.contest_submissions;
  v_contest public.contests;
  v_user_created timestamptz;
  v_vote public.contest_votes;
begin
  select * into v_sub from public.contest_submissions where id = p_submission_id;
  if not found then
    raise exception 'Submission % not found', p_submission_id using hint = 'submission_not_found';
  end if;
  select * into v_contest from public.contests where id = v_sub.contest_id;

  if v_contest.status <> 'community_voting'
     or v_contest.voting_start is null or v_contest.voting_end is null
     or now() < v_contest.voting_start or now() >= v_contest.voting_end then
    raise exception 'Voting is not open' using hint = 'voting_closed';
  end if;

  if v_sub.status not in ('eligible', 'shortlisted') or not exists (
    select 1 from public.books b where b.id = v_sub.book_id and b.published and b.deleted_at is null
  ) then
    raise exception 'Entry cannot receive votes' using hint = 'entry_not_votable';
  end if;

  if v_sub.author_id = p_user_id then
    raise exception 'Authors cannot vote for their own entry' using hint = 'own_entry';
  end if;

  select created_at into v_user_created from auth.users where id = p_user_id;
  if v_user_created is null then
    raise exception 'User % not found', p_user_id using hint = 'user_not_found';
  end if;
  if v_user_created > now() - make_interval(days => (v_contest.vote_rules ->> 'min_account_age_days')::integer) then
    raise exception 'Account is too new to vote' using hint = 'account_too_new';
  end if;

  if (v_contest.vote_rules ->> 'require_completed_chapter')::boolean and not exists (
    select 1 from public.reading_history rh
    join public.chapters ch on ch.id = rh.chapter_id
    where rh.user_id = p_user_id
      and ch.book_id = v_sub.book_id and public.contest_submission_has_chapter(v_sub.id, ch.id)
      and ch.published and ch.removed_at is null
  ) then
    raise exception 'Read at least one chapter before voting' using hint = 'no_completed_chapter';
  end if;

  insert into public.contest_votes (contest_id, submission_id, user_id)
  values (v_sub.contest_id, p_submission_id, p_user_id)
  on conflict (submission_id, user_id) do nothing
  returning * into v_vote;

  if v_vote.id is null then
    raise exception 'Already voted for this entry' using hint = 'already_voted';
  end if;
  return v_vote;
end;
$$;

create or replace function public.get_contest_entries(
  p_contest_id uuid,              -- null = mọi cuộc thi công khai đang diễn ra (hub)
  p_sort text,                    -- 'new' | 'discover' | 'az'
  p_seed text,                    -- chỉ dùng cho 'discover'
  p_genre text,                   -- null = mọi thể loại
  p_limit integer,
  p_after_key text default null,  -- sort_key của dòng cuối trang trước
  p_after_id uuid default null,
  p_viewer_id uuid default null
) returns table (
  submission_id uuid,
  contest_id uuid,
  book_id uuid,
  author_id uuid,
  status public.contest_submission_status,
  submitted_at timestamptz,
  sort_key text,
  viewer_has_voted boolean,
  viewer_completed_chapter boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_after_ts timestamptz;
begin
  if p_sort not in ('new', 'discover', 'az') then
    raise exception 'Unknown sort %', p_sort using hint = 'invalid_sort';
  end if;
  if p_sort = 'discover' and coalesce(p_seed, '') = '' then
    raise exception 'Discover feed needs a seed' using hint = 'invalid_sort';
  end if;
  -- Ép kiểu cursor TRƯỚC truy vấn: OR trong SQL không đảm bảo đánh giá ngắn
  -- mạch, nên không được để p_after_key::timestamptz chạy trên cursor md5/tựa.
  if p_sort = 'new' and p_after_id is not null then
    begin
      v_after_ts := p_after_key::timestamptz;
    exception when others then
      raise exception 'Invalid cursor' using hint = 'invalid_cursor';
    end;
  end if;

  return query
  with entries as (
    select s.id, s.contest_id, s.book_id, s.author_id, s.status, s.submitted_at,
           case p_sort
             when 'new' then to_char(s.submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
             when 'discover' then md5(s.id::text || p_seed)
             else lower(b.title)
           end as sort_key
    from public.contest_submissions s
    join public.contests c on c.id = s.contest_id
    join public.books b on b.id = s.book_id and b.published and b.deleted_at is null
    where s.status in ('eligible', 'shortlisted')
      and (
        (p_contest_id is not null and s.contest_id = p_contest_id and c.status <> 'draft')
        or (p_contest_id is null and c.status in ('submission_open', 'submission_closed', 'community_voting', 'judging'))
      )
      and (p_genre is null or b.genre = p_genre)
  ),
  page as (
    select e.* from entries e
    where p_after_id is null
       or (p_sort = 'new' and (e.submitted_at, e.id) < (v_after_ts, p_after_id))
       or (p_sort <> 'new' and (e.sort_key, e.id) > (p_after_key, p_after_id))
    order by
      case when p_sort = 'new' then e.submitted_at end desc,
      case when p_sort = 'new' then e.id end desc,
      case when p_sort <> 'new' then e.sort_key end asc,
      case when p_sort <> 'new' then e.id end asc
    limit v_limit
  )
  select p.id, p.contest_id, p.book_id, p.author_id, p.status, p.submitted_at, p.sort_key,
         p_viewer_id is not null and exists (
           select 1 from public.contest_votes v where v.submission_id = p.id and v.user_id = p_viewer_id
         ),
         p_viewer_id is not null and exists (
           select 1 from public.reading_history rh
           join public.chapters ch on ch.id = rh.chapter_id
           where rh.user_id = p_viewer_id and ch.book_id = p.book_id and public.contest_submission_has_chapter(p.id, ch.id) and ch.published and ch.removed_at is null
         )
  from page p
  order by
    case when p_sort = 'new' then p.submitted_at end desc,
    case when p_sort = 'new' then p.id end desc,
    case when p_sort <> 'new' then p.sort_key end asc,
    case when p_sort <> 'new' then p.id end asc;
end;
$$;

create or replace function public.refresh_contest_scores(
  p_contest_id uuid,
  p_force boolean default false,
  p_freeze boolean default false
) returns public.contest_score_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest public.contests;
  v_state public.contest_score_state;
  -- Mặc định giống DEFAULT_SCORING_CONFIG (config.ts): cuộc thi tạo trước
  -- Slice 2.2 không có các khoá này trong scoring_config.
  v_ratio numeric;
  v_min_seconds integer;
  v_wpm integer;
begin
  select * into v_contest from public.contests where id = p_contest_id;
  if not found then
    raise exception 'Contest % not found', p_contest_id using hint = 'contest_not_found';
  end if;
  if p_freeze and not (v_contest.status in ('results', 'archived') and v_contest.results_published_at is not null) then
    raise exception 'Scores can only be frozen after results are published' using hint = 'scores_not_final';
  end if;

  insert into public.contest_score_state (contest_id) values (p_contest_id) on conflict (contest_id) do nothing;
  select * into v_state from public.contest_score_state where contest_id = p_contest_id for update skip locked;
  if v_state.contest_id is null then
    -- Lần tính khác đang giữ khoá.
    select * into v_state from public.contest_score_state where contest_id = p_contest_id;
    return v_state;
  end if;
  if v_state.frozen_at is not null then
    return v_state;
  end if;
  if not p_force and v_state.refreshed_at is not null and v_state.refreshed_at > now() - interval '15 minutes' then
    return v_state;
  end if;

  v_ratio := coalesce((v_contest.scoring_config ->> 'meaningful_read_ratio')::numeric, 0.4);
  v_min_seconds := coalesce((v_contest.scoring_config ->> 'meaningful_read_min_seconds')::integer, 30);
  v_wpm := coalesce((v_contest.scoring_config ->> 'reading_words_per_minute')::integer, 250);

  with entries as (
    select s.id, s.book_id, s.author_id
    from public.contest_submissions s
    where s.contest_id = p_contest_id
  ),
  sessions as (
    select e.id as submission_id, rs.user_id, rs.chapter_id, rs.active_seconds, rs.start_time, rs.end_time, rs.id as session_id
    from entries e
    join public.reading_sessions rs on rs.book_id = e.book_id and public.contest_submission_has_chapter(e.id, rs.chapter_id)
    where rs.start_time >= v_contest.submission_start
      and rs.user_id <> e.author_id
      and rs.active_seconds > 0
  ),
  -- Chỉ đếm chữ cho chương thật sự có người đọc — không quét cả cuộc thi.
  chapter_need as (
    select ch.id as chapter_id,
           greatest(v_min_seconds, ceil(v_ratio * public.contest_word_count(ch.content) * 60.0 / v_wpm))::integer as need
    from public.chapters ch
    where ch.id in (select distinct chapter_id from sessions)
      and ch.published and ch.removed_at is null
  ),
  running as (
    select s.submission_id, s.user_id, s.end_time, n.need,
           sum(s.active_seconds) over (
             partition by s.submission_id, s.user_id, s.chapter_id
             order by s.start_time, s.session_id
             rows between unbounded preceding and current row
           ) as acc
    from sessions s
    join chapter_need n on n.chapter_id = s.chapter_id
  ),
  readers as (
    select r.submission_id, r.user_id, min(r.end_time) as reached_at
    from running r
    where r.acc >= r.need
      and not exists (
        select 1 from public.contest_fraud_signals f
        where f.contest_id = p_contest_id and f.status = 'confirmed' and f.user_id = r.user_id
          and (f.submission_id is null or f.submission_id = r.submission_id)
      )
    group by r.submission_id, r.user_id
  ),
  vote_counts as (
    select v.submission_id,
           count(*)::integer as raw,
           count(*) filter (where exists (
             select 1 from readers r where r.submission_id = v.submission_id and r.user_id = v.user_id
           ))::integer as filtered
    from public.contest_votes v
    where v.contest_id = p_contest_id
    group by v.submission_id
  ),
  reader_counts as (
    select r.submission_id,
           count(*)::integer as total,
           count(*) filter (where r.reached_at >= now() - interval '7 days')::integer as d7,
           count(*) filter (where r.reached_at >= now() - interval '14 days' and r.reached_at < now() - interval '7 days')::integer as prev
    from readers r
    group by r.submission_id
  )
  insert into public.contest_submission_scores
    (submission_id, contest_id, raw_votes, filtered_votes, valid_readers, readers_7d, readers_prev_7d, computed_at)
  select e.id, p_contest_id, coalesce(vc.raw, 0), coalesce(vc.filtered, 0),
         coalesce(rc.total, 0), coalesce(rc.d7, 0), coalesce(rc.prev, 0), now()
  from entries e
  left join vote_counts vc on vc.submission_id = e.id
  left join reader_counts rc on rc.submission_id = e.id
  on conflict (submission_id) do update
    set raw_votes = excluded.raw_votes,
        filtered_votes = excluded.filtered_votes,
        valid_readers = excluded.valid_readers,
        readers_7d = excluded.readers_7d,
        readers_prev_7d = excluded.readers_prev_7d,
        computed_at = excluded.computed_at;

  update public.contest_score_state
     set refreshed_at = now(),
         frozen_at = case when p_freeze then now() else null end,
         params = jsonb_build_object(
           'meaningful_read_ratio', v_ratio,
           'meaningful_read_min_seconds', v_min_seconds,
           'reading_words_per_minute', v_wpm)
   where contest_id = p_contest_id
  returning * into v_state;
  return v_state;
end;
$$;

create or replace function public.get_contest_entry_stats(p_submission_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sub public.contest_submissions;
  v_start timestamptz;
  v_result jsonb;
begin
  select * into v_sub from public.contest_submissions where id = p_submission_id;
  if not found then
    raise exception 'Submission % not found', p_submission_id using hint = 'submission_not_found';
  end if;
  select submission_start into v_start from public.contests where id = v_sub.contest_id;

  with chapters as (
    select ch.id, ch.title, ch.order_index,
           row_number() over (order by ch.order_index, ch.id) as pos
    from public.chapters ch
    where ch.book_id = v_sub.book_id and public.contest_submission_has_chapter(v_sub.id, ch.id) and ch.published and ch.removed_at is null
  ),
  sessions as (
    select rs.user_id, rs.chapter_id, rs.active_seconds, rs.start_time, rs.source
    from public.reading_sessions rs
    where rs.book_id = v_sub.book_id and public.contest_submission_has_chapter(v_sub.id, rs.chapter_id)
      and rs.start_time >= v_start
      and rs.user_id <> v_sub.author_id
      and rs.active_seconds > 0
  ),
  readers as (
    select s.user_id,
           count(distinct (s.start_time at time zone 'Asia/Ho_Chi_Minh')::date) as days
    from sessions s
    group by s.user_id
  ),
  chapter_readers as (
    select distinct s.user_id, c.pos
    from sessions s
    join chapters c on c.id = s.chapter_id
  ),
  funnel as (
    select c.id, c.title, c.pos, count(cr.user_id)::integer as readers
    from chapters c
    left join chapter_readers cr on cr.pos = c.pos
    where c.pos <= 50
    group by c.id, c.title, c.pos
  ),
  continuation as (
    select a.pos,
           count(*)::numeric as prev_readers,
           count(b.user_id)::numeric as kept
    from chapter_readers a
    left join chapter_readers b on b.user_id = a.user_id and b.pos = a.pos + 1
    where a.pos < (select max(pos) from chapters)
    group by a.pos
  ),
  first_source as (
    select distinct on (s.user_id) s.user_id, coalesce(s.source, 'other') as source
    from sessions s
    order by s.user_id, s.start_time
  ),
  last_chapter as (
    select c.id from chapters c order by c.pos desc limit 1
  ),
  comments as (
    select ac.user_id
    from public.anchored_comments ac
    join chapters c on c.id = ac.chapter_id
    where ac.created_at >= v_start and ac.user_id <> v_sub.author_id
  ),
  follows as (
    select f.created_at
    from public.author_follows f
    where f.author_id = v_sub.author_id and f.created_at >= v_start
  )
  select jsonb_build_object(
    'since', v_start,
    'chapter_count', (select count(*) from chapters),
    'readers', (select count(*) from readers),
    'return_readers', (select count(*) from readers where days >= 2),
    'completed_readers', (
      select count(distinct rh.user_id) from public.reading_history rh
      where rh.chapter_id = (select id from last_chapter)
        and rh.read_at >= v_start and rh.user_id <> v_sub.author_id),
    'continue_rate', (
      select case when (select count(*) from chapters) < 2 or count(*) = 0 then null
                  else round(avg(kept / prev_readers), 4) end
      from continuation),
    'avg_session_seconds', (select round(avg(active_seconds))::integer from sessions),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('source', x.source, 'readers', x.n) order by x.n desc, x.source)
      from (select source, count(*)::integer as n from first_source group by source) x), '[]'::jsonb),
    'funnel', coalesce((
      select jsonb_agg(jsonb_build_object('chapter_id', f.id, 'title', f.title, 'position', f.pos, 'readers', f.readers) order by f.pos)
      from funnel f), '[]'::jsonb),
    'comments', (select count(*) from comments),
    'commenters', (select count(distinct user_id) from comments),
    'new_followers', (select count(*) from follows),
    'new_followers_7d', (select count(*) from follows where created_at >= now() - interval '7 days'),
    'valid_readers', (select sc.valid_readers from public.contest_submission_scores sc where sc.submission_id = p_submission_id),
    'readers_7d', (select sc.readers_7d from public.contest_submission_scores sc where sc.submission_id = p_submission_id)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.get_contest_scoring_metrics(p_contest_id uuid)
returns table (
  submission_id uuid,
  submitted_at timestamptz,
  has_snapshot boolean,
  valid_readers integer,
  reader_depths double precision[],
  returning_readers integer,
  engaged_readers integer,
  valid_votes integer,
  judge_totals numeric[],
  active_judges integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_contest public.contests;
  v_cfg jsonb;
  v_start timestamptz;
  v_end timestamptz;
  v_ratio numeric;
  v_min_seconds numeric;
  v_wpm numeric;
  v_max_wpm numeric;
  v_gap interval;
  v_min_active numeric;
  v_actions text[];
begin
  select * into v_contest from public.contests where id = p_contest_id;
  if not found then
    raise exception 'Contest % not found', p_contest_id using hint = 'contest_not_found';
  end if;
  if v_contest.official_scoring_start is null then
    raise exception 'Official scoring window is not set' using hint = 'scoring_window_missing';
  end if;
  select config into v_cfg from public.contest_scoring_configs
  where contest_id = p_contest_id and version = v_contest.scoring_config_version;
  if v_cfg is null then
    raise exception 'Scoring config is missing' using hint = 'scoring_config_missing';
  end if;

  v_start := v_contest.official_scoring_start;
  v_end := v_contest.official_scoring_end;
  v_ratio := (v_cfg #>> '{valid_reader,meaningful_read_ratio}')::numeric;
  v_min_seconds := (v_cfg #>> '{valid_reader,meaningful_read_min_seconds}')::numeric;
  v_wpm := (v_cfg #>> '{valid_reader,reading_words_per_minute}')::numeric;
  v_max_wpm := (v_cfg #>> '{reading_depth,max_words_per_minute}')::numeric;
  v_gap := make_interval(mins => (v_cfg #>> '{return_visit,min_gap_minutes}')::integer);
  v_min_active := (v_cfg #>> '{return_visit,min_active_seconds}')::numeric;
  v_actions := array(select jsonb_array_elements_text(v_cfg -> 'engagement_actions'));

  return query
  with entries as (
    select s.id as sub_id, s.book_id, s.author_id, s.submitted_at as sub_at,
           snap.id as snap_id, snap.total_words
    from public.contest_submissions s
    join public.books b on b.id = s.book_id and b.published and b.deleted_at is null
    left join public.contest_submission_snapshots snap on snap.submission_id = s.id and snap.reason = 'submission_closed'
    where s.contest_id = p_contest_id and s.status in ('eligible', 'shortlisted')
  ),
  snap_ch as (
    select e.sub_id, sc.chapter_id, sc.word_count
    from entries e
    join public.contest_submission_snapshot_chapters sc on sc.snapshot_id = e.snap_id
    where sc.chapter_id is not null
  ),
  fraud as (
    select f.user_id as f_user, f.submission_id as f_sub
    from public.contest_fraud_signals f
    where f.contest_id = p_contest_id and f.status = 'confirmed' and f.user_id is not null
  ),
  sess as (
    select e.sub_id, rs.user_id as uid, rs.chapter_id as ch_id, rs.active_seconds as act,
           rs.start_time as st, rs.end_time as en, coalesce(rs.words_reached, 0) as reached, rs.id as sid
    from entries e
    join public.reading_sessions rs on rs.book_id = e.book_id
    where rs.start_time >= v_start and rs.start_time < v_end
      and rs.user_id <> e.author_id
      and rs.active_seconds > 0
      and not exists (select 1 from fraud f where f.f_user = rs.user_id and (f.f_sub is null or f.f_sub = e.sub_id))
  ),
  per_chapter as (
    select s.sub_id, s.uid, s.ch_id, sum(s.act) as act, max(s.reached) as reached, sc.word_count as words
    from sess s
    join snap_ch sc on sc.sub_id = s.sub_id and sc.chapter_id = s.ch_id
    group by s.sub_id, s.uid, s.ch_id, sc.word_count
  ),
  valid as (
    select distinct pc.sub_id, pc.uid
    from per_chapter pc
    where pc.act >= greatest(v_min_seconds, ceil(v_ratio * pc.words * 60.0 / v_wpm))
  ),
  depth as (
    select v.sub_id, v.uid,
           least(1.0, coalesce(
             sum(least(pc.reached::numeric, pc.act * v_max_wpm / 60.0, pc.words::numeric)) / nullif(max(e.total_words), 0),
             0)) as d
    from valid v
    join per_chapter pc on pc.sub_id = v.sub_id and pc.uid = v.uid
    join entries e on e.sub_id = v.sub_id
    group by v.sub_id, v.uid
  ),
  ordered as (
    select s.sub_id, s.uid, s.act, s.st, s.sid,
           case when lag(s.en) over w is null or s.st - lag(s.en) over w >= v_gap then 1 else 0 end as new_visit
    from sess s
    join valid v on v.sub_id = s.sub_id and v.uid = s.uid
    window w as (partition by s.sub_id, s.uid order by s.st, s.sid)
  ),
  visits as (
    select o.sub_id, o.uid, o.act,
           sum(o.new_visit) over (partition by o.sub_id, o.uid order by o.st, o.sid rows between unbounded preceding and current row) as visit_no
    from ordered o
  ),
  returners as (
    select x.sub_id, x.uid
    from (select vi.sub_id, vi.uid, vi.visit_no, sum(vi.act) as act from visits vi group by vi.sub_id, vi.uid, vi.visit_no) x
    where x.act >= v_min_active
    group by x.sub_id, x.uid
    having count(*) >= 2
  ),
  book_chapters as (
    select e.sub_id, ch.id as ch_id from entries e join public.chapters ch on ch.book_id = e.book_id and public.contest_submission_has_chapter(e.sub_id, ch.id)
  ),
  actions as (
    select bc.sub_id, ac.user_id as uid
    from public.anchored_comments ac join book_chapters bc on bc.ch_id = ac.chapter_id
    where 'comment' = any(v_actions) and ac.created_at >= v_start and ac.created_at < v_end
    union
    select bc.sub_id, cv.user_id
    from public.chapter_votes cv join book_chapters bc on bc.ch_id = cv.chapter_id
    where 'chapter_vote' = any(v_actions) and cv.created_at >= v_start and cv.created_at < v_end
    union
    select bc.sub_id, tv.user_id
    from public.character_trope_votes tv join book_chapters bc on bc.ch_id = tv.chapter_id
    where 'character_vote' = any(v_actions) and tv.created_at >= v_start and tv.created_at < v_end
    union
    select e.sub_id, rl.user_id
    from public.reading_list_items li
    join public.reading_lists rl on rl.id = li.list_id
    join entries e on e.book_id = li.book_id
    where 'reading_list' = any(v_actions) and li.added_at >= v_start and li.added_at < v_end
    union
    select e.sub_id, fo.follower_id
    from public.author_follows fo join entries e on e.author_id = fo.author_id
    where 'author_follow' = any(v_actions) and fo.created_at >= v_start and fo.created_at < v_end
  ),
  engaged as (
    select distinct a.sub_id, a.uid from actions a join valid v on v.sub_id = a.sub_id and v.uid = a.uid
  ),
  votes as (
    select cv.submission_id as sub_id, count(*)::integer as n
    from public.contest_votes cv
    join valid v on v.sub_id = cv.submission_id and v.uid = cv.user_id
    where cv.contest_id = p_contest_id and cv.created_at >= v_start and cv.created_at < v_end
    group by cv.submission_id
  ),
  judges as (
    select j.user_id as jid from public.contest_judges j where j.contest_id = p_contest_id and j.removed_at is null
  ),
  judge_cards as (
    select c.submission_id as sub_id, array_agg(c.total order by c.judge_id) as totals
    from public.contest_judge_scorecards c
    join judges j on j.jid = c.judge_id
    where c.contest_id = p_contest_id and c.status = 'finalized'
    group by c.submission_id
  )
  select e.sub_id,
         e.sub_at,
         e.snap_id is not null,
         (select count(*) from valid v where v.sub_id = e.sub_id)::integer,
         coalesce((select array_agg(d.d::double precision order by d.uid) from depth d where d.sub_id = e.sub_id), '{}'::double precision[]),
         (select count(*) from returners r where r.sub_id = e.sub_id)::integer,
         (select count(*) from engaged g where g.sub_id = e.sub_id)::integer,
         coalesce((select vo.n from votes vo where vo.sub_id = e.sub_id), 0),
         coalesce(jc.totals, '{}'::numeric[]),
         (select count(*) from judges)::integer
  from entries e
  left join judge_cards jc on jc.sub_id = e.sub_id
  order by e.sub_at, e.sub_id;
end;
$$;

create or replace function public.record_contest_activity(
  p_user_id uuid,
  p_event text,
  p_book_id uuid,
  p_chapter_id uuid default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot public.user_quest_pool;
  v_template public.task_templates;
  v_contest public.contests;
  v_entry record;
  v_sub uuid;
  v_author uuid;
  v_words integer;
  v_active integer;
  v_updated integer;
  v_meaningful boolean;
begin
  -- Thời gian đọc thật của chương (dùng chung cho Passport + nhiệm vụ).
  if p_event = 'chapter_completed' then
    select public.contest_word_count(ch.content) into v_words
    from public.chapters ch
    where ch.id = p_chapter_id and ch.book_id = p_book_id and ch.published and ch.removed_at is null;
    if v_words is null then
      return false;
    end if;
    select coalesce(sum(rs.active_seconds), 0)::integer into v_active
    from public.reading_sessions rs where rs.user_id = p_user_id and rs.chapter_id = p_chapter_id;
  end if;

  -- ===== Passport (Slice 3.2): mọi cuộc thi trong mùa có bài này =====
  for v_entry in
    select s.id as sub_id, s.author_id, c.*
    from public.contest_submissions s
    join public.contests c on c.id = s.contest_id
    join public.books b on b.id = s.book_id and b.published and b.deleted_at is null
    where s.book_id = p_book_id and s.status in ('eligible', 'shortlisted')
      and c.status in ('submission_open', 'submission_closed', 'community_voting', 'judging')
      and s.author_id <> p_user_id
      and (p_event not in ('chapter_completed', 'comment') or public.contest_submission_has_chapter(s.id, p_chapter_id))
  loop
    if p_event = 'chapter_completed' then
      v_meaningful := v_active >= greatest(
        coalesce((v_entry.scoring_config ->> 'meaningful_read_min_seconds')::numeric, 30),
        ceil(coalesce((v_entry.scoring_config ->> 'meaningful_read_ratio')::numeric, 0.4) * v_words * 60.0
             / coalesce((v_entry.scoring_config ->> 'reading_words_per_minute')::numeric, 250)));
      if v_meaningful then
        insert into public.contest_passport_reads (user_id, contest_id, submission_id, chapter_id, read_day, hidden_gem)
        values (p_user_id, v_entry.id, v_entry.sub_id, p_chapter_id, (now() at time zone 'Asia/Ho_Chi_Minh')::date,
          coalesce((select sc.valid_readers from public.contest_submission_scores sc where sc.submission_id = v_entry.sub_id), 0)
            < coalesce((v_entry.scoring_config ->> 'hidden_gem_max_readers')::integer, 100)
          or p_book_id not in (
            select s2.book_id from public.contest_submissions s2
            join public.books b2 on b2.id = s2.book_id and b2.published and b2.deleted_at is null
            where s2.contest_id = v_entry.id and s2.status in ('eligible', 'shortlisted')
            order by b2.view_count desc, s2.submitted_at asc, s2.id asc
            limit 10))
        on conflict (user_id, contest_id, chapter_id, read_day) do nothing;
      end if;
    end if;
    perform public.contest_passport_state(p_user_id, v_entry.id, true);
  end loop;

  -- ===== Nhiệm vụ sự kiện (Slice 3.1) =====
  select * into v_slot from public.user_quest_pool
  where user_id = p_user_id and pool_date = current_date and slot_kind = 'event';
  if v_slot.id is null then
    return false;
  end if;
  select * into v_template from public.task_templates where id = v_slot.task_template_id;
  if not (
    (p_event = 'chapter_completed' and v_template.contest_action in ('read_entry_chapter', 'read_hidden_gem'))
    or (p_event = 'comment' and v_template.contest_action = 'comment_entry')
    or (p_event = 'reading_list_add' and v_template.contest_action = 'save_entry')
    or (p_event = 'vote' and v_template.contest_action = 'vote_entry')
  ) then
    return false;
  end if;

  select * into v_contest from public.contests where id = v_slot.contest_id;
  select s.id, s.author_id into v_sub, v_author
  from public.contest_submissions s
  join public.books b on b.id = s.book_id and b.published and b.deleted_at is null
  where s.contest_id = v_slot.contest_id and s.book_id = p_book_id and s.status in ('eligible', 'shortlisted');
  if v_sub is null or v_author = p_user_id or (p_event in ('chapter_completed', 'comment') and not public.contest_submission_has_chapter(v_sub, p_chapter_id)) then
    return false;
  end if;

  if p_event = 'chapter_completed' then
    -- K7: tới cuối chương VÀ thời gian đọc thật ≥ ngưỡng đọc thật của cuộc thi.
    if v_active < greatest(
      coalesce((v_contest.scoring_config ->> 'meaningful_read_min_seconds')::numeric, 30),
      ceil(coalesce((v_contest.scoring_config ->> 'meaningful_read_ratio')::numeric, 0.4) * v_words * 60.0
           / coalesce((v_contest.scoring_config ->> 'reading_words_per_minute')::numeric, 250))) then
      return false;
    end if;
    if v_template.contest_action = 'read_hidden_gem' and not (
      coalesce((select sc.valid_readers from public.contest_submission_scores sc where sc.submission_id = v_sub), 0)
        < coalesce((v_contest.scoring_config ->> 'hidden_gem_max_readers')::integer, 100)
      or p_book_id not in (
        select s.book_id from public.contest_submissions s
        join public.books b on b.id = s.book_id and b.published and b.deleted_at is null
        where s.contest_id = v_slot.contest_id and s.status in ('eligible', 'shortlisted')
        order by b.view_count desc, s.submitted_at asc, s.id asc
        limit 10)
    ) then
      return false;
    end if;
  end if;

  insert into public.user_daily_tasks (user_id, template_id, task_date)
  values (p_user_id, v_template.id, v_slot.pool_date)
  on conflict (user_id, template_id, task_date) do nothing;
  update public.user_daily_tasks
     set progress = least(progress + 1, v_template.target_count),
         completed = (progress + 1) >= v_template.target_count
   where user_id = p_user_id and template_id = v_template.id and task_date = v_slot.pool_date and not completed;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

create or replace function public.contest_passport_state(p_user_id uuid, p_contest_id uuid, p_record_completion boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest public.contests;
  v_read_entries integer;
  v_authors integer;
  v_finished integer;
  v_gems integer;
  v_comments integer;
  v_votes integer;
  v_days integer;
  v_milestones jsonb;
  v_done boolean;
  v_completed timestamptz;
begin
  select * into v_contest from public.contests where id = p_contest_id;
  if not found then
    raise exception 'Contest % not found', p_contest_id using hint = 'contest_not_found';
  end if;

  select count(distinct r.submission_id), count(distinct s.author_id), count(distinct r.read_day),
         count(distinct r.submission_id) filter (where r.hidden_gem)
    into v_read_entries, v_authors, v_days, v_gems
  from public.contest_passport_reads r
  join public.contest_submissions s on s.id = r.submission_id
  where r.user_id = p_user_id and r.contest_id = p_contest_id;

  select count(*) into v_finished
  from (
    select r.submission_id
    from public.contest_passport_reads r
    join public.contest_submissions s on s.id = r.submission_id
    join public.chapters ch on ch.id = r.chapter_id and ch.book_id = s.book_id and public.contest_submission_has_chapter(s.id, ch.id) and ch.published and ch.removed_at is null
    where r.user_id = p_user_id and r.contest_id = p_contest_id
    group by r.submission_id, s.book_id, s.id
    having count(distinct r.chapter_id) >= (
      select count(*) from public.chapters c2 where c2.book_id = s.book_id and public.contest_submission_has_chapter(s.id, c2.id) and c2.published and c2.removed_at is null)
  ) x;

  select count(*) into v_comments
  from public.anchored_comments ac
  join public.chapters ch on ch.id = ac.chapter_id
  join public.contest_submissions s on s.book_id = ch.book_id and s.contest_id = p_contest_id and s.status in ('eligible', 'shortlisted')
  where public.contest_submission_has_chapter(s.id, ac.chapter_id) and ac.user_id = p_user_id and ac.user_id <> s.author_id and ac.created_at >= v_contest.submission_start;

  select count(*) into v_votes
  from public.contest_votes v
  join public.contest_submissions s on s.id = v.submission_id and s.status in ('eligible', 'shortlisted')
  where v.user_id = p_user_id and v.contest_id = p_contest_id;

  v_milestones := jsonb_build_array(
    jsonb_build_object('code', 'read_entry', 'progress', least(v_read_entries, 1), 'target', 1),
    jsonb_build_object('code', 'read_3_authors', 'progress', least(v_authors, 3), 'target', 3),
    jsonb_build_object('code', 'finish_entry', 'progress', least(v_finished, 1), 'target', 1),
    jsonb_build_object('code', 'hidden_gem', 'progress', least(v_gems, 1), 'target', 1),
    jsonb_build_object('code', 'comment_entry', 'progress', least(v_comments, 1), 'target', 1),
    jsonb_build_object('code', 'vote_3', 'progress', least(v_votes, 3), 'target', 3),
    jsonb_build_object('code', 'return_3_days', 'progress', least(v_days, 3), 'target', 3)
  );
  v_done := not exists (
    select 1 from jsonb_array_elements(v_milestones) m where (m ->> 'progress')::integer < (m ->> 'target')::integer);

  if v_done and p_record_completion
     and v_contest.status in ('submission_open', 'submission_closed', 'community_voting', 'judging') then
    insert into public.contest_passports (user_id, contest_id) values (p_user_id, p_contest_id)
    on conflict (user_id, contest_id) do nothing;
  end if;
  select completed_at into v_completed from public.contest_passports where user_id = p_user_id and contest_id = p_contest_id;

  return jsonb_build_object('milestones', v_milestones, 'completed_at', v_completed);
end;
$$;

commit;
