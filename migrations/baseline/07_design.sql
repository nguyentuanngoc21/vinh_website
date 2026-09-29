-- =======================================================================
-- Baseline 07 — Thiết kế (ảnh)  (07_design.sql)
-- =======================================================================
-- Phạm vi: design_items + view công khai, lượt thích, album, bình luận, ảnh
-- bìa sách (books.cover_design_item_id + link_cover_to_book), bucket
-- design-images.
--
-- Đối tượng tạo trong file này:
--   Bảng:
--     design_items, design_item_likes, design_albums, design_comments,
--     design_comment_likes
--   View:
--     design_item_like_counts, public_design_items,
--     design_comment_like_counts
--   Hàm:
--     increment_design_item_share_count, prevent_direct_cover_change,
--     link_cover_to_book, regenerate_design_share_token
--   Kiểu (enum):
--     content_source
--   Storage bucket:
--     design-images
--   Thêm cột vào bảng của file trước:
--     books.cover_design_item_id
--
-- Gộp từ migration (migrations/archive/):
--   20260901_add_design_item_gallery_metadata.sql,
--   20260917_add_design_audio_comments.sql,
--   20260919_add_design_albums_and_multi_upload.sql,
--   20260921_add_design_item_publish_state.sql
--   + migrations/20260929_add_hot_path_indexes.sql (phần của file này)
--
-- Phụ thuộc (phải chạy trước): 01_extensions_and_accounts.sql,
--   02_books_and_chapters.sql
-- Chỉ dùng cho project MỚI, TRỐNG — xem migrations/baseline/README.md.
-- =======================================================================

-- ---------------------------------------------------------------------
-- 9. Audio & Thiết kế — kho độc lập, liên kết vào truyện qua SHARE LINK
-- ---------------------------------------------------------------------
-- Mô hình (bản sửa — thêm cơ chế share-token, giống Google Drive):
--
--   • Diễn viên lồng tiếng / họa sĩ upload TỰ DO vào kho Audio / Thiết kế
--     — độc lập, không cần thuộc về chương/truyện nào cả lúc tạo.
--   • Kho này CÓ trang duyệt công khai (ai cũng xem/nghe được, giống
--     browse file "chỉ xem" trên Drive) — nhưng xem công khai KHÔNG đồng
--     nghĩa với việc ai cũng link được vào truyện của họ.
--   • Muốn link, tác giả cần đúng "share link" — một chuỗi bí mật
--     (`share_token`) do chủ sở hữu tạo ra và tự tay gửi cho tác giả sau
--     khi thoả thuận ngoài nền tảng. `share_token` KHÔNG xuất hiện ở
--     trang duyệt công khai — chỉ chủ sở hữu xem được token của chính
--     mình để copy đi chia sẻ, y hệt nút "Get link" của Google Drive.
--   • Copy id/URL từ vị trí người nghe/xem (trang duyệt công khai) sẽ
--     KHÔNG link được — vì hàm liên kết bắt buộc kiểm tra token đúng,
--     không chỉ id đúng.
--   • Tác giả tự upload từ máy (không qua ai khác): app tạo hộ 1 dòng
--     audio_narrations/design_items với narrator_id/illustrator_id =
--     chính tác giả, lấy luôn token vừa tạo (họ đang sở hữu, không cần ai
--     cho phép) để tự link cho mình trong cùng 1 thao tác.


create type public.content_source as enum ('independent', 'story_upload');

-- --- Kho Thiết kế (ảnh bìa, minh hoạ) ---
create table public.design_items (
  id uuid primary key default gen_random_uuid(),
  illustrator_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  image_url text not null, -- path trong bucket 'design-images'
  -- Nullable: ảnh bìa tạo tự động qua luồng story_upload không hỏi họa sĩ
  -- điền gì — chỉ nội dung đăng độc lập ở /thiet-ke/new mới bắt buộc chọn.
  -- Xem migrations/archive/20260901_add_design_item_gallery_metadata.sql.
  category text,
  description text,
  share_count integer not null default 0,
  source public.content_source not null default 'independent',
  -- Chuỗi bí mật để chia sẻ quyền link — 48 ký tự hex (192 bit), không
  -- đoán được. Đừng lộ cột này ra bất kỳ view/API công khai nào.
  share_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  constraint design_items_share_count_check check (share_count >= 0),
  constraint design_items_category_check
    check (category is null or category in ('bia_truyen', 'minh_hoa', 'fan_art', 'poster_audio'))
);

alter table public.design_items enable row level security;

-- CHỈ chủ sở hữu xem được toàn bộ dòng (bao gồm share_token, để họ copy
-- đi chia sẻ) — KHÔNG có policy "public select" trên bảng gốc này.
create policy "illustrators view their own design items (incl. share token)"
  on public.design_items for select
  using (auth.uid() = illustrator_id);

create policy "illustrators insert their own design items"
  on public.design_items for insert
  with check (auth.uid() = illustrator_id);

create policy "illustrators update their own design items"
  on public.design_items for update
  using (auth.uid() = illustrator_id);

create policy "illustrators delete their own design items"
  on public.design_items for delete
  using (auth.uid() = illustrator_id);

-- View công khai public_design_items: đã chuyển xuống ngay sau khi
-- design_items có đủ album_id/alt_text/deleted_at/published_at (bên dưới).

-- Bảng riêng cho lượt thích (toggle, 1 dòng/(tác phẩm, người thích)) —
-- cùng pattern "aggregate qua view riêng, bảng gốc owner-only RLS" như
-- chapter_votes/chapter_vote_counts. Xem
-- migrations/archive/20260901_add_design_item_gallery_metadata.sql.
create table public.design_item_likes (
  design_item_id uuid not null references public.design_items (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (design_item_id, user_id)
);

create index design_item_likes_design_item_id_idx on public.design_item_likes (design_item_id);

alter table public.design_item_likes enable row level security;

create policy "users manage their own design item likes"
  on public.design_item_likes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create view public.design_item_like_counts as
  select design_item_id, count(*)::integer as like_count
  from public.design_item_likes
  group by design_item_id;

-- --- Albums ("board") — long-lived grouping of design_items, shared name
-- + art_style across every item in it (xem
-- migrations/archive/20260919_add_design_albums_and_multi_upload.sql). Hiện ở cả
-- form đăng /thiet-ke/new VÀ trang duyệt công khai /thiet-ke (khác nhãn
-- nội bộ chỉ dùng lúc đăng) — không có cột bí mật nào nên select công khai
-- thẳng trên bảng gốc, không cần view public_* riêng như design_items. ---
create table public.design_albums (
  id uuid primary key default gen_random_uuid(),
  illustrator_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  -- 10 giá trị lấy từ cột "Phong cách nghệ thuật" của mega-menu
  -- (nav-strip-links.tsx) — xem src/lib/design/art-styles.ts.
  art_style text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint design_albums_art_style_check
    check (art_style in (
      'anime_manga', 'ban_ta_thuc', 'ta_thuc', 'chibi', 'flat_vector',
      'co_trang', 'dark_fantasy', 'pixel_art', 'painterly', 'render_3d'
    ))
);

create index design_albums_illustrator_id_idx on public.design_albums (illustrator_id);

alter table public.design_albums enable row level security;

create policy "anyone can view design albums"
  on public.design_albums for select
  using (true);

create policy "illustrators insert their own design albums"
  on public.design_albums for insert
  with check (auth.uid() = illustrator_id);

create policy "illustrators update their own design albums"
  on public.design_albums for update
  using (auth.uid() = illustrator_id);

create policy "illustrators delete their own design albums"
  on public.design_albums for delete
  using (auth.uid() = illustrator_id);

-- --- design_items: album_id/alt_text/deleted_at (mở rộng theo cùng
-- migration ở trên) — category_check mở rộng 4 → 14 giá trị, CỘNG THÊM
-- không remap: 'bia_truyen'/'fan_art' giữ nguyên slug (chỉ đổi nhãn hiện ở
-- UI thành "Bìa truyện/sách"/"Fanart"), 'minh_hoa'/'poster_audio' giữ
-- nguyên không đổi, 10 slug mới cho các mục mega-menu chưa có tương đương.
-- Xem src/lib/design/get-design-gallery.ts (DESIGN_CATEGORIES). ---
alter table public.design_items
  add column album_id uuid references public.design_albums (id) on delete set null,
  add column alt_text text,
  add column deleted_at timestamptz;

create index design_items_album_id_idx on public.design_items (album_id) where album_id is not null;

alter table public.design_items drop constraint design_items_category_check;
alter table public.design_items
  add constraint design_items_category_check
  check (category is null or category in (
    'bia_truyen', 'nhan_vat_don', 'nhan_vat_nhom', 'vu_khi_trang_bi',
    'boi_canh_phong_canh', 'linh_vat', 'trang_phuc', 'chibi_deform',
    'emote_pack', 'logo_icon', 'fan_art', 'tranh_doi', 'minh_hoa', 'poster_audio'
  ));

-- Cột-cấp GRANT — policy "illustrators update their own design items" ở
-- trên chỉ chặn theo HÀNG, không theo CỘT, nên nếu không có REVOKE/GRANT
-- này, client tự PATCH thẳng share_token/image_url qua Supabase REST API
-- được, bỏ qua regenerate_design_share_token() và route upload. Cùng
-- pattern books (20260825_restrict_books_column_grants.sql).
revoke update on public.design_items from authenticated;
grant update (title, description, category, alt_text, album_id, deleted_at) on public.design_items to authenticated;

-- --- design_items: published_at (xem
-- migrations/archive/20260921_add_design_item_publish_state.sql) — null = draft
-- riêng của họa sĩ (chưa hiện qua public_design_items bên dưới), có giá trị
-- = đã công khai. POST /api/design (đăng ảnh) không set cột này, mặc
-- định NULL; POST /api/design/publish (bấm "Hoàn tất") set = now().
-- Ngoại lệ: ảnh bìa tác giả tự tải lên (POST
-- /api/authoring/books/[bookId]/cover) set published_at ngay lúc tạo — xem
-- migrations/20260929_publish_book_cover_design_items.sql. ---
alter table public.design_items
  add column published_at timestamptz;

grant update (published_at) on public.design_items to authenticated;

-- View công khai cho trang "duyệt kho Thiết kế" — CỐ Ý không có
-- share_token. Đây là view app dùng để hiện danh sách công khai. Lọc
-- deleted_at is null ngay ở đây (xem
-- migrations/archive/20260919_add_design_albums_and_multi_upload.sql) — MỌI nơi
-- đọc công khai (gallery/search/comments/likes) đi qua view này, không
-- đọc bảng gốc, nên chỉ cần lọc 1 chỗ. Đặt sau các ALTER ở trên vì view
-- đọc album_id/alt_text/deleted_at/published_at.
create view public.public_design_items as
  select id, illustrator_id, title, image_url, source, created_at, category, description, share_count,
         album_id, alt_text, published_at
  from public.design_items
  where deleted_at is null and published_at is not null;

-- security definer: tăng share_count an toàn dưới race condition, không
-- cho client tự set bằng bất kỳ số nào — chỉ +1 đúng 1 tác phẩm/lần gọi.
-- Không yêu cầu đăng nhập, giống increment_book_view_count.
create function public.increment_design_item_share_count(p_design_item_id uuid)
returns void as $$
  update public.design_items set share_count = share_count + 1 where id = p_design_item_id;
$$ language sql security definer set search_path = public;

grant execute on function public.increment_design_item_share_count(uuid) to anon, authenticated;

-- --- Bình luận cho 1 tác phẩm thiết kế — mirror anchored_comments nhưng bỏ
-- paragraph_index/char_start/char_end/quest_id (không có khái niệm "đoạn
-- văn" hay "quest neo comment" ở đây). Reply 1 cấp duy nhất, enforce ở API
-- route, không phải CHECK DB. Xem migrations/archive/20260917_add_design_audio_comments.sql. ---
create table public.design_comments (
  id uuid primary key default gen_random_uuid(),
  design_item_id uuid not null references public.design_items (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null check (char_length(trim(content)) > 0),
  parent_comment_id uuid references public.design_comments (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index design_comments_design_item_id_idx on public.design_comments (design_item_id);
create index design_comments_parent_idx on public.design_comments (parent_comment_id) where parent_comment_id is not null;

alter table public.design_comments enable row level security;

create policy "design comments are publicly readable"
  on public.design_comments for select
  using (true);

create policy "users write their own design comments"
  on public.design_comments for insert
  with check (auth.uid() = user_id);

create policy "users delete their own design comments"
  on public.design_comments for delete
  using (auth.uid() = user_id);

create policy "admins moderate design comments"
  on public.design_comments for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- Toggle thích 1 bình luận — cùng pattern design_item_likes (aggregate qua
-- view riêng, bảng gốc owner-only RLS).
create table public.design_comment_likes (
  comment_id uuid not null references public.design_comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index design_comment_likes_comment_id_idx on public.design_comment_likes (comment_id);

alter table public.design_comment_likes enable row level security;

create policy "users manage their own design comment likes"
  on public.design_comment_likes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create view public.design_comment_like_counts as
  select comment_id, count(*)::integer as like_count
  from public.design_comment_likes
  group by comment_id;

-- --- Ảnh bìa sách — cùng cơ chế token, nhưng gắn thẳng vào cột
-- books.cover_design_item_id thay vì 1 bảng liên kết riêng (1 sách chỉ
-- có 1 bìa tại 1 thời điểm, khác audio có thể nhiều bản cùng lúc). ---
alter table public.books
  add column cover_design_item_id uuid references public.design_items (id) on delete set null;

-- Chặn việc UPDATE trực tiếp cột này qua policy "authors update their own
-- books" ở phần 3 (policy đó cho sửa TOÀN BỘ cột, không phân biệt được
-- "sửa title" với "sửa cover" — RLS không làm được điều này). Trigger này
-- chặn khi giá trị mới KHÁC NULL và bị đổi trực tiếp — cho phép xoá bìa
-- (set về null) thoải mái vì việc đó không cần ai cho phép, chỉ chặn việc
-- ĐẶT bìa mới ngoài hàm link_cover_to_book().
create function public.prevent_direct_cover_change()
returns trigger as $$
begin
  if new.cover_design_item_id is distinct from old.cover_design_item_id
     and new.cover_design_item_id is not null
     and coalesce(current_setting('vinh.allow_cover_change', true), 'false') <> 'true' then
    raise exception 'Dùng link_cover_to_book() để đổi bìa — không update trực tiếp được';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger enforce_cover_via_function
  before update on public.books
  for each row execute function public.prevent_direct_cover_change();

create function public.link_cover_to_book(
  p_book_id uuid,
  p_design_item_id uuid,
  p_share_token text
) returns public.books as $$
declare
  v_row public.books;
begin
  if not exists (select 1 from public.books where id = p_book_id and author_id = auth.uid()) then
    raise exception 'Bạn không sở hữu sách này';
  end if;

  if not exists (
    select 1 from public.design_items
    where id = p_design_item_id and share_token = p_share_token
  ) then
    raise exception 'Share link không đúng hoặc đã bị thu hồi';
  end if;

  -- Cờ tạm trong transaction hiện tại (true ở tham số cuối = local, tự
  -- hết hiệu lực khi transaction kết thúc) — cho phép chính update ngay
  -- dưới đây đi qua được trigger enforce_cover_via_function ở trên.
  perform set_config('vinh.allow_cover_change', 'true', true);

  update public.books set cover_design_item_id = p_design_item_id
    where id = p_book_id
    returning * into v_row;

  return v_row;
end;
$$ language plpgsql security definer;

create function public.regenerate_design_share_token(p_design_item_id uuid)
returns text as $$
declare
  v_new_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  update public.design_items
    set share_token = v_new_token
    where id = p_design_item_id and illustrator_id = auth.uid();
  if not found then
    raise exception 'Không tìm thấy, hoặc bạn không phải chủ sở hữu';
  end if;
  return v_new_token;
end;
$$ language plpgsql security definer;

-- --- Storage buckets ---
insert into storage.buckets (id, name, public) values ('design-images', 'design-images', true)
  on conflict (id) do nothing;

create policy "design images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'design-images');

create policy "illustrators upload their own design images"
  on storage.objects for insert
  with check (
    bucket_id = 'design-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "illustrators update their own design images"
  on storage.objects for update
  using (
    bucket_id = 'design-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create index if not exists design_items_illustrator_created_idx
  on public.design_items (illustrator_id, created_at desc);
