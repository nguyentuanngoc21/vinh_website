-- =======================================================================
-- Baseline 08 — Audio  (08_audio.sql)
-- =======================================================================
-- Phạm vi: audio_narrations + view công khai, tiến độ nghe, bình luận, liên
-- kết chương ↔ audio, bucket audio-narrations, trạng thái bảo hộ nội dung
-- (dùng chung Thiết kế + Audio).
--
-- Đối tượng tạo trong file này:
--   Bảng:
--     audio_narrations, audio_progress, audio_comments, audio_comment_likes,
--     chapter_audio_links, content_protection_status
--   View:
--     public_audio_narrations, audio_comment_like_counts
--   Hàm:
--     increment_audio_play_count, link_audio_to_chapter,
--     regenerate_audio_share_token
--   Storage bucket:
--     audio-narrations
--
-- Gộp từ migration (migrations/archive/):
--   20260901_add_audio_narration_hub_metadata.sql,
--   20260907_add_content_protection_status.sql,
--   20260917_add_design_audio_comments.sql
--   + migrations/20260929_add_hot_path_indexes.sql (phần của file này)
--
-- Phụ thuộc (phải chạy trước): 01_extensions_and_accounts.sql,
--   02_books_and_chapters.sql, 07_design.sql
-- Chỉ dùng cho project MỚI, TRỐNG — xem migrations/baseline/README.md.
-- =======================================================================

-- --- Kho Audio ---
create table public.audio_narrations (
  id uuid primary key default gen_random_uuid(),
  narrator_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  audio_url text not null, -- path trong bucket 'audio-narrations'
  duration_seconds integer,
  -- Người nghe chọn ở /audio/new; với audio gắn vào chương sách qua
  -- chapter_audio_links, app tự điền lại từ genre của sách đó thay vì hỏi
  -- 2 lần — xem src/lib/audio/get-audio-catalog.ts. Cùng danh sách giá trị
  -- với books.genre (không dùng chung constraint vì khác bảng).
  genre text,
  play_count integer not null default 0,
  source public.content_source not null default 'independent',
  share_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  constraint audio_narrations_play_count_check check (play_count >= 0),
  constraint audio_narrations_genre_check
    check (genre is null or genre in (
      'Linh dị', 'Cổ tích & Thần thoại', 'Dã sử', 'Trinh thám',
      'Tâm lý - tội phạm', 'Tình cảm', 'Đời sống - Xã hội',
      'Khoa học viễn tưởng', 'Tiên hiệp/ kiếm hiệp', 'Kỳ ảo'
    ))
);

alter table public.audio_narrations enable row level security;

create policy "narrators view their own audio narrations (incl. share token)"
  on public.audio_narrations for select
  using (auth.uid() = narrator_id);

create policy "narrators insert their own audio narrations"
  on public.audio_narrations for insert
  with check (auth.uid() = narrator_id);

create policy "narrators update their own audio narrations"
  on public.audio_narrations for update
  using (auth.uid() = narrator_id);

create policy "narrators delete their own audio narrations"
  on public.audio_narrations for delete
  using (auth.uid() = narrator_id);

create view public.public_audio_narrations as
  select id, narrator_id, title, audio_url, duration_seconds, source, created_at, genre, play_count
  from public.audio_narrations;

-- security definer: tăng play_count an toàn dưới race condition, không
-- cho client tự set bằng bất kỳ số nào — chỉ +1 đúng 1 bản ghi/lần gọi.
-- Không yêu cầu đăng nhập, giống increment_book_view_count.
create function public.increment_audio_play_count(p_audio_narration_id uuid)
returns void as $$
  update public.audio_narrations set play_count = play_count + 1 where id = p_audio_narration_id;
$$ language sql security definer set search_path = public;

grant execute on function public.increment_audio_play_count(uuid) to anon, authenticated;

-- --- "Đang nghe dở" cho Audio hub — cùng shape/lý do với book_progress ở
-- phần 8, nhưng cho audio_narrations thay vì books/chapters: 1 dòng/(user,
-- audio), upsert khi lưu (không phải log append-only). Powers "Audio đang
-- nghe" (dòng updated_at mới nhất) và "Nghe tiếp" (vài dòng kế tiếp) trên
-- /audio bằng dữ liệu thật — không có dòng nào thì không hiện gì, không
-- bịa số. Xem migrations/archive/20260901_add_audio_narration_hub_metadata.sql.
-- Đặt ở đây (sau audio_narrations) thay vì cạnh book_progress vì FK. ---
create table public.audio_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  audio_narration_id uuid not null references public.audio_narrations (id) on delete cascade,
  position_seconds integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, audio_narration_id),
  constraint audio_progress_position_seconds_check check (position_seconds >= 0)
);

alter table public.audio_progress enable row level security;

create policy "users manage their own audio progress"
  on public.audio_progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- --- Bình luận cho 1 bản thu audio — cùng cấu trúc design_comments ở
-- trên, khác bảng gốc tham chiếu. Xem
-- migrations/archive/20260917_add_design_audio_comments.sql. ---
create table public.audio_comments (
  id uuid primary key default gen_random_uuid(),
  audio_narration_id uuid not null references public.audio_narrations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null check (char_length(trim(content)) > 0),
  parent_comment_id uuid references public.audio_comments (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index audio_comments_audio_narration_id_idx on public.audio_comments (audio_narration_id);
create index audio_comments_parent_idx on public.audio_comments (parent_comment_id) where parent_comment_id is not null;

alter table public.audio_comments enable row level security;

create policy "audio comments are publicly readable"
  on public.audio_comments for select
  using (true);

create policy "users write their own audio comments"
  on public.audio_comments for insert
  with check (auth.uid() = user_id);

create policy "users delete their own audio comments"
  on public.audio_comments for delete
  using (auth.uid() = user_id);

create policy "admins moderate audio comments"
  on public.audio_comments for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

create table public.audio_comment_likes (
  comment_id uuid not null references public.audio_comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index audio_comment_likes_comment_id_idx on public.audio_comment_likes (comment_id);

alter table public.audio_comment_likes enable row level security;

create policy "users manage their own audio comment likes"
  on public.audio_comment_likes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create view public.audio_comment_like_counts as
  select comment_id, count(*)::integer as like_count
  from public.audio_comment_likes
  group by comment_id;

-- --- Liên kết chương ↔ audio (nhiều-nhiều) ---
-- Bảng này TỰ NÓ không nhạy cảm (không có share_token), nên select công
-- khai được — vấn đề nằm ở việc TẠO dòng mới, không phải xem dòng đã có.
create table public.chapter_audio_links (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  audio_narration_id uuid not null references public.audio_narrations (id) on delete cascade,
  linked_by uuid not null references auth.users (id),
  linked_at timestamptz not null default now(),
  unique (chapter_id, audio_narration_id)
);

alter table public.chapter_audio_links enable row level security;

create policy "audio links are publicly viewable"
  on public.chapter_audio_links for select
  using (true);

-- KHÔNG có policy insert nào ở đây — cố ý. Tạo liên kết chỉ được phép
-- qua hàm link_audio_to_chapter() bên dưới, hàm đó mới là nơi kiểm tra
-- share_token. Nếu chỉ dùng RLS "book author sở hữu chapter" như bản
-- trước, tác giả copy được id công khai là link được luôn — không kiểm
-- tra được liệu diễn viên có thật sự đồng ý hay không.

-- Gỡ liên kết thì không cần xin phép diễn viên (đây là quyền của tác giả
-- với truyện của họ), nên vẫn cho phép DELETE trực tiếp.
create policy "book authors unlink audio from their own chapters"
  on public.chapter_audio_links for delete
  using (exists (
    select 1 from public.chapters c
    join public.books b on b.id = c.book_id
    where c.id = chapter_id and b.author_id = auth.uid()
  ));

-- Hàm DUY NHẤT được phép tạo liên kết — kiểm tra CẢ 2 điều kiện:
-- (1) người gọi sở hữu sách chứa chương này, VÀ
-- (2) share_token khớp đúng với audio_narration đó (chứng minh chủ sở
--     hữu audio đã chủ động chia sẻ link, không phải tác giả tự đoán id).
create function public.link_audio_to_chapter(
  p_chapter_id uuid,
  p_audio_narration_id uuid,
  p_share_token text
) returns public.chapter_audio_links as $$
declare
  v_row public.chapter_audio_links;
begin
  if not exists (
    select 1 from public.chapters c
    join public.books b on b.id = c.book_id
    where c.id = p_chapter_id and b.author_id = auth.uid()
  ) then
    raise exception 'Bạn không sở hữu sách chứa chương này';
  end if;

  if not exists (
    select 1 from public.audio_narrations
    where id = p_audio_narration_id and share_token = p_share_token
  ) then
    raise exception 'Share link không đúng hoặc đã bị thu hồi';
  end if;

  insert into public.chapter_audio_links (chapter_id, audio_narration_id, linked_by)
  values (p_chapter_id, p_audio_narration_id, auth.uid())
  returning * into v_row;

  return v_row;
end;
$$ language plpgsql security definer;

-- Cho diễn viên "thu hồi link" nếu lỡ chia sẻ nhầm, hoặc tác giả không
-- còn hợp tác nữa — sinh token mới, mọi link cũ vẫn hiển thị bình thường
-- (link đã tạo không tự mất) nhưng token cũ không dùng để link thêm được
-- nữa. Giống nút "Get new link" của Google Drive.
create function public.regenerate_audio_share_token(p_audio_narration_id uuid)
returns text as $$
declare
  v_new_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  update public.audio_narrations
    set share_token = v_new_token
    where id = p_audio_narration_id and narrator_id = auth.uid();
  if not found then
    raise exception 'Không tìm thấy, hoặc bạn không phải chủ sở hữu';
  end if;
  return v_new_token;
end;
$$ language plpgsql security definer;
insert into storage.buckets (id, name, public) values ('audio-narrations', 'audio-narrations', true)
  on conflict (id) do nothing;

create policy "audio narrations are publicly readable"
  on storage.objects for select
  using (bucket_id = 'audio-narrations');

create policy "narrators upload their own audio files"
  on storage.objects for insert
  with check (
    bucket_id = 'audio-narrations'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "narrators update their own audio files"
  on storage.objects for update
  using (
    bucket_id = 'audio-narrations'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- --- Cách app dùng (gợi ý luồng, không phải SQL bắt buộc) ---
--
-- Diễn viên upload độc lập, lấy link để chia sẻ:
--   const { data } = await supabase.from('audio_narrations')
--     .insert({ narrator_id: user.id, title, audio_url, duration_seconds })
--     .select('id, share_token').single();
--   → hiện cho họ: vinh.vn/lien-ket-audio?id=${data.id}&token=${data.share_token}
--   → họ tự copy link này gửi cho tác giả (kênh nào cũng được — chat, email...).
--
-- Tác giả dán link (app tự parse id + token từ URL họ paste vào):
--   const { data, error } = await supabase.rpc('link_audio_to_chapter', {
--     p_chapter_id: chapterId,
--     p_audio_narration_id: parsedId,
--     p_share_token: parsedToken,
--   });
--   // error nếu token sai/đã bị thu hồi, hoặc tác giả không sở hữu chương này.
--
-- Tác giả tự upload từ máy (không qua ai khác) — app làm 2 bước liền
-- nhau trong 1 lần bấm, TỰ CÓ token vì vừa tạo xong nên không cần ai gửi:
--   const { data: item } = await supabase.from('audio_narrations')
--     .insert({ narrator_id: user.id, title, audio_url, source: 'story_upload' })
--     .select('id, share_token').single();
--   await supabase.rpc('link_audio_to_chapter', {
--     p_chapter_id: chapterId,
--     p_audio_narration_id: item.id,
--     p_share_token: item.share_token, // họ vừa tạo, tự có sẵn, không cần dán tay
--   });
--
-- Ảnh bìa dùng đúng logic tương tự với link_cover_to_book().
--
-- Lấy danh sách audio đã link cho 1 chương (để hiện "chọn giọng đọc") —
-- LƯU Ý: join qua view public_audio_narrations, không phải bảng gốc, vì
-- bảng gốc chỉ chủ sở hữu mới select được:
--   select an.*, p.nickname as narrator_name, p.avatar_url
--   from public.chapter_audio_links cal
--   join public.public_audio_narrations an on an.id = cal.audio_narration_id
--   join public.author_public_profiles p on p.id = an.narrator_id
--   where cal.chapter_id = :chapter_id
--   order by cal.linked_at asc;

-- =======================================================================
-- Nếu bạn ĐÃ CHẠY 1 trong 2 bản audio_narrations trước đó (bản có cột
-- chapter_id/status, HOẶC bản không-token vừa rồi) — chạy dọn dẹp sau
-- TRƯỚC khi chạy phần 9 ở trên. An toàn dù bản nào bạn từng chạy, vì
-- toàn bộ dùng IF EXISTS:
--
--   drop trigger if exists enforce_narration_column_ownership on public.audio_narrations;
--   drop trigger if exists enforce_cover_via_function on public.books;
--   drop function if exists public.enforce_narration_column_ownership cascade;
--   drop function if exists public.prevent_direct_cover_change cascade;
--   drop function if exists public.link_audio_to_chapter cascade;
--   drop function if exists public.link_cover_to_book cascade;
--   drop function if exists public.regenerate_audio_share_token cascade;
--   drop function if exists public.regenerate_design_share_token cascade;
--   drop view if exists public.public_audio_narrations cascade;
--   drop view if exists public.public_design_items cascade;
--   drop table if exists public.chapter_audio_links cascade;
--   drop table if exists public.audio_narrations cascade;
--   drop table if exists public.design_items cascade;
--   drop table if exists public.design_albums cascade;
--   drop type if exists public.narration_status cascade;
--   alter table public.books drop column if exists cover_design_item_id;
--   -- book-covers bucket cũ (nếu có) không còn dùng, để nguyên vô hại
--   -- hoặc xoá thủ công qua Dashboard → Storage nếu muốn dọn sạch.
-- =======================================================================


-- --- Trạng thái bảo hộ bản quyền/"không cho AI huấn luyện" thật cho nội
-- dung công khai (ảnh Thiết kế, audio) — xem
-- migrations/archive/20260907_add_content_protection_status.sql để biết vì sao
-- "chapter" (truyện chữ) không có dòng riêng ở bảng này. ---
create table public.content_protection_status (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('audio', 'design')),
  content_id uuid not null,
  protected boolean not null default true,
  method text not null,
  applied_at timestamptz not null default now(),
  unique (content_type, content_id)
);

alter table public.content_protection_status enable row level security;

create policy "admins view content protection status"
  on public.content_protection_status for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  ));

create index content_protection_status_type_idx
  on public.content_protection_status (content_type);
create index if not exists audio_narrations_narrator_created_idx
  on public.audio_narrations (narrator_id, created_at desc);
