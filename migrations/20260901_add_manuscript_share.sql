-- Migration: Share bản thảo kiểu Drive (yêu cầu bổ sung #1 của người
-- dùng) — TỔNG QUÁT cho MỌI truyện ở "Viết truyện", không chỉ truyện gắn
-- đơn viết thuê. Giới hạn đúng 1 tài khoản đang được share/truyện, gỡ ra
-- rồi share lại được, khóa vĩnh viễn sau khi tác giả bấm "Hoàn thiện".
--
-- Cũng thêm orders.book_id (nullable) — để 1 đơn ghostwriting biết đang
-- viết cho ĐÚNG truyện nào (Mục 6 đặc tả sẽ cần link này để gắn cờ
-- is_ghostwritten ở Phase 5 — CHƯA làm ở migration này, cột is_ghostwritten
-- chưa tồn tại).
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

-- "Hoàn thiện" — khóa 1 chiều, giống hệt trigger prevent_unset_last_chapter
-- (schema.sql phần 3) nhưng ở cấp BOOK thay vì chapter. Set 1 lần, không
-- unset lại được.
alter table public.books add column finalized_at timestamptz;

-- Client (authenticated) cần sửa được finalized_at qua RLS-scoped client
-- (route mirror đúng pattern PATCH /api/authoring/books/[bookId] hiện có)
-- — thêm vào đúng danh sách cột đã restrict ở
-- migrations/20260825_restrict_books_column_grants.sql (REVOKE UPDATE rồi
-- GRANT lại đúng cột cho phép, không phải GRANT thêm — Postgres GRANT là
-- cộng dồn nên chỉ cần GRANT thêm cột mới, không cần REVOKE lại từ đầu).
grant update (finalized_at) on public.books to authenticated;

create function public.prevent_unfinalize_book()
returns trigger as $$
begin
  if old.finalized_at is not null and new.finalized_at is null then
    raise exception 'Không thể bỏ trạng thái Hoàn thiện của một truyện đã hoàn thiện.';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger prevent_unfinalize_book_trigger
  before update on public.books
  for each row execute function public.prevent_unfinalize_book();

-- Share bản thảo — tối đa 1 dòng ĐANG HOẠT ĐỘNG (revoked_at is null and
-- locked_at is null) mỗi book, đúng ràng buộc "chỉ 1 tài khoản". order_id
-- NULLABLE — chỉ có giá trị khi share phát sinh từ 1 đơn ghostwriting
-- (route attach-book, xem migration order_book_link), share thủ công từ
-- "Viết truyện" (không liên quan đơn hàng nào) thì để null.
create table public.manuscript_access_grants (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  order_id uuid references public.orders (id),
  granted_to_user_id uuid not null references auth.users (id) on delete cascade,
  granted_by_user_id uuid not null references auth.users (id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  locked_at timestamptz,
  check (granted_to_user_id <> granted_by_user_id)
);

-- "Chỉ 1 tài khoản" ép ở tầng DB, không chỉ ở route — partial unique index
-- trên (book_id) khi còn hoạt động.
create unique index manuscript_access_grants_one_active_idx
  on public.manuscript_access_grants (book_id)
  where revoked_at is null and locked_at is null;

alter table public.manuscript_access_grants enable row level security;

create policy "granter and grantee view their own grants"
  on public.manuscript_access_grants for select
  using (auth.uid() = granted_by_user_id or auth.uid() = granted_to_user_id);

create policy "book owner grants access"
  on public.manuscript_access_grants for insert
  with check (
    auth.uid() = granted_by_user_id
    and exists (select 1 from public.books b where b.id = book_id and b.author_id = auth.uid() and b.finalized_at is null)
  );

create policy "book owner revokes access before finalized"
  on public.manuscript_access_grants for update
  using (auth.uid() = granted_by_user_id and locked_at is null)
  with check (auth.uid() = granted_by_user_id and locked_at is null);

-- Chỉ cột revoked_at client được sửa (gỡ quyền) — granted_at/locked_at
-- KHÔNG nằm trong GRANT, locked_at chỉ trigger dưới đây được set.
grant update (revoked_at) on public.manuscript_access_grants to authenticated;

create index manuscript_access_grants_book_idx on public.manuscript_access_grants (book_id);
create index manuscript_access_grants_grantee_idx on public.manuscript_access_grants (granted_to_user_id) where revoked_at is null;

-- Khi "Hoàn thiện" (books.finalized_at chuyển null -> not null): khóa
-- TOÀN BỘ grant đang hoạt động của book đó — tự động ở tầng DB, không
-- route nào tự set locked_at trực tiếp được (không có trong GRANT ở
-- trên), tránh bị bỏ qua nếu sau này có thêm 1 đường update khác.
create function public.lock_manuscript_grants_on_finalize()
returns trigger as $$
begin
  if new.finalized_at is not null and old.finalized_at is null then
    update public.manuscript_access_grants
      set locked_at = now()
      where book_id = new.id and revoked_at is null and locked_at is null;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger lock_manuscript_grants_on_finalize_trigger
  after update on public.books
  for each row execute function public.lock_manuscript_grants_on_finalize();

-- Order biết đang viết cho truyện nào (Mục 6 Phase 5 cần link này). Chỉ 1
-- đơn ghostwriting mới gắn book_id — route attach-book (phase này) validate
-- listing.service_type = 'ghostwriting' + book.author_id = seller trước
-- khi cho gắn.
alter table public.orders add column book_id uuid references public.books (id);

-- Gắn 1 truyện của seller vào 1 đơn ghostwriting VÀ cấp quyền xem cho
-- buyer CÙNG LÚC, atomically — Mục 4.3 đặc tả: "Nút Cấp quyền xem chỉ có
-- 1 lựa chọn cố định: đúng buyer của order đó" nên gộp thẳng vào action
-- attach thay vì tách 2 bước (tránh route gọi cấp quyền cho tài khoản
-- khác buyer). Cùng khuôn 1-hàm-1-hành-động với các hàm Order khác — xem
-- migrations/20260901_add_order_system_core.sql.
create function public.attach_order_book(p_order_id uuid, p_actor_id uuid, p_book_id uuid)
returns public.orders as $$
declare
  v_order public.orders;
  v_book public.books;
  v_listing_type public.service_type;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order is null then raise exception 'Order % not found', p_order_id; end if;
  if v_order.seller_id <> p_actor_id then raise exception 'Only the seller attaches a manuscript'; end if;
  if v_order.status = 'completed' or v_order.status = 'cancelled' then
    raise exception 'Cannot attach a manuscript to a closed order';
  end if;

  select service_type into v_listing_type from public.service_listings where id = v_order.listing_id;
  if v_listing_type <> 'ghostwriting' then
    raise exception 'Only ghostwriting orders can attach a manuscript';
  end if;

  select * into v_book from public.books where id = p_book_id;
  if v_book is null or v_book.author_id <> p_actor_id then
    raise exception 'Book % not found or not owned by seller', p_book_id;
  end if;

  update public.orders set book_id = p_book_id where id = p_order_id returning * into v_order;

  begin
    insert into public.manuscript_access_grants (book_id, order_id, granted_to_user_id, granted_by_user_id)
    values (p_book_id, p_order_id, v_order.buyer_id, p_actor_id);
  exception when unique_violation then
    raise exception 'Truyện này đang được chia sẻ cho một tài khoản khác — gỡ chia sẻ cũ (mục Viết truyện) trước khi gắn vào đơn này.';
  end;

  insert into public.order_events (order_id, event_type, actor_id, payload)
  values (p_order_id, 'book_attached', p_actor_id, jsonb_build_object('book_id', p_book_id));

  return v_order;
end;
$$ language plpgsql security definer;

revoke execute on function public.attach_order_book from public, anon, authenticated;
grant execute on function public.attach_order_book to service_role;

COMMIT;

-- Notes:
-- 1. Cập nhật docs/supabase/schema.sql phần 3 (books — thêm cột
--    finalized_at + GRANT + 2 trigger) và phần 12 (orders — thêm book_id;
--    bảng manuscript_access_grants mới, đặt tên phần 12e).
-- 2. Cập nhật src/lib/supabase/types.ts — books.Row/Update thêm
--    finalized_at, orders.Row thêm book_id, bảng
--    manuscript_access_grants mới.
-- 3. KHÔNG mở rộng RLS select của books/chapters cho grantee — đọc bản
--    thảo qua route GET /api/authoring/books/[bookId]/manuscript riêng
--    (service-role, tự kiểm manuscript_access_grants, xem route đó) để
--    không phải sửa lại các rule exclusivity/soft-delete đang có trên
--    books/chapters.
