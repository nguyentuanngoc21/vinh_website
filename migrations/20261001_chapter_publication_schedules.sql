-- Apply before deploying the scheduling UI and cron endpoint.
begin;
create table public.chapter_publication_schedules (
  id uuid primary key,
  book_id uuid not null references public.books(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  chapter_ids uuid[] not null check (cardinality(chapter_ids) between 1 and 300),
  starts_at timestamptz not null,
  interval_days integer not null default 0 check (interval_days in (0, 1)),
  price integer check (price >= 0),
  next_index integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled', 'failed')),
  error text,
  created_at timestamptz not null default now()
);
alter table public.chapter_publication_schedules enable row level security;
create policy "authors read their publication schedules" on public.chapter_publication_schedules
  for select to authenticated using (author_id = auth.uid());
grant select on public.chapter_publication_schedules to authenticated;
grant all on public.chapter_publication_schedules to service_role;
create index chapter_publication_schedules_pending on public.chapter_publication_schedules(starts_at) where status = 'pending';

create function public.schedule_chapter_publication(
  p_id uuid, p_book_id uuid, p_chapter_ids uuid[], p_starts_at timestamptz,
  p_interval_days integer default 0, p_price integer default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ids uuid[]; v_existing public.chapter_publication_schedules;
begin
  if auth.uid() is null then raise exception 'Vui lòng đăng nhập lại.'; end if;
  perform 1 from public.books where id = p_book_id and author_id = auth.uid() and deleted_at is null for update;
  if not found then raise exception 'Không có quyền hẹn giờ cho truyện này.'; end if;
  select * into v_existing from public.chapter_publication_schedules where id = p_id;
  if found then
    if v_existing.author_id <> auth.uid() or v_existing.book_id <> p_book_id then raise exception 'Lượt hẹn giờ không hợp lệ.'; end if;
    return p_id; -- idempotent retry after a lost HTTP response
  end if;
  if p_starts_at is null or p_starts_at <= now() or p_interval_days not in (0,1) or p_interval_days is null
    or cardinality(p_chapter_ids) not between 1 and 300 or p_chapter_ids is null or p_price < 0 then
    raise exception 'Thời gian hoặc danh sách chương không hợp lệ.';
  end if;
  select array_agg(id order by order_index, id) into v_ids from public.chapters
    where book_id = p_book_id and id = any(p_chapter_ids) and not published and removed_at is null;
  if cardinality(v_ids) is distinct from cardinality(p_chapter_ids) then raise exception 'Danh sách có chương không còn là nháp hoặc đã bị gỡ.'; end if;
  if exists(select 1 from public.chapter_publication_schedules
    where book_id = p_book_id and status = 'pending' and chapter_ids && v_ids) then
    raise exception 'Một số chương đã có lịch đăng. Hãy huỷ lịch cũ trước.';
  end if;
  insert into public.chapter_publication_schedules(id,book_id,author_id,chapter_ids,starts_at,interval_days,price)
    values(p_id,p_book_id,auth.uid(),v_ids,p_starts_at,p_interval_days,p_price);
  return p_id;
end $$;

create function public.cancel_chapter_publication(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.chapter_publication_schedules set status = 'cancelled', error = null
    where id = p_id and author_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Lịch đăng đã xử lý hoặc bạn không có quyền huỷ.'; end if;
end $$;

-- Only the trusted worker supplies the current agreement version.
create function public.run_due_chapter_publications(p_agreement_version text)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.chapter_publication_schedules; b public.books; v_ids uuid[]; v_count integer; v_total integer := 0;
begin
  for s in select * from public.chapter_publication_schedules
    where status = 'pending' and starts_at + (next_index * interval_days) * interval '24 hours' <= now()
    order by starts_at limit 50 for update skip locked
  loop
    begin
      select * into b from public.books where id = s.book_id for update;
      if not found or b.deleted_at is not null or b.author_id <> s.author_id then raise exception 'Truyện không còn khả dụng.'; end if;
      if b.is_exclusive and not exists(select 1 from public.agreement_acceptances
        where user_id = s.author_id and agreement_id = 'chinh-sach-doc-quyen' and accepted_version = p_agreement_version) then
        raise exception 'Cần xác nhận lại thỏa thuận độc quyền trước khi đăng.';
      end if;
      v_ids := case when s.interval_days = 0 then s.chapter_ids else array[s.chapter_ids[s.next_index + 1]] end;
      perform 1 from public.chapters where id = any(v_ids) order by id for update;
      if (select count(*) from public.chapters where book_id = s.book_id and id = any(v_ids) and removed_at is null) <> cardinality(v_ids) then
        raise exception 'Chương đã bị xoá, chuyển truyện hoặc bị quản trị viên gỡ.';
      end if;
      update public.chapters set published = true, price = coalesce(s.price, price)
        where book_id = s.book_id and id = any(v_ids) and not published and removed_at is null;
      get diagnostics v_count = row_count;
      update public.books set published = true where id = s.book_id and not published;
      if v_count > 0 then perform public.increment_task_progress(s.author_id, 'author_publish_chapter', v_count); end if;
      update public.chapter_publication_schedules
        set next_index = case when interval_days = 0 then cardinality(chapter_ids) else next_index + 1 end,
            status = case when interval_days = 0 or next_index + 1 >= cardinality(chapter_ids) then 'completed' else 'pending' end,
            error = null where id = s.id;
      v_total := v_total + v_count;
    exception when others then
      -- This subtransaction rolls back chapters, visibility and rewards together.
      update public.chapter_publication_schedules set status = 'failed', error = left(sqlerrm, 500) where id = s.id;
    end;
  end loop;
  return v_total;
end $$;

revoke all on function public.schedule_chapter_publication(uuid,uuid,uuid[],timestamptz,integer,integer) from public, anon;
grant execute on function public.schedule_chapter_publication(uuid,uuid,uuid[],timestamptz,integer,integer) to authenticated;
revoke all on function public.cancel_chapter_publication(uuid) from public, anon;
grant execute on function public.cancel_chapter_publication(uuid) to authenticated;
revoke all on function public.run_due_chapter_publications(text) from public, anon, authenticated;
grant execute on function public.run_due_chapter_publications(text) to service_role;
commit;
