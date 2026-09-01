-- Migration: Đứng tên tác giả thay + is_ghostwritten/author_display +
-- ẩn 2 chiều (Module 5 + 6 đặc tả, yêu cầu bổ sung #2 của người dùng:
-- "truyện viết thuê KHÔNG hiển thị ở cả 2 phía trừ khi khách hàng đồng ý").
--
-- is_ghostwritten set true NGAY LÚC attach_order_book() (Phase 3, xem
-- CREATE OR REPLACE bên dưới) — độc lập với thỏa thuận đứng tên (thỏa
-- thuận chỉ quyết định AI được hiển thị là tác giả + có lộ trong sample
-- của ai không, không quyết định "có phải hàng viết thuê không").
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

alter table public.books
  add column if not exists is_ghostwritten boolean not null default false,
  add column if not exists author_display text not null default 'pen_name'
    check (author_display in ('pen_name', 'anonymous', 'customer_name', 'co_authorship'));

-- Client (authenticated) không tự sửa 2 cột này qua REST API trực tiếp —
-- CHỈ đổi được qua finalize_author_name_agreement() bên dưới (security
-- definer) hoặc attach_order_book() (is_ghostwritten). KHÔNG thêm vào
-- GRANT UPDATE của books ở phần 3 — cố ý để ngoài danh sách đó.

-- Mỗi Order ghostwriting có TỐI ĐA 1 thỏa thuận (order_id unique) — 2 bên
-- XÁC NHẬN ĐỘC LẬP (không phải request/resolve như cancel/file-request):
-- bên khởi tạo chọn author_display_choice + 2 cờ hiển thị sample và TỰ
-- xác nhận phần của mình luôn; bên còn lại xác nhận SAU, đúng lựa chọn đã
-- chốt (không cho đổi choice sau khi đã có 1 xác nhận — xem
-- initiate_author_name_agreement()). Chỉ khi CẢ 2 *_confirmed_at khác
-- NULL mới áp dụng lên books (Mục 5 đặc tả).
create table public.author_name_agreements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id),
  book_id uuid not null references public.books (id),
  ghostwriter_id uuid not null references auth.users (id),
  ghostwriter_confirmed_at timestamptz,
  ghostwriter_statement_text text,
  customer_id uuid not null references auth.users (id),
  customer_confirmed_at timestamptz,
  customer_statement_text text,
  author_display_choice text not null check (author_display_choice in ('customer_name', 'co_authorship')),
  -- Mặc định KHÔNG hiển thị ở CẢ HAI phía — đúng yêu cầu bổ sung #2. Chốt
  -- 1 lần lúc initiate_author_name_agreement() cùng với author_display_choice
  -- (cùng 1 quyết định, không tách thời điểm đổi riêng — xem hàm đó).
  ghostwriter_sample_visible boolean not null default false,
  customer_profile_visible boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.author_name_agreements enable row level security;

create policy "ghostwriter and customer view their own agreement"
  on public.author_name_agreements for select
  using (auth.uid() = ghostwriter_id or auth.uid() = customer_id);

-- Không có policy insert/update cho "authenticated" — chỉ các hàm dưới
-- (security definer) ghi. Bảng KHÔNG cho sửa sau khi đủ 2 xác nhận (Mục 5:
-- "không cho sửa/xoá sau khi đã có đủ 2 xác nhận") — enforce bằng cách
-- các hàm dưới tự chặn, không phải RLS.

create index author_name_agreements_book_idx on public.author_name_agreements (book_id);

-- p_choice: 'customer_name' (chỉ khách hàng đứng tên công khai) hoặc
-- 'co_authorship' (cả 2 tên cùng hiển thị). Statement text SINH RA Ở ĐÂY
-- (server), không nhận từ client — đúng câu chữ đã hiển thị cho user tại
-- thời điểm bấm (Mục 5: "không phải checkbox, lưu chuỗi text cụ thể").
create function public.initiate_author_name_agreement(
  p_order_id uuid, p_actor_id uuid, p_choice text,
  p_ghostwriter_sample_visible boolean default false,
  p_customer_profile_visible boolean default false
) returns public.author_name_agreements as $$
declare
  v_order public.orders;
  v_book public.books;
  v_ghostwriter_name text;
  v_customer_name text;
  v_book_title text;
  v_statement text;
  v_row public.author_name_agreements;
begin
  if p_choice not in ('customer_name', 'co_authorship') then
    raise exception 'Invalid author_display choice: %', p_choice;
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if v_order is null then raise exception 'Order % not found', p_order_id; end if;
  if v_order.seller_id <> p_actor_id and v_order.buyer_id <> p_actor_id then
    raise exception 'Only order parties can start an author-name agreement';
  end if;
  if v_order.book_id is null then raise exception 'Order has no attached manuscript'; end if;
  if exists (select 1 from public.author_name_agreements where order_id = p_order_id) then
    raise exception 'An author-name agreement already exists for this order';
  end if;

  select * into v_book from public.books where id = v_order.book_id;
  select nickname into v_ghostwriter_name from public.profiles where id = v_order.seller_id;
  select nickname into v_customer_name from public.profiles where id = v_order.buyer_id;
  v_book_title := v_book.title;

  insert into public.author_name_agreements (
    order_id, book_id, ghostwriter_id, customer_id, author_display_choice,
    ghostwriter_sample_visible, customer_profile_visible
  ) values (
    p_order_id, v_order.book_id, v_order.seller_id, v_order.buyer_id, p_choice,
    p_ghostwriter_sample_visible, p_customer_profile_visible
  ) returning * into v_row;

  -- Bên khởi tạo tự xác nhận phần của mình ngay — statement SINH RIÊNG
  -- theo đúng vai trò (chủ ngữ là chính người xác nhận), y hệt logic ở
  -- confirm_author_name_agreement() bên dưới — không suy ra bằng cách
  -- thay thế chuỗi (dễ sai nếu 2 tên trùng/lồng nhau).
  if p_actor_id = v_order.seller_id then
    v_statement := case p_choice
      when 'customer_name' then format('Tôi, %s, đồng ý để %s đứng tên tác giả công khai đối với tác phẩm "%s".', v_ghostwriter_name, v_customer_name, v_book_title)
      else format('Tôi, %s, đồng ý cùng %s đứng tên đồng tác giả công khai đối với tác phẩm "%s".', v_ghostwriter_name, v_customer_name, v_book_title)
    end;
    update public.author_name_agreements
      set ghostwriter_confirmed_at = now(), ghostwriter_statement_text = v_statement
      where id = v_row.id returning * into v_row;
  else
    v_statement := case p_choice
      when 'customer_name' then format('Tôi, %s, đồng ý đứng tên tác giả công khai đối với tác phẩm "%s" do %s viết hộ.', v_customer_name, v_book_title, v_ghostwriter_name)
      else format('Tôi, %s, đồng ý cùng %s đứng tên đồng tác giả công khai đối với tác phẩm "%s".', v_customer_name, v_ghostwriter_name, v_book_title)
    end;
    update public.author_name_agreements
      set customer_confirmed_at = now(), customer_statement_text = v_statement
      where id = v_row.id returning * into v_row;
  end if;

  insert into public.order_events (order_id, event_type, actor_id, payload)
  values (p_order_id, 'author_name_agreement_initiated', p_actor_id, jsonb_build_object('choice', p_choice));

  return v_row;
end;
$$ language plpgsql security definer;

-- Bên CÒN LẠI xác nhận đúng lựa chọn đã chốt — không đổi được choice ở
-- đây (nếu không đồng ý thì đơn giản là không xác nhận, không có nút "từ
-- chối" tách riêng cho luồng pháp lý này). Khi đủ 2 xác nhận: áp dụng
-- author_display lên books NGAY trong cùng transaction.
create function public.confirm_author_name_agreement(p_agreement_id uuid, p_actor_id uuid)
returns public.author_name_agreements as $$
declare
  v_row public.author_name_agreements;
  v_order public.orders;
  v_ghostwriter_name text;
  v_customer_name text;
  v_book_title text;
  v_statement text;
begin
  select * into v_row from public.author_name_agreements where id = p_agreement_id for update;
  if v_row is null then raise exception 'Agreement % not found', p_agreement_id; end if;
  if v_row.ghostwriter_confirmed_at is not null and v_row.customer_confirmed_at is not null then
    raise exception 'Agreement already fully confirmed — immutable';
  end if;

  select nickname into v_ghostwriter_name from public.profiles where id = v_row.ghostwriter_id;
  select nickname into v_customer_name from public.profiles where id = v_row.customer_id;
  select title into v_book_title from public.books where id = v_row.book_id;

  if p_actor_id = v_row.ghostwriter_id and v_row.ghostwriter_confirmed_at is null then
    v_statement := case v_row.author_display_choice
      when 'customer_name' then format('Tôi, %s, đồng ý để %s đứng tên tác giả công khai đối với tác phẩm "%s".', v_ghostwriter_name, v_customer_name, v_book_title)
      else format('Tôi, %s, đồng ý cùng %s đứng tên đồng tác giả công khai đối với tác phẩm "%s".', v_ghostwriter_name, v_customer_name, v_book_title)
    end;
    update public.author_name_agreements
      set ghostwriter_confirmed_at = now(), ghostwriter_statement_text = v_statement
      where id = p_agreement_id returning * into v_row;
  elsif p_actor_id = v_row.customer_id and v_row.customer_confirmed_at is null then
    v_statement := case v_row.author_display_choice
      when 'customer_name' then format('Tôi, %s, đồng ý đứng tên tác giả công khai đối với tác phẩm "%s" do %s viết hộ.', v_customer_name, v_book_title, v_ghostwriter_name)
      else format('Tôi, %s, đồng ý cùng %s đứng tên đồng tác giả công khai đối với tác phẩm "%s".', v_customer_name, v_ghostwriter_name, v_book_title)
    end;
    update public.author_name_agreements
      set customer_confirmed_at = now(), customer_statement_text = v_statement
      where id = p_agreement_id returning * into v_row;
  else
    raise exception 'Actor % has no pending confirmation on this agreement', p_actor_id;
  end if;

  select * into v_order from public.orders where id = v_row.order_id;
  insert into public.order_events (order_id, event_type, actor_id)
  values (v_row.order_id, 'author_name_agreement_confirmed', p_actor_id);

  if v_row.ghostwriter_confirmed_at is not null and v_row.customer_confirmed_at is not null then
    update public.books set author_display = v_row.author_display_choice where id = v_row.book_id;
    insert into public.order_events (order_id, event_type, actor_id, payload)
    values (v_row.order_id, 'author_name_agreement_finalized', null, jsonb_build_object('choice', v_row.author_display_choice));
  end if;

  return v_row;
end;
$$ language plpgsql security definer;

revoke execute on function public.initiate_author_name_agreement from public, anon, authenticated;
revoke execute on function public.confirm_author_name_agreement from public, anon, authenticated;
grant execute on function public.initiate_author_name_agreement to service_role;
grant execute on function public.confirm_author_name_agreement to service_role;

-- attach_order_book() (Phase 3) cần set is_ghostwritten=true — CREATE OR
-- REPLACE lại, thân hàm y hệt bản gốc + 1 dòng update books thêm.
create or replace function public.attach_order_book(p_order_id uuid, p_actor_id uuid, p_book_id uuid)
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
  update public.books set is_ghostwritten = true where id = p_book_id;

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

COMMIT;

-- Notes:
-- 1. Cập nhật docs/supabase/schema.sql phần 3 (books thêm is_ghostwritten/
--    author_display) và phần 12 (section 12h: author_name_agreements + 2
--    hàm; CREATE OR REPLACE attach_order_book ghi đè bản ở phần 12e).
-- 2. Cập nhật src/lib/supabase/types.ts.
-- 3. Cập nhật src/app/ket-noi/page.tsx — lọc is_ghostwritten=false mặc
--    định cho "Truyện chữ" của ghostwriter, cộng thêm nhánh hiển thị dưới
--    hồ sơ CUSTOMER khi customer_profile_visible=true (author_display
--    'customer_name'/'co_authorship') — xem hướng dẫn trong báo cáo tiến
--    độ, KHÔNG lặp lại ở đây.
-- 4. Cập nhật src/lib/orders/service-listing-service.ts fetchAutoSamples()
--    — bỏ TODO, thêm .eq("is_ghostwritten", false) cho nhánh ghostwriting.
-- 5. CHƯA cập nhật rankings/recommend_books để loại is_ghostwritten — nằm
--    ngoài yêu cầu bổ sung #2 (chỉ nói Kết nối), để việc riêng nếu cần.
