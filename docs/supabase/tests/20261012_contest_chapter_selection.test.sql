-- Run on dev/staging after 20261012_contest_chapter_selection.sql.
-- Expected final exception: PASS ... (all fixture data is rolled back).
do $$
declare
  author_id uuid := gen_random_uuid();
  book_id uuid;
  contest_id uuid;
  new_chapter uuid;
  other_chapter uuid;
  draft_chapter uuid;
  entry public.contest_submissions;
  snap_id uuid;
  hint text;
begin
  insert into auth.users (id, email) values (author_id, author_id || '@test.invalid');
  insert into public.profiles (id, username, nickname)
  values (author_id, 'cs' || left(replace(author_id::text, '-', ''), 12), 'Contest test');
  insert into public.books (author_id, title, slug, published, published_at)
  values (author_id, 'Existing story', 'cs-' || author_id, true, now() - interval '1 year') returning id into book_id;
  insert into public.chapters (book_id, title, content, order_index, published)
  values (book_id, 'Selected', 'một hai ba', 1, true) returning id into new_chapter;
  insert into public.chapters (book_id, title, content, order_index, published, price)
  values (book_id, 'Outside entry', 'bốn năm sáu bảy', 2, true, 5) returning id into other_chapter;
  insert into public.chapters (book_id, title, content, order_index, published)
  values (book_id, 'Draft', 'chưa xuất bản', 3, false) returning id into draft_chapter;
  insert into public.contests (title, slug, submission_start, submission_end, eligibility_rules, vote_rules)
  values ('Selection test', 'cs-' || author_id, now() - interval '1 day', now() + interval '1 day',
    '{"allow_resubmit_after_withdraw":true,"require_exclusive":false,"allow_multi_contest":true,"max_entries_per_author":null,"min_published_chapters":1,"min_words":2,"max_words":10}',
    '{"min_account_age_days":0,"require_completed_chapter":true}') returning id into contest_id;
  update public.contests set status = 'announced' where id = contest_id;
  update public.contests set status = 'submission_open' where id = contest_id;

  begin
    perform public.submit_contest_entry(contest_id, book_id, author_id, '1', '[]', array[draft_chapter]);
    raise exception 'FAIL draft accepted';
  exception when others then
    get stacked diagnostics hint = pg_exception_hint;
    if hint is distinct from 'invalid_chapter_selection' then raise; end if;
  end;
  begin
    perform public.submit_contest_entry(contest_id, book_id, author_id, '1', '[]', array[new_chapter, new_chapter]);
    raise exception 'FAIL duplicate accepted';
  exception when others then
    get stacked diagnostics hint = pg_exception_hint;
    if hint is distinct from 'invalid_chapter_selection' then raise; end if;
  end;
  begin
    perform public.submit_contest_entry(contest_id, book_id, author_id, '1', '[]', array[gen_random_uuid()]);
    raise exception 'FAIL unknown chapter accepted';
  exception when others then
    get stacked diagnostics hint = pg_exception_hint;
    if hint is distinct from 'invalid_chapter_selection' then raise; end if;
  end;

  entry := public.submit_contest_entry(contest_id, book_id, author_id, '1', '[]', array[new_chapter]);
  if entry.selected_chapter_ids <> array[new_chapter] then raise exception 'FAIL selection not saved'; end if;
  if not public.contest_submission_has_chapter(entry.id, new_chapter)
     or public.contest_submission_has_chapter(entry.id, other_chapter) then raise exception 'FAIL scope'; end if;
  -- Existing paid chapters outside the selected entry remain editable.
  update public.chapters set price = 8 where id = other_chapter;
  begin
    update public.chapters set price = 5 where id = new_chapter;
    raise exception 'FAIL selected chapter can charge';
  exception when others then
    get stacked diagnostics hint = pg_exception_hint;
    if hint is distinct from 'contest_paid_chapter' then raise; end if;
  end;
  begin
    update public.contest_submissions set selected_chapter_ids = array[other_chapter] where id = entry.id;
    raise exception 'FAIL selection mutable';
  exception when others then
    get stacked diagnostics hint = pg_exception_hint;
    if hint is distinct from 'invalid_chapter_selection' then raise; end if;
  end;
  begin
    update public.chapters set created_at = now() - interval '1 year' where id = new_chapter;
    raise exception 'FAIL creation timestamp mutable';
  exception when insufficient_privilege then null;
  end;
  update public.contests set status = 'submission_closed' where id = contest_id;
  perform public.snapshot_contest_submissions(contest_id);
  select id into snap_id from public.contest_submission_snapshots where submission_id = entry.id;
  if snap_id is null or (select chapter_count from public.contest_submission_snapshots where id = snap_id) <> 1
     or (select total_words from public.contest_submission_snapshots where id = snap_id) <> 3 then
    raise exception 'FAIL snapshot includes chapters outside entry';
  end if;
  raise exception 'PASS contest chapter selection: validation, scope, pricing, immutability, snapshots (rolled back)';
end;
$$;
