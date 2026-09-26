# Báo Cáo Khảo Sát Kiến Trúc & Kế Hoạch Triển Khai Hệ Thống Cuộc Thi (Contest Engine)

> **Dự án**: Nền tảng Vịnh (Vietnamese Web Novel / Audio / Illustration Platform)
> **Tài liệu**: Khảo sát hiện trạng, Data Model, quy tắc nghiệp vụ & kế hoạch triển khai Writing Contest System
> **Bản sửa đổi**: 25/09/2026 — đối chiếu lại với `docs/supabase/schema.sql` và code thật (xem mục XVIII "Thay đổi so với bản trước")
> **Trạng thái**: Bản thiết kế — **các quyết định D1–D12 đã chốt ngày 25/09/2026 (mục XIV)**; còn các câu hỏi mở ở XIX.4 trước Slice 1.1

---

## I. NGUYÊN TẮC CỐT LÕI

1. **Không có thực thể "Contest Book"**
   - `public.books` là nguồn chân lý duy nhất cho tác phẩm.
   - Quan hệ nhiều–nhiều qua bảng trung gian:
     ```
     Contest (1) ── (N) ContestSubmission (N) ── (1) Book
     ```
   - Quy chế từng cuộc thi (`contests.eligibility_rules`) quyết định sách có được nộp, có được đồng thời dự thi cuộc thi khác, có được nộp nếu từng dự thi trước đó hay không.
   - **Không** thêm `books.is_contest_entry`. Trạng thái "đang/đã dự thi" luôn suy ra (derive):
     ```sql
     exists (
       select 1 from public.contest_submissions cs
       join public.contests c on c.id = cs.contest_id
       where cs.book_id = books.id
         and cs.status in ('submitted', 'eligible', 'shortlisted')
         and c.status not in ('results', 'archived')
     )
     ```

2. **Tương thích ngược tuyệt đối**
   - Không đổi ID, không clone, không xoá `books` / `chapters` / `characters`.
   - Contest là lớp nghiệp vụ mới nằm trên Book/Chapter. Phase 1 **không sửa cột nào** của bảng hiện có — chỉ thêm bảng, hàm, index mới, và **hai trigger mới trên bảng hiện có**:
     - trên `chapters`: chặn đặt giá trong thời gian dự thi (D8, IV.5) — chỉ từ chối ghi giá > 0 cho sách đang dự thi;
     - trên `books`: chặn tắt độc quyền khi sách đang dự thi một cuộc thi yêu cầu độc quyền (D11, IV.6) — chỉ từ chối `is_exclusive` `true → false` trong trường hợp đó.

     Mọi đường ghi khác giữ nguyên hành vi.
   - Không được làm vỡ: `anchored_comments`, `highlights`, `reading_lists`, `reading_history`, `book_progress`, `reading_sessions`, `purchase_transactions`, `chapter_audio_links`, `audio_narrations`, `characters`, `chapter_characters`, `character_trope_votes`, `author_follows`, quest/achievement, moderation.

3. **Server quyết định mọi thứ**
   - Không tin `author_id`, `contest_id`, `status`, `score`, `eligibility` từ client.
   - Danh tính lấy từ `getUserContext(request)` (`src/lib/mobile/request-context.ts` — hỗ trợ cả cookie web lẫn Bearer token mobile, để app mobile dùng lại được API) hoặc `getAuthedUserId()` / `getAuthedAdminId()` (`src/lib/wallet/session.ts`).
   - Mọi ghi dữ liệu contest đi qua route handler dùng **service-role client** (đúng mô hình hiện tại của dự án). RLS là lớp phòng thủ thứ hai: **không cấp policy INSERT/UPDATE/DELETE cho `authenticated`** trên các bảng contest.
   - Frontend chỉ render theo **capability** server trả về (mục VI), không tự suy vòng đời từ deadline.

---

## II. KẾT QUẢ KHẢO SÁT HIỆN TRẠNG (đã đối chiếu schema/code)

### 1. Sách & Chương
| Bảng | Cột liên quan | Ghi chú cho Contest |
|---|---|---|
| `books` | `author_id`, `published`, `deleted_at`, `removed_by`, `removed_reason_group`, `removed_reason_detail`, `genre text`, `tags text[]`, `is_exclusive` (default `true`), `view_count`, `content_purged_at` | **Không có `books.removed_at`.** Admin gỡ sách = set `deleted_at` + `removed_by` (`src/app/api/admin/books/[bookId]/route.ts`). "Sách còn hiển thị" = `published and deleted_at is null`. |
| `chapters` | `content text`, `order_index`, `published`, `is_last_chapter`, `price` (0 = miễn phí), `audio_price` (0 = miễn phí), `removed_at`, `removed_by`, `content_purged_at` | **Không có cột `word_count`.** Số từ phải tính từ `content` (xem IV.3). Chương đã xuất bản không xoá được (policy DELETE mới chỉ cho chương nháp); thứ tự đổi qua `reorder_book_chapters()`. |

- Cron `purge-deleted-content` (hằng ngày) **không xoá hàng**, chỉ rỗng hoá `content`/cover/synopsis của sách/chương bị xoá/gỡ quá 30 ngày → `ON DELETE RESTRICT` từ bảng contest không chặn cron này. Nhưng nếu contest lưu bản chụp nội dung (snapshot), cron **phải dọn cả snapshot** (xem V.4).
- Xoá `auth.users` hiện chỉ xảy ra với tài khoản chưa xác nhận (không thể có bài dự thi). Nếu sau này có chức năng xoá tài khoản, phải xử lý `contest_submissions.author_id` (RESTRICT).

### 2. Auth & Roles
- 2 session song song (`vinh_session` HMAC + `sb-*` Supabase) — giữ nguyên.
- Role: `user`, `admin`, `super_admin`. Kiểm tra admin luôn dùng `role in ('admin', 'super_admin')`.
- `src/proxy.ts` đã guard `/author/:path*` → `/author/contests` **không cần sửa proxy**.
- Admin UI dùng route tiếng Việt (`/admin/nguoi-dung`, `/admin/noi-dung`, `/admin/tranh-chap`) → trang quản trị cuộc thi: `/admin/cuoc-thi`.

### 3. Ghi nhận đọc & tương tác
| Nguồn | Nội dung | Dùng cho |
|---|---|---|
| `record_chapter_read()` → `reading_history` | Dedupe `(user_id, chapter_id, ngày)`; chỉ `service_role` gọi được. Được gọi từ `recordReadingProgress()` (`src/lib/reading/record-progress.ts`, dùng chung web + mobile) khi người đọc tới **đoạn cuối** chương, sau khi server kiểm quyền đọc (chương đã xuất bản, chưa gỡ, chương trả phí phải đã mua) | "Đã đọc hết chương" (điều kiện vote D5), valid reader, return reader, completion |
| `reading_sessions` | `start_time`, `end_time`, `drop_off_offset` theo chương | Meaningful read, drop-off, continue-to-next-chapter |
| `anchored_comments` | Bình luận theo chương, có `parent_comment_id` | Unique commenter |
| `chapter_votes` | Unique `(chapter_id, user_id)` | **Không dùng** cho vote cuộc thi (khác ngữ nghĩa) |
| `author_follows` | `(follower_id, author_id)` | Followers (theo tác giả; **không có follow theo sách**) |
| `book_read_counts_daily` (view) | Đếm lượt đọc theo ngày | Không dùng làm "reader" (đếm lượt, không đếm người) |

- **Chưa có traffic source**: không bảng nào ghi nguồn truy cập (contest/search/profile…). Phải bổ sung ở Phase 2 (XI.2).
- `books.view_count` là raw pageview → **không dùng** cho bất kỳ điểm cuộc thi nào.

### 4. Quest Engine
- Bảng: `task_templates` (có `quest_type` check `discovery|engagement|lore_hunt|cross_compare|prediction|topup`, `for_role`, `genre`, `author_id`, `chapter_ref`…), `user_daily_tasks`, `user_quest_pool (user_id, pool_date, slot_index, task_template_id)`, `quest_reset_events`.
- `QuestPoolService.generate…` (`src/lib/quests/quest-pool-service.ts`): 3 slot đảm bảo (discovery, engagement, loại khác) + slot ngẫu nhiên, lọc cooldown và `for_role`.
- Reroll: `resetQuestInPool` chọn template thay thế **ở tầng TS**, RPC `reset_quest_pool_slot()` chỉ kiểm tra trùng/đã hoàn thành/giới hạn 3 lần/ngày — **RPC không kiểm tra loại quest thay thế**.
- ⚠️ Rủi ro hồi quy: truy vấn tạo pool hiện lấy mọi template có `quest_type` và `active`. Nếu insert template cuộc thi trước khi sửa bộ lọc, quest cuộc thi sẽ **lọt vào slot chung**. Xem VIII.1.

### 5. Rankings
- `src/lib/rankings/get-book-rankings.ts`: tuần/tháng/quý từ `book_read_counts_daily`, toàn thời gian từ `view_count`. Contest dùng ranking riêng, không sửa module này.

### 6. Author Workspace
- `/author/[bookId]` → `src/components/author/book-overview.tsx`. Thêm section "Cuộc thi" tại đây; thêm trang `/author/contests`.

### 7. Hạ tầng
- Cron Vercel (`vercel.json`) hiện đều chạy **1 lần/ngày**. Không được để tính đúng/sai của vòng đời phụ thuộc cron chạy đúng giờ (xem VI).
- **Repo chưa có test runner** — kiểm thử hiện là SQL test script trong `docs/supabase/tests/` + `tsc` + `lint` + build + chạy thật. Theo D9 sẽ thêm Vitest cho logic thuần (XIII).
- Giá chương được ghi từ nhiều đường: `POST /api/authoring/books` (tạo sách + chương đầu), `PATCH /api/authoring/chapters/[chapterId]`, và các route mobile → luật "không thu phí khi dự thi" (D8) phải enforce ở **DB trigger**, không chỉ ở route.

---

## III. DATA MODEL

Quy ước: SQL chữ thường, **idempotent** (`if not exists`, `drop policy if exists`, `create or replace`, enum bọc `do $$ … exception when duplicate_object`), mirror vào `docs/supabase/schema.sql` + `src/lib/supabase/types.ts` trong cùng thay đổi, test bằng `docs/supabase/tests/<migration>.test.sql`. Giá trị enum viết thường để khớp các enum hiện có (`transaction_status`, `deposit_status`…).

**Cấu hình không đặt default nghiệp vụ trong DB**: `eligibility_rules`, `vote_rules`, `scoring_config` mặc định `'{}'`; giá trị mặc định và kiểm tra khoá hợp lệ nằm **một chỗ duy nhất** ở `src/lib/contests/config.ts` (parse + validate khi admin lưu, khoá lạ bị từ chối). `config.ts` luôn ghi **đủ mọi khoá** (đã chuẩn hoá). DB kiểm cấu hình đủ khoá đúng kiểu lúc cuộc thi rời `draft` (trigger), rồi các RPC (`submit_contest_entry`, `cast_contest_vote`) đọc thẳng khoá trong jsonb — không nhận tham số cấu hình từ TS, không có bộ default thứ hai trong SQL. Khoá DB đọc: `eligibility_rules.{allow_resubmit_after_withdraw, require_exclusive, allow_multi_contest, max_entries_per_author}`, `vote_rules.{min_account_age_days, require_completed_chapter}`.

### 1. Migration Phase 1 — `migrations/20260926_add_contest_engine_core.sql`

```sql
-- ---------- Enums ----------
do $$ begin
  create type public.contest_status as enum (
    'draft', 'announced', 'submission_open', 'submission_closed',
    'community_voting', 'judging', 'results', 'archived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.contest_submission_status as enum (
    'submitted', 'eligible', 'ineligible', 'withdrawn', 'disqualified', 'shortlisted'
  );
exception when duplicate_object then null; end $$;

-- ---------- contests ----------
create table if not exists public.contests (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  short_description text not null default '',
  description text not null default '',
  key_visual_url text,
  banner_url text,
  status public.contest_status not null default 'draft',
  is_featured boolean not null default false,

  submission_start timestamptz not null,
  submission_end timestamptz not null,
  voting_start timestamptz,
  voting_end timestamptz,
  judging_start timestamptz,
  judging_end timestamptz,
  result_at timestamptz,
  results_published_at timestamptz,   -- null = kết quả chưa công bố

  rules_content text not null default '',
  rules_version text not null default '1',   -- Q5: khoá cùng thể lệ khi rời draft
  prizes_summary jsonb not null default '[]'::jsonb,
  eligibility_rules jsonb not null default '{}'::jsonb,
  vote_rules jsonb not null default '{}'::jsonb,
  scoring_config jsonb not null default '{}'::jsonb,

  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,

  constraint contests_submission_window check (submission_start < submission_end),
  constraint contests_voting_window check (
    voting_start is null or voting_end is null or voting_start < voting_end),
  constraint contests_voting_after_open check (
    voting_start is null or voting_start >= submission_start),
  constraint contests_judging_window check (
    judging_start is null or judging_end is null or judging_start < judging_end)
);

create index if not exists contests_status_idx
  on public.contests (status, submission_end);
create index if not exists contests_featured_idx
  on public.contests (is_featured) where is_featured;

-- Nhật ký chuyển trạng thái cuộc thi (actor null = cron hệ thống).
create table if not exists public.contest_status_events (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests (id) on delete cascade,
  from_status public.contest_status,
  to_status public.contest_status not null,
  actor_id uuid references auth.users (id),
  reason text,
  created_at timestamptz not null default now()
);

-- ---------- contest_submissions ----------
create table if not exists public.contest_submissions (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests (id) on delete restrict,
  book_id uuid not null references public.books (id) on delete restrict,
  author_id uuid not null references auth.users (id) on delete restrict,  -- trigger ghi đè từ books
  -- D2: bài đạt điều kiện được duyệt tự động → 'eligible' ngay khi nộp.
  -- 'submitted' giữ trong enum cho chế độ duyệt tay nếu sau này cần.
  status public.contest_submission_status not null default 'eligible',
  status_reason text,                 -- lý do ineligible/disqualified hiển thị cho tác giả
  -- D4: cờ cần admin xem xét, KHÔNG tự đổi status. Mỗi phần tử:
  -- cấu trúc ở XIX.6 ("Cần bổ sung" = còn cờ visible_to_author chưa resolved_at).
  review_flags jsonb not null default '[]'::jsonb,
  status_changed_by uuid references auth.users (id),
  status_changed_at timestamptz not null default now(),
  submitted_at timestamptz not null default now(),   -- reset khi nộp lại sau khi rút
  rules_version_accepted text not null,
  rules_accepted_at timestamptz not null,
  eligibility_result jsonb not null default '[]'::jsonb,  -- kết quả engine lúc nộp, làm bằng chứng
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contest_submissions_contest_book_key unique (contest_id, book_id),
  constraint contest_submissions_id_contest_key unique (id, contest_id)  -- đích FK tổng hợp
);

create index if not exists contest_submissions_contest_status_idx
  on public.contest_submissions (contest_id, status, submitted_at desc, id);
create index if not exists contest_submissions_book_idx on public.contest_submissions (book_id);
create index if not exists contest_submissions_author_idx on public.contest_submissions (author_id);
create index if not exists contest_submissions_flagged_idx
  on public.contest_submissions (contest_id) where review_flags <> '[]'::jsonb;

-- author_id luôn lấy từ books, không bao giờ từ input.
create or replace function public.contest_submissions_set_author()
returns trigger language plpgsql set search_path = public as $$
begin
  select b.author_id into new.author_id from public.books b where b.id = new.book_id;
  if new.author_id is null then
    raise exception 'Book % not found', new.book_id;
  end if;
  return new;
end;
$$;

drop trigger if exists contest_submissions_set_author on public.contest_submissions;
create trigger contest_submissions_set_author
  before insert or update of book_id on public.contest_submissions
  for each row execute function public.contest_submissions_set_author();

-- Nhật ký chuyển trạng thái bài dự thi (giống mô hình book_moderation_actions).
create table if not exists public.contest_submission_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.contest_submissions (id) on delete cascade,
  from_status public.contest_submission_status,
  to_status public.contest_submission_status not null,
  actor_id uuid references auth.users (id),
  actor_kind text not null check (actor_kind in ('author', 'admin', 'system')),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists contest_submission_events_submission_idx
  on public.contest_submission_events (submission_id, created_at);

-- ---------- contest_votes ----------
create table if not exists public.contest_votes (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null,
  submission_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- FK tổng hợp: contest_id của vote không thể lệch với contest của submission.
  constraint contest_votes_submission_fk foreign key (submission_id, contest_id)
    references public.contest_submissions (id, contest_id) on delete restrict,
  constraint contest_votes_submission_user_key unique (submission_id, user_id)
);

create index if not exists contest_votes_contest_user_idx on public.contest_votes (contest_id, user_id);
create index if not exists contest_votes_submission_created_idx
  on public.contest_votes (submission_id, created_at);

-- ---------- contest_awards ----------
-- Provenance: award -> submission (FK tổng hợp với contest) -> book -> author.
-- Không lưu lặp book_id/author_id để không có 2 nguồn chân lý; view
-- contest_award_details join sẵn cho badge trên /truyen/[slug] và trang tác giả.
create table if not exists public.contest_awards (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null,
  submission_id uuid not null,
  award_code text not null check (award_code ~ '^[a-z0-9_]+$'),  -- 'first_prize', 'readers_choice'
  award_name text not null,
  award_rank integer check (award_rank is null or award_rank > 0),
  category text,
  -- D10: giải công bố bằng VND, quy đổi sang token rồi trao vào ví tác giả.
  -- Lưu cả tỷ giá lúc trao vì TOKEN_TO_VND_RATE (src/lib/wallet/config.ts) còn là giá trị tạm.
  prize_vnd bigint not null default 0 check (prize_vnd >= 0),
  token_vnd_rate integer check (token_vnd_rate is null or token_vnd_rate > 0),
  prize_tokens integer not null default 0 check (prize_tokens >= 0),  -- = prize_vnd / token_vnd_rate, làm tròn xuống
  prize_extras text,                  -- quà kèm không quy đổi: hợp đồng xuất bản, banner…
  payout_transaction_id uuid,         -- giao dịch grant_platform_bonus() đã chi; null = chưa chi
  paid_at timestamptz,
  -- Thiết kế: truyện bị gỡ/loại sau khi có giải → giữ award, gắn nhãn "Đã thu hồi".
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id),
  revoked_reason text,
  badge_icon_url text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint contest_awards_submission_fk foreign key (submission_id, contest_id)
    references public.contest_submissions (id, contest_id) on delete restrict,
  constraint contest_awards_unique unique (contest_id, award_code, submission_id)
);

create index if not exists contest_awards_submission_idx on public.contest_awards (submission_id);

-- security_invoker: view chạy RLS của người gọi → không lộ award chưa công bố
-- (view mặc định chạy quyền OWNER, bỏ qua RLS của contest_awards).
create or replace view public.contest_award_details
  with (security_invoker = true) as
  select a.*, s.book_id, s.author_id, c.slug as contest_slug, c.title as contest_title
  from public.contest_awards a
  join public.contest_submissions s on s.id = a.submission_id
  join public.contests c on c.id = a.contest_id;

-- ---------- D8: chương của sách đang dự thi không được thu phí ----------
-- "Đang dự thi" = bài submitted/eligible/shortlisted và cuộc thi CHƯA sang
-- results/archived. Hết hạn chế tự động khi cuộc thi công bố kết quả, hoặc
-- khi bài bị rút/loại/không hợp lệ — không cần job gỡ khoá.
-- plpgsql (volatile) chứ không phải sql stable: mỗi lần gọi lấy snapshot mới,
-- nên UPDATE giá đang chờ khoá dòng của submit_contest_entry() sẽ thấy bài
-- dự thi vừa commit (xem RPC bên dưới).
create or replace function public.book_has_active_contest_entry(p_book_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  return exists (
    select 1 from public.contest_submissions cs
    join public.contests c on c.id = cs.contest_id
    where cs.book_id = p_book_id
      and cs.status in ('submitted', 'eligible', 'shortlisted')
      and c.status not in ('results', 'archived')
  );
end;
$$;

revoke execute on function public.book_has_active_contest_entry(uuid) from public, anon;
grant execute on function public.book_has_active_contest_entry(uuid) to authenticated, service_role;

create or replace function public.chapters_block_paid_during_contest()
returns trigger language plpgsql set search_path = public as $$
begin
  if (new.price > 0 or new.audio_price > 0)
     and public.book_has_active_contest_entry(new.book_id) then
    raise exception 'Chapter of a book in an active contest must be free'
      using errcode = 'check_violation', hint = 'contest_paid_chapter';
  end if;
  return new;
end;
$$;

drop trigger if exists chapters_block_paid_during_contest on public.chapters;
create trigger chapters_block_paid_during_contest
  before insert or update of price, audio_price, book_id on public.chapters
  for each row execute function public.chapters_block_paid_during_contest();

-- ---------- D11: không tắt độc quyền khi đang dự thi cuộc thi yêu cầu độc quyền ----------
-- Cùng khung "đang dự thi" như D8, nhưng chỉ tính cuộc thi có
-- eligibility_rules.require_exclusive = true (config.ts validate khoá này là
-- boolean khi admin lưu). Cần trigger vì authenticated có GRANT UPDATE
-- (is_exclusive) trên books → tác giả gọi thẳng PostgREST được, không qua route.
create or replace function public.book_has_active_exclusive_contest_entry(p_book_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  return exists (
    select 1 from public.contest_submissions cs
    join public.contests c on c.id = cs.contest_id
    where cs.book_id = p_book_id
      and cs.status in ('submitted', 'eligible', 'shortlisted')
      and c.status not in ('results', 'archived')
      and coalesce((c.eligibility_rules ->> 'require_exclusive')::boolean, false)
  );
end;
$$;

revoke execute on function public.book_has_active_exclusive_contest_entry(uuid) from public, anon;
grant execute on function public.book_has_active_exclusive_contest_entry(uuid) to authenticated, service_role;

create or replace function public.books_block_exclusive_off_during_contest()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.is_exclusive and not new.is_exclusive
     and public.book_has_active_exclusive_contest_entry(new.id) then
    raise exception 'Book in an exclusive-only contest must stay exclusive'
      using errcode = 'check_violation', hint = 'contest_exclusive_lock';
  end if;
  return new;
end;
$$;

drop trigger if exists books_block_exclusive_off_during_contest on public.books;
create trigger books_block_exclusive_off_during_contest
  before update of is_exclusive on public.books
  for each row execute function public.books_block_exclusive_off_during_contest();
```

Trigger D8 dùng `hint = 'contest_paid_chapter'` để route phân biệt hai lỗi `check_violation` mà không phải so chuỗi message.

Phần hàm/RPC (cùng migration):

| Hàm | Quyền | Việc |
|---|---|---|
| `contest_word_count(p text) returns integer` | immutable | `select count(*)::integer from regexp_matches(coalesce(p, ''), '\S+', 'g')` — cùng định nghĩa với `countWords()` trong `src/lib/authoring/split-chapters.ts` (khác biệt nhỏ ở khoảng trắng Unicode giữa JS và Postgres phải được test). |
| `get_book_contest_stats(p_book_id uuid)` | `service_role` | Trả `published_chapter_count`, `total_words` trên chương `published and removed_at is null`. Tính trong DB, không kéo `content` về Node. |
| `transition_contest_status(p_contest_id, p_to, p_actor_id, p_reason)` | `service_role` | Khoá `for update`, chỉ cho các chuyển trạng thái trong ma trận (VI.1), ghi `contest_status_events`, set `archived_at` khi `archived`. |
| `set_contest_submission_status(p_submission_id, p_to, p_actor_id, p_actor_kind, p_reason)` | `service_role` | Kiểm ma trận chuyển trạng thái bài dự thi (IV.4), ghi `contest_submission_events`. |
| `submit_contest_entry(p_contest_id, p_book_id, p_user_id, p_rules_version, p_eligibility_result, p_allow_resubmit)` | `service_role` | Khoá dòng contest + dòng sách + mọi chương của sách (`for update`), kiểm lại trong DB các bất biến có tranh chấp: cổng đang mở, sở hữu, **mọi chương giá 0 (D8)**, **`books.is_exclusive = true` nếu contest `require_exclusive` (D11)**, trùng/nộp lại; rồi insert (hoặc cập nhật dòng `withdrawn` khi nộp lại) + ghi `contest_submission_events`. Khoá sách và chương đảm bảo không có UPDATE giá hoặc tắt độc quyền chen vào giữa lúc kiểm và lúc tạo bài. Kiểm thỏa thuận độc quyền nằm ở tầng TS (IV.6), không trong RPC. |
| `cast_contest_vote(p_user_id, p_submission_id, p_min_account_age_days, p_require_completed_chapter)` | `service_role` | Kiểm lại trong DB: cuộc thi `community_voting` + trong khung vote; bài `eligible/shortlisted`, sách còn hiển thị; người vote ≠ tác giả; `auth.users.created_at <= now() - p_min_account_age_days`; nếu `p_require_completed_chapter` thì phải có dòng `reading_history` cho một chương đang hiển thị của sách. Trùng vote bị unique chặn → trả "đã vote". Theo pattern `reset_quest_pool_slot()`: TS đọc cấu hình cuộc thi và truyền tham số, RPC giữ bất biến. **Không có quota tổng/cuộc thi (D5).** |
| Trigger chặn `delete` trên `contests` khi `status <> 'draft'` | — | Cuộc thi đã công bố không bao giờ bị hard-delete. |

### 2. RLS Phase 1

```sql
alter table public.contests enable row level security;
alter table public.contest_status_events enable row level security;
alter table public.contest_submissions enable row level security;
alter table public.contest_submission_events enable row level security;
alter table public.contest_votes enable row level security;
alter table public.contest_awards enable row level security;

-- contests: công khai trừ nháp. Admin đọc nháp qua service-role. KHÔNG hỏi
-- public.profiles trong policy: policy SELECT của profiles tự truy vấn lại
-- profiles → 42P17 "infinite recursion" (phát hiện khi chạy test 26/09/2026).
create policy "public contests are readable" on public.contests for select
  using (status <> 'draft');

-- contest_submissions: công khai chỉ khi bài hợp lệ, cuộc thi không nháp VÀ sách
-- còn hiển thị (tôn trọng moderation); tác giả thấy bài của mình.
create policy "public contest submissions are readable" on public.contest_submissions for select
  using (
    auth.uid() = author_id
    or (
      status in ('eligible', 'shortlisted')
      and exists (select 1 from public.contests c where c.id = contest_id and c.status <> 'draft')
      and exists (select 1 from public.books b
                  where b.id = book_id and b.published and b.deleted_at is null)
    )
  );

-- contest_votes: chỉ thấy vote của chính mình (không lộ ai vote cho ai).
create policy "users view their own contest votes" on public.contest_votes for select
  using (auth.uid() = user_id);

-- contest_awards: chỉ công khai khi kết quả đã công bố.
create policy "published contest awards are readable" on public.contest_awards for select
  using (exists (
    select 1 from public.contests c
    where c.id = contest_id and c.status in ('results', 'archived')
      and c.results_published_at is not null and c.results_published_at <= now()));

-- Không có policy INSERT/UPDATE/DELETE cho authenticated trên mọi bảng contest.
-- contest_status_events / contest_submission_events: không có policy select
-- → chỉ service-role đọc; API trả phần tác giả được xem.
```

### 3. Bảng bổ sung

| Bảng | Phase | Mục đích |
|---|---|---|
| `contest_submission_snapshots`, `contest_submission_snapshot_chapters` | **1** (D3) — migration riêng ở Slice 1.6 | Bản chụp phiên bản được chấm (V) |
| `contest_submission_scores (submission_id, contest_id, kind, value, rank, formula_id, components jsonb, computed_at)`, PK `(submission_id, kind)`, `kind ∈ popular/trending/jury/final` | 2 | Cache điểm, **RLS không có policy select** → chỉ API (đã kiểm `results_visible`) mới trả `jury`/`final` |
| `contest_judges`, `contest_rubrics`, `contest_judge_scores` | 2 | Chấm điểm; điểm từng giám khảo không bao giờ công khai |
| `contest_fraud_signals` | 2 | Tín hiệu gian lận, tách biệt với điểm |
| `contest_rounds`, `contest_round_entries` | 3 | Nhiều vòng, shortlist |
| `contest_passport_milestones`, `contest_passport_progress`, `contest_passport_events` | 3 | Hộ chiếu cuộc thi |

**Không** đặt `popular_score`/`jury_score`/`final_score` lên `contest_submissions` (bản trước làm vậy khiến `jury_score` công khai qua policy SELECT của bảng submissions).

---

## IV. NỘP BÀI & ELIGIBILITY ENGINE

### 1. Kiến trúc engine (`src/lib/contests/eligibility/`)

```ts
type EligibilityCheck = {
  code: string;          // 'min_published_chapters'
  passed: boolean;
  blocking: boolean;     // false = cảnh báo, vẫn nộp được
  message: string;       // tiếng Việt, hiển thị cho tác giả
  details?: Record<string, unknown>;  // { required: 3, actual: 1 }
};

type EligibilityRule = {
  code: string;
  appliesTo: "preview" | "submit" | "close";  // lúc xem trước / lúc nộp / lúc đóng cổng
  evaluate(ctx: EligibilityContext): EligibilityCheck | null; // null = rule không bật
};
```

- `EligibilityContext` được nạp **một lần** (contest, book, `get_book_contest_stats`, mọi submission hiện có của sách kèm trạng thái contest tương ứng, viewer) → không N+1 khi kiểm nhiều rule hoặc nhiều sách.
- Engine chạy **tất cả** rule và trả đủ danh sách (UI hiện "còn thiếu gì"), không dừng ở lỗi đầu tiên.
- Thêm rule mới = thêm 1 file vào registry + 1 khoá trong `config.ts`. Không có `if` rải rác ở route/UI.

### 2. Bộ rule Phase 1

| Code | Điều kiện | Nguồn dữ liệu |
|---|---|---|
| `contest_open` | `status = 'submission_open'` **và** `submission_start <= now() < submission_end` | `contests` |
| `ownership` | `book.author_id = viewer` | `books` |
| `book_visible` | `published and deleted_at is null` (bao gồm cả trường hợp admin gỡ: `deleted_at` + `removed_by`) | `books` |
| `min_published_chapters` | Số chương `published and removed_at is null` ≥ ngưỡng | `get_book_contest_stats` |
| `min_words` / `max_words` | Tổng từ các chương trên trong khoảng | `get_book_contest_stats` |
| `allowed_genres` | `book.genre` thuộc danh sách (nếu cấu hình) | `books.genre` |
| `required_tags` | Sách có đủ tag bắt buộc (nếu cấu hình) | `books.tags` |
| `require_exclusive` (D11) | Nếu cấu hình: `books.is_exclusive = true` **và** tác giả đã chấp nhận "Chính sách độc quyền xuất bản" bản hiện hành (`hasAcceptedExclusivityPolicy()`). Xem IV.6 | `books.is_exclusive` + `agreement_acceptances` |
| `book_created_after` | Tác phẩm mới (nếu cấu hình) | `books.created_at` |
| `not_already_entered` | Chưa có dòng trong contest này, **hoặc** dòng đang `withdrawn` và contest cho phép nộp lại | `contest_submissions` |
| `multi_contest` | Chặn nếu contest này cấm đa cuộc thi **hoặc** bất kỳ contest khác mà sách đang tham gia (bài `submitted/eligible/shortlisted`, contest chưa `results/archived`) cấm — kiểm **cả hai chiều** | `contest_submissions` + `contests` |
| `prior_contest_entries` | Nếu contest cấm sách từng dự thi: không có bài `eligible/shortlisted` ở contest đã kết thúc | `contest_submissions` |
| `no_paid_chapters` (D8) | Mọi chương chưa bị gỡ (cả nháp, vì nháp có thể được xuất bản trong thời gian thi) có `price = 0` **và** `audio_price = 0`. Không đạt → hướng dẫn tác giả chuyển miễn phí trước khi nộp | `chapters` |
| `rules_accepted` (chỉ lúc submit) | `acceptedRulesVersion` gửi lên **bằng đúng** `contests.rules_version` hiện tại (thể lệ bị khoá khi rời `draft` — Q5; kiểm vẫn giữ làm bằng chứng) | request + `contests` |

Khi code cần kiểm thêm: tác giả có đang bị hạn chế bởi hệ thống penalty (`src/app/api/penalty/`) hay không.

### 3. Luồng nộp bài (2 điểm vào, 1 service)

- Service duy nhất: `submissionService.submit({ contestId, bookId, viewerId, acceptedRulesVersion })`.
- API duy nhất: `POST /api/contests/[slug]/submissions` với body `{ bookId, acceptedRulesVersion }` — không nhận `authorId`.
- Xem trước điều kiện: `GET /api/contests/[slug]/eligibility?bookId=` (1 sách) hoặc không có `bookId` (mọi sách của tác giả, 1 lần nạp context theo lô).
- **Luồng A** — `/cuoc-thi/[slug]` → "Gửi tác phẩm dự thi" → chọn sách (kèm kết quả eligibility từng sách) → đọc & tích chấp nhận thể lệ → gửi.
- **Luồng B** — `/author/[bookId]` → section "Cuộc thi" → danh sách cuộc thi đang nhận bài kèm eligibility của chính sách này → chấp nhận thể lệ → gửi.
- Khi submit, service chạy lại toàn bộ rule `submit` (không tin kết quả preview), rồi gọi `submit_contest_entry()` để kiểm lại các bất biến có tranh chấp dưới khoá và ghi bài, lưu `eligibility_result` làm bằng chứng. Trùng lặp đồng thời được chặn cứng bởi unique `(contest_id, book_id)` → trả 409.
- Trạng thái ban đầu: **`eligible`** — duyệt tự động (D2). Admin vẫn có thể chuyển sang `ineligible`/`disqualified` sau đó.

### 4. Ma trận trạng thái bài dự thi

| Từ → Đến | Ai | Điều kiện |
|---|---|---|
| `submitted` → `eligible` / `ineligible` | admin / system | Duyệt |
| `submitted`, `eligible` → `withdrawn` | author | Trước `submission_end` (D6) |
| `withdrawn` → `eligible` (nộp lại, **cùng dòng**, `submitted_at` reset) | author | `eligibility_rules.allow_resubmit_after_withdraw = true` (cấu hình theo cuộc thi, mặc định `false` — D6) + cổng còn mở + chạy lại eligibility |
| `ineligible` → `eligible` | admin | Khiếu nại được chấp nhận |
| `eligible` → `shortlisted` | admin | Phase 3 (vòng loại) |
| `submitted`, `eligible`, `shortlisted` → `disqualified` | admin | Bắt buộc `reason` |
| `disqualified` → * | — | Trạng thái cuối, không nộp lại được |

Unique `(contest_id, book_id)` giữ nguyên; nộp lại là **cập nhật dòng cũ**, lịch sử nằm ở `contest_submission_events`. Cách này bỏ được mâu thuẫn trong bản trước (unique chặn nộp lại nhưng rule lại ngầm cho nộp lại).

### 5. Không thu phí trong thời gian dự thi (D8)
- **Phạm vi**: cả giá đọc (`price`) và giá audio (`audio_price`) của mọi chương thuộc sách đang dự thi.
- **Thời gian**: từ lúc bài được tạo đến khi cuộc thi sang `results` (công bố kết quả). Rút bài, bị loại hoặc bị đánh `ineligible` cũng gỡ hạn chế. Hạn chế **tự hết** vì trigger chỉ kiểm điều kiện hiện tại, không cần job.
- **Enforce 3 lớp**:
  1. Rule `no_paid_chapters` lúc xem trước và lúc nộp (IV.2) → tác giả thấy rõ chương nào cần chuyển miễn phí.
  2. `submit_contest_entry()` khoá chương và kiểm lại giá dưới khoá.
  3. Trigger `chapters_block_paid_during_contest` từ chối mọi INSERT/UPDATE đặt giá > 0 trong thời gian thi, bất kể đi từ route web, mobile hay service-role.
- **UI**: form giá chương (`chapter-editor.tsx` / `publish-panel.tsx`) khoá ô giá và giải thích lý do khi sách đang dự thi. Route `PATCH /api/authoring/chapters/[chapterId]` chuyển lỗi `check_violation` thành 409 kèm thông báo tiếng Việt.
- **Người đã mua chương trước khi sách dự thi**: không hoàn token (họ đã có quyền đọc). Màn hình nộp bài cảnh báo tác giả rằng chuyển miễn phí sẽ áp dụng cho mọi người đọc.
- **Hệ quả tốt**: mọi độc giả và giám khảo đọc được toàn bộ bài dự thi mà không cần đường vòng qua `purchase_transactions`.

### 6. Cuộc thi yêu cầu độc quyền (D11)
- **Nguồn chân lý** (đã xác minh trong code): `books.is_exclusive`. `chapters.is_exclusive` đã ngừng dùng. Thỏa thuận (`src/lib/authoring/exclusivity-agreement.ts`) và khoá 3 ngày (`src/lib/authoring/exclusivity-lock.ts`) chỉ là lớp bảo vệ quanh cờ này.
- **Vì sao phải kiểm cả thỏa thuận**: cột được thêm với mặc định `true`, nên truyện có từ trước mang `true` dù tác giả chưa từng chọn độc quyền hay ký thỏa thuận. Thỏa thuận cũng có thể đã cũ khi văn bản có bản mới.
- **Phạm vi**: chỉ cuộc thi có `eligibility_rules.require_exclusive = true`. Khung thời gian giống D8: từ lúc bài được tạo đến khi cuộc thi sang `results`; rút bài, bị loại hoặc `ineligible` thì hết hạn chế.
- **Chặn cứng tắt độc quyền, enforce 3 lớp**:
  1. Rule `require_exclusive` lúc xem trước và lúc nộp.
  2. `submit_contest_entry()` khoá dòng sách và kiểm lại `is_exclusive` dưới khoá.
  3. Trigger `books_block_exclusive_off_during_contest` từ chối `true → false` bất kể đường ghi: route tác giả, gọi thẳng PostgREST (authenticated có GRANT UPDATE cột này), route admin hay service-role.
- **Admin**: trigger chặn cả admin. Muốn tắt độc quyền, admin phải chuyển bài sang `disqualified` (bắt buộc lý do) hoặc tác giả rút bài trước. Như vậy mọi ngoại lệ đều có dấu vết trong `contest_submission_events`.
- **Không kiểm lại thỏa thuận sau khi nộp**: bằng chứng lúc nộp nằm trong `eligibility_result`. Văn bản chính sách có bản mới trong lúc thi không làm bài mất điều kiện.
- **Route**: `PATCH /api/authoring/books/[bookId]` và `PATCH /api/admin/books/[bookId]` chuyển lỗi `check_violation` có `hint = 'contest_exclusive_lock'` thành 409, kèm thông báo tiếng Việt và link cuộc thi.
- **UI**: nút độc quyền trong `publish-panel.tsx` / `author-workspace.tsx` bị khoá và giải thích lý do khi `can_disable_exclusive = false`; nút trong `content-table.tsx` (admin) hiện lý do từ 409. Màn hình nộp bài cảnh báo tác giả rằng không tắt được độc quyền cho đến khi công bố kết quả.

---

## V. PHIÊN BẢN ĐƯỢC CHẤM (SNAPSHOT) SAU DEADLINE

### 1. Nguyên tắc
- Tác giả **luôn** sửa được sách (sách là của họ, độc giả đọc bản sống). Contest không khoá chỉnh sửa.
- Thứ được chấm là **bản chụp tại thời điểm đóng cổng**, không phải bản sống.
- Không clone Book → mọi ID, comment, highlight, tiến độ đọc, giao dịch, audio, nhân vật giữ nguyên.

### 2. Thiết kế
```
contest_submission_snapshots
  id, submission_id (FK), contest_id, taken_at, reason ('submission_closed' | 'manual'),
  book_title, synopsis, genre, tags, chapter_count, total_words
contest_submission_snapshot_chapters
  snapshot_id (FK), chapter_id (FK on delete set null), order_index, title,
  content text, word_count, content_hash (sha256), content_purged_at
```
- Lưu **nội dung đầy đủ** (không chỉ hash — chỉ có hash thì không dựng lại được bản đã chấm, chỉ phát hiện được là đã đổi).
- Chỉ chụp chương `published and removed_at is null` tại thời điểm đóng.
- Tạo bởi service `closeSubmissions(contestId)`, chạy khi `submission_open → submission_closed` (admin bấm hoặc cron bắt kịp). Idempotent: bỏ qua bài đã có snapshot `submission_closed`.
- Giám khảo (Phase 2) đọc snapshot, **không** đọc chương trả phí trực tiếp → không có đường vòng qua `purchase_transactions`.
- Phase 2: so `content_hash` snapshot với bản sống để báo "đã sửa sau deadline" trên judge dashboard.

### 3. Kiểm lại điều kiện lúc đóng cổng
Tác giả có thể gỡ chương sau khi nộp (tụt dưới `min_published_chapters`). Rule loại `close` chạy lại khi đóng cổng. Theo D4, kết quả **chỉ gắn cờ** vào `contest_submissions.review_flags` (không đổi `status`). Admin xem danh sách bài có cờ ở `/admin/cuoc-thi` rồi quyết định giữ (đánh dấu cờ `resolved_at`, XIX.6) hoặc chuyển `ineligible`/`disqualified`. Sách bị gỡ không dùng cờ; trạng thái này được suy ra từ `books.deleted_at` (XII.2).

### 4. Tương tác với moderation & purge
- `purge-deleted-content` phải được sửa để rỗng hoá `contest_submission_snapshot_chapters.content` của sách/chương đã xoá/gỡ quá hạn (set `content_purged_at`). Nếu không, snapshot thành đường giữ lại nội dung vi phạm/đã gỡ.

### 5. Đưa vào Phase 1 (D3)
Bảng + job snapshot + sửa purge cron nằm ở Slice 1.6. Lý do: hệ thống không có lịch sử phiên bản chương, nên nếu một cuộc thi thật đóng cổng mà chưa có snapshot thì **không bao giờ dựng lại được** bản đã chấm. Không cuộc thi thật nào được chuyển sang `submission_closed` trước khi Slice 1.6 xong. Phase 2 chỉ bổ sung phần đọc snapshot cho giám khảo và phần so sánh "đã sửa sau deadline".

---

## VI. VÒNG ĐỜI & CAPABILITY

### 1. Ma trận trạng thái cuộc thi

```
draft → announced → submission_open → submission_closed ─┬→ community_voting ─┬→ judging → results → archived
                                                          ├→ judging ──────────┤
                                                          └→ results ←─────────┘
```
- Chỉ đi tiến, không lùi (sai sót sửa bằng cách sửa mốc thời gian, không lùi trạng thái). Chỉ `draft` được xoá.
- Admin chuyển thủ công qua `transition_contest_status()`.
- Cron hằng ngày `/api/contests/cron/advance` chỉ **bắt kịp** các chuyển trạng thái theo giờ: `announced → submission_open` khi qua `submission_start`, `submission_open → submission_closed` (+ snapshot) khi qua `submission_end`.
- **Đúng/sai không phụ thuộc cron**: capability luôn kiểm cả `status` lẫn thời gian. Ví dụ cron trễ 20 tiếng, `status` vẫn là `submission_open` nhưng `now() >= submission_end` → `can_submit = false`.

### 2. Capability (`src/lib/contests/capabilities.ts`, thuần hàm, dễ test)

```ts
getContestCapabilities({ contest, viewer, now, viewerSubmission?, viewerVoteCount? }) => {
  status: ContestStatus;
  can_submit: boolean;           // status submission_open && trong khung nộp && viewer đăng nhập
  can_withdraw: boolean;         // bài của viewer ∈ {submitted, eligible} && now < submission_end (D6)
  can_resubmit: boolean;         // bài withdrawn && allow_resubmit_after_withdraw && cổng còn mở
  can_edit_submission: boolean;  // chỉnh sửa sách còn được tính vào bản chấm (= trước submission_end)
  can_set_chapter_price: boolean; // false khi sách đang dự thi (D8) — cho form giá chương
  can_disable_exclusive: boolean; // false khi sách đang dự thi cuộc thi require_exclusive (D11)
  can_vote: boolean;             // status community_voting && trong khung vote && đủ điều kiện người vote (D5)
  results_visible: boolean;      // status ∈ {results, archived} && results_published_at <= now
  rankings_visible: { popular: boolean; trending: boolean; jury: boolean; final: boolean };
  available_feeds: FeedKind[];   // UI chỉ render tab có trong danh sách
  reasons: Partial<Record<"can_submit" | "can_vote" | "can_withdraw" | "can_resubmit", string>>;
  // mã lý do để UI giải thích, vd can_vote: 'account_too_new' | 'no_completed_chapter' | 'own_entry' | 'already_voted'
}
```
- Mọi response của `/api/contests/[slug]`, danh sách bài, author workspace đều kèm `capabilities` → frontend không tự so sánh deadline.
- `jury`/`final` chỉ `true` khi `results_visible`.
- Điều kiện "đã đọc hết ≥ 1 chương" (D5) phụ thuộc từng bài, nên danh sách bài trả thêm `viewer: { has_voted, can_vote, reason }` **cho từng bài**. Giá trị này được tính theo lô trong cùng truy vấn feed, không gọi riêng từng bài.

---

## VII. XẾP HẠNG, DISCOVERY & CHỐNG GIAN LẬN

### 1. Tách điểm
| Điểm | Phase | Nội dung | Ghi chú |
|---|---|---|---|
| `popular` | 1 | Phase 1: **chỉ đếm vote hợp lệ** (D7) | Công thức đầy đủ (vote + valid reader chuẩn hoá) ở Phase 2 |
| `trending` | 2 | Tăng trưởng tương tác hợp lệ 48h có decay | |
| `jury` | 2 | Trung bình chuẩn hoá điểm rubric | Không công khai trước `results_visible` |
| `final` | 2 | Kết hợp theo `scoring_config` | Không giả định `popular = final` |

- Công thức là module có id + version (`src/lib/contests/scoring/formulas/popular-v1.ts`…). `contests.scoring_config` chỉ chọn `formula_id` + tham số. Trọng số **không** xuất hiện ở UI/route.
- Achievement/gamification của tác giả **không bao giờ** là đầu vào của công thức.

### 2. Ranking API
`GET /api/contests/[slug]/rankings?kind=popular&cursor=…&limit=…`
- Chỉ tính bài `eligible/shortlisted` có sách còn hiển thị.
- Thứ tự tất định: `value desc, submitted_at asc, id asc` (`id` là khoá cuối để không bao giờ hoà hoàn toàn).
- Đồng điểm: cùng `rank` (kiểu `rank()`), hiển thị "đồng hạng"; thứ tự trong nhóm đồng hạng theo khoá phụ ở trên.
- Phân trang keyset (cursor = `value, submitted_at, id`), không kéo toàn bộ về client.
- Phase 1: hàm SQL `get_contest_ranking(p_contest_id, p_kind, p_limit, p_cursor…)` tổng hợp trực tiếp từ `contest_votes` (có index). Phase 2: đọc từ `contest_submission_scores` do job tính sẵn. Hợp đồng API không đổi khi đổi backend.
- ⚠️ Cron Vercel hiện chạy theo ngày; trending cần làm mới thường hơn → Phase 2 phải chọn: tăng tần suất cron (phụ thuộc gói Vercel) hoặc tính khi đọc + cache ngắn hạn.

### 3. Discovery feeds (`GET /api/contests/[slug]/submissions?feed=…`)
| Feed | Phase | Cách chọn |
|---|---|---|
| `new` — Mới tham gia | 1 | `submitted_at desc, id desc`, keyset |
| `popular` — Đang được chú ý | 1 | Theo ranking popular |
| `discover` — Ngẫu nhiên | 1 | `order by md5(id::text || seed)`, `seed` = ngày + viewer → phân trang ổn định, không lặp bài |
| `trending` | 2 | Theo điểm trending |
| `hidden_gems` — Viên ngọc ẩn | 2 | Nhóm có ít valid reader nhất (ví dụ phần tư dưới), xáo trong nhóm theo seed |

Một truy vấn/hàm trả sẵn dữ liệu card (tựa, bìa, tác giả, thể loại, số vote) — không truy vấn từng bài. Hỗ trợ lọc `genre`.

### 4. Tương tác hợp lệ (`src/lib/contests/signals/`)
| Khái niệm | Định nghĩa (đề xuất) | Nguồn |
|---|---|---|
| Valid reader | `distinct user_id` trong `reading_history` trên chương đang hiển thị của sách, trong khung cuộc thi, **trừ chính tác giả** | `reading_history` |
| Meaningful read | Phiên đọc đủ lâu so với độ dài chương (ngưỡng cấu hình) | `reading_sessions` |
| Completion | Đã đọc mọi chương trong snapshot / chương cuối | `reading_history` |
| Return reader | Đọc sách ở ≥ 2 ngày khác nhau | `reading_history` |
| Unique commenter | `distinct user_id` bình luận, mỗi người tính 1 → spam không tăng tuyến tính | `anchored_comments` |
| Valid vote | Xem 5 | `contest_votes` |

- Không dùng `books.view_count` hay `book_read_counts_daily` (đếm lượt, không đếm người). Refresh trang không tạo reader mới vì `record_chapter_read()` đã dedupe theo ngày; và reader đếm theo `distinct user_id`.
- Khi triển khai Phase 2 phải xác minh lại chính xác lúc client gọi `record_chapter_read()` (đọc hết chương hay chỉ mở chương) trước khi coi đó là "đọc thật".

### 5. Vote hợp lệ
Kiểm ở tầng service (để trả lý do cho UI), rồi `cast_contest_vote()` kiểm lại toàn bộ trong DB (D5):
- Contest `community_voting` và trong khung `voting_start`–`voting_end`.
- Bài `eligible/shortlisted`, sách còn hiển thị.
- Người vote ≠ tác giả của bài.
- **1 vote / bài dự thi / tài khoản** (unique DB). **Không giới hạn** tổng số bài một tài khoản được vote trong một cuộc thi (D5).
- **Phải đã đọc hết ≥ 1 chương** của chính truyện đó: có dòng `reading_history` cho một chương đang hiển thị (`published and removed_at is null`) của sách. Dòng này chỉ sinh ra khi người đọc tới đoạn cuối chương và qua kiểm tra quyền đọc ở server.
- **Tuổi tài khoản ≥ 7 ngày** tại thời điểm vote (theo `auth.users.created_at`). Giá trị nằm trong `vote_rules.min_account_age_days`, mặc định 7 ở `config.ts`.
- Rút vote chỉ trong khung vote.

Giới hạn đã biết (theo dõi ở Phase 2): "đọc hết chương" dựa trên việc client báo đã tới đoạn cuối, nên script vẫn giả lập được. Vì không có quota tổng, một tài khoản đủ tuổi có thể vote cho mọi bài sau khi đọc 1 chương mỗi bài. Tín hiệu meaningful read (thời gian đọc so với độ dài chương) và `contest_fraud_signals` ở Phase 2 dùng để phát hiện và loại các vote này; chúng không tự khoá tài khoản.

### 6. Chống gian lận (Phase 2)
- `contest_fraud_signals (contest_id, user_id?, submission_id?, signal_code, severity, evidence jsonb, reviewed_by, reviewed_at, resolution)`.
- Tín hiệu ≠ điểm: công thức chỉ loại vote/reader mà admin đã **xác nhận** gian lận. Không tự khoá tài khoản từ 1 tín hiệu đơn lẻ.

---

## VIII. CONTEST QUEST & CONTEST PASSPORT (Phase 3)

### 1. Contest Quest — mở rộng engine hiện có
Migration Phase 3 (tất cả đều thêm mới, có default):
- `task_templates.quest_pool text not null default 'general' check (quest_pool in ('general', 'contest'))` và `task_templates.contest_id uuid references contests(id)`, kèm `check ((quest_pool = 'contest') = (contest_id is not null))`. Template creator tiếp tục dùng `for_role` hiện có, không tạo pool thứ ba nếu không cần.
- `user_quest_pool.slot_kind text not null default 'general' check (slot_kind in ('general', 'event'))` + unique index một phần `(user_id, pool_date) where slot_kind = 'event'` → **DB đảm bảo tối đa 1 event slot/ngày**, kể cả khi nhiều cuộc thi cùng mở.
- Sửa `reset_quest_pool_slot()`: template thay thế phải cùng `quest_pool` với slot đang reset → event chỉ đổi sang event, **DB enforce**, không chỉ TS.
- `QuestPoolService`: slot chung chỉ lấy `quest_pool = 'general'`; event slot lấy từ template của các cuộc thi đang `submission_open/community_voting` (1 template, chọn có trọng số giữa các cuộc thi).
- ⚠️ Thứ tự deploy: sửa bộ lọc `quest_pool = 'general'` **trước hoặc cùng lúc** với việc insert template cuộc thi đầu tiên.
- Theo dõi tiến độ dùng lại `reading-event-service.ts` / `user_daily_tasks`, không có đường track thứ hai.

### 2. Contest Passport
```
contest_passport_milestones (contest_id, code, title, rule jsonb, sort_order)   -- FIRST_CONTEST_READ, READ_3_AUTHORS…
contest_passport_progress   (user_id, contest_id, milestone_code, progress, completed_at)  PK (user_id, contest_id, milestone_code)
contest_passport_events     (user_id, contest_id, milestone_code, source_ref)  UNIQUE → idempotent
```
- Không reset hằng ngày; tiến độ tăng chỉ khi insert `contest_passport_events` thành công (cùng sự kiện nguồn gửi 2 lần không cộng 2).
- Daily Contest Quest có thể đóng góp vào Passport qua cùng cơ chế event, nhưng là hai hệ thống riêng.
- `/cuoc-thi` hiện tóm tắt; `/cuoc-thi/[slug]` hiện đầy đủ.

---

## IX. AUTHOR WORKSPACE, MY CONTESTS, GAMIFICATION TÁC GIẢ

1. **Section "Cuộc thi" trong `/author/[bookId]`** — `src/components/author/book-contest-section.tsx`, nhúng vào `book-overview.tsx`.
   - API `GET /api/authoring/books/[bookId]/cuoc-thi` trả: bài dự thi của sách (trạng thái, lý do, deadline, capability), các cuộc thi đang mở kèm eligibility của sách này, link microsite.
   - Hành động: Nộp, Rút (theo `can_withdraw`), Xem bài dự thi, Nộp vào cuộc thi khác. Không lưu state contest vào `books`.
2. **`/author/contests`** — portfolio: tab **Đang diễn ra** / **Đã kết thúc**. Mỗi dòng: cuộc thi, sách, trạng thái, deadline, eligibility, thứ hạng (chỉ khi `rankings_visible`), analytics (Phase 2), giải thưởng (link về trang kết quả). API `GET /api/authoring/contests`.
3. **Gamification tác giả** — dùng `achievement_templates` / `user_achievements` hiện có (hoàn thiện bài dự thi, streak viết, số chương xuất bản, 100 độc giả đầu tiên…). Tách hẳn khỏi điểm thi.

---

## X. LƯU TRỮ & XUẤT XỨ GIẢI THƯỞNG

- Cuộc thi kết thúc chuyển `archived`; microsite tồn tại vĩnh viễn. Hard-delete bị chặn bằng trigger khi `status <> 'draft'`; mọi FK từ bảng contest dùng `restrict`.
- Lưu: thông tin cuộc thi, bài dự thi, lịch sử trạng thái, giải thưởng, `rules_version` + `rules_content` tại thời điểm công bố kết quả (Phase 3: bảng `contest_rules_versions` nếu cần lưu mọi bản sửa thể lệ).
- Award → submission → book → author qua FK; badge trên `/truyen/[slug]` và trang tác giả đọc từ view `contest_award_details` và link về `/cuoc-thi/[slug]#ket-qua`. Award chỉ công khai sau khi công bố kết quả (RLS + API).
- **Giải thưởng (D10, sửa 25/09/2026)**: công bố bằng VND (`prize_vnd`), quy đổi sang token theo tỷ giá lúc trao (`token_vnd_rate`, lấy từ `TOKEN_TO_VND_RATE`). **Admin chi trả thủ công** (Q6): bấm "Chi trả" trên từng giải ở `/admin/cuoc-thi`, không tự chi khi công bố kết quả.
  - Dùng lại luồng thưởng có sẵn `grant_platform_bonus()` (`POST /api/admin/bonus`, chú thích hàm đã ghi dùng cho "contest prize"): giao dịch `platform_bonus`, không có thời gian treo, không lẫn vào báo cáo doanh thu tác giả. **Không** thêm `transaction_type` mới.
  - RPC mới `pay_contest_award(p_award_id, p_admin_id)` (service_role): khoá dòng award; kiểm kết quả đã công bố, award chưa thu hồi, `payout_transaction_id is null`; gọi `grant_platform_bonus()` cho tác giả của bài với lý do "Giải <tên giải> — <tên cuộc thi>"; ghi `payout_transaction_id`, `paid_at`. Cùng một transaction → bấm 2 lần không chi 2 lần.
  - Award đã chi mà sau đó bị thu hồi: trừ lại bằng `admin_adjustment` có lý do, không sửa giao dịch cũ.
- Quà kèm không quy đổi được (hợp đồng xuất bản, banner trang chủ) nằm ở `prize_extras`, chỉ hiển thị.
- Award bị thu hồi vẫn hiển thị trong archive với nhãn "Đã thu hồi". Truyện đã bị xoá vẫn giữ tên, tác giả, giải; bìa và nội dung thay bằng "Tác phẩm không còn khả dụng". API archive đọc bằng service-role và tự dựng placeholder, không phụ thuộc policy SELECT công khai của `contest_submissions` (policy đó ẩn bài của sách đã gỡ).

---

## XI. ANALYTICS CHO TÁC GIẢ (Phase 2)

### 1. Chỉ số & nguồn
| Chỉ số | Nguồn có sẵn |
|---|---|
| Unique readers, return readers, completion rate | `reading_history` |
| Continue-to-next-chapter, drop-off | `reading_sessions` |
| Followers (trong khung cuộc thi) | `author_follows.created_at` |
| Votes | `contest_votes` |
| Comments / unique commenters | `anchored_comments` |

### 2. Traffic source — cần bổ sung
- Hiện **không có** ở đâu. Đề xuất: thêm cột tuỳ chọn `reading_sessions.source text check (source in ('contest','trending','search','profile','recommendation','other'))`, client gắn từ tham số link (ví dụ `?src=contest`).
- Chỉ dùng cho analytics, **không** đưa vào điểm (client tự khai được).
- Không tạo bảng tracking song song cho những gì đã có.

---

## XII. BẢO MẬT, MODERATION, HIỆU NĂNG

### 1. Bảo mật
- Route kiểm quyền bằng identity server; admin route dùng `getAuthedAdminId()` + `role in ('admin','super_admin')`.
- Không route nào nhận `authorId`, `status`, `score`, `eligibility` từ body. `author_id` do trigger ghi đè.
- Điểm giám khảo (Phase 2): bảng không có policy select; judge chỉ thấy điểm của chính mình; công khai tổng hợp khi `results_visible`.
- `contest_votes` không lộ danh sách người vote.

### 2. Moderation
- Sách bị gỡ (`deleted_at`) → bài biến mất ngay khỏi feed/ranking/vote (mọi truy vấn công khai join điều kiện sách hiển thị); **trạng thái bài không tự đổi** để khôi phục sách thì bài hiện lại. Danh sách admin của cuộc thi gắn cờ "sách đã bị gỡ" để admin quyết định `disqualified`.
- Chương bị gỡ (`removed_at`) → không tính vào thống kê/snapshot.
- Contest không tạo cơ chế đọc miễn phí riêng. Thay vào đó, sách dự thi bắt buộc miễn phí toàn bộ cho đến khi công bố kết quả (D8, IV.5).
- Trạng thái "sách đã bị gỡ" trong danh sách admin được **suy ra** từ `books.deleted_at`, không lưu thành cờ, để không có hai nguồn chân lý. Admin quyết định theo D4.
- Snapshot bị dọn cùng purge cron (V.4).

### 3. Hiệu năng
- Index đã liệt kê ở III.1 cho `contest_id`, `(contest_id, status, submitted_at, id)`, `book_id`, `author_id`, `(contest_id, user_id)` của vote, `(submission_id, created_at)` cho trending.
- Mọi feed/ranking tổng hợp trong SQL, phân trang keyset, không N+1 (1 truy vấn trả dữ liệu card).
- Phase 2: `contest_submission_scores` + index `(contest_id, kind, value desc, submission_id)` khi công thức nhiều tín hiệu làm việc tính khi đọc quá đắt.

---

## XIII. KIỂM THỬ

Hai lớp (D9):

1. **SQL test script** `docs/supabase/tests/20260926_contest_engine_core.test.sql` (và một file cho migration snapshot) — một khối `do $$ … $$` kết thúc bằng `raise exception` cố ý để rollback (SQL Editor của Supabase không giữ `begin/rollback`). Kiểm bất biến DB:
   - unique `(contest_id, book_id)` (nộp trùng); trigger ghi đè `author_id`;
   - FK tổng hợp vote/award lệch contest bị từ chối;
   - ma trận chuyển trạng thái contest & submission (chuyển sai bị raise);
   - vote: trùng; ngoài khung; tự vote bài mình; tài khoản < 7 ngày; chưa đọc hết chương nào của truyện; vote được nhiều bài khác nhau (không quota);
   - D8: đặt `price`/`audio_price` > 0 cho chương của sách đang dự thi bị từ chối (cả INSERT và UPDATE); đặt được lại sau khi cuộc thi sang `results`, sau khi rút bài, và với sách không dự thi; `submit_contest_entry()` từ chối sách còn chương có giá;
   - D11: `is_exclusive` `true → false` bị từ chối khi sách đang dự thi cuộc thi `require_exclusive` (cả với service-role); được phép với cuộc thi không yêu cầu độc quyền, sau khi rút bài/bị loại, sau khi cuộc thi sang `results`; `false → true` luôn được; `submit_contest_entry()` từ chối sách không độc quyền khi contest yêu cầu;
   - không xoá được contest đã công bố;
   - RLS: anon không thấy bài của sách bị gỡ, không thấy vote người khác, không thấy award trước khi công bố (kể cả qua view `contest_award_details`); authenticated không insert/update được bảng contest;
   - `contest_word_count` khớp `countWords` trên chuỗi mẫu (xuống dòng, tab, chuỗi rỗng, tiếng Việt).
2. **Unit test logic thuần bằng Vitest** — thêm `vitest` (devDependency), `vitest.config.ts` (alias `@/` như `tsconfig.json`), script `npm run test`, cập nhật mục Commands trong `CLAUDE.md` và `docs/DEV_WORKFLOW.md`. Phạm vi: rule eligibility, capabilities theo thời gian (mốc biên deadline, cron trễ), thứ tự ranking/đồng hạng, seed discover, parse cấu hình. Test không gọi Supabase; mọi thứ cần DB nằm ở lớp 1.

Ma trận yêu cầu → lớp kiểm thử:

| Kịch bản | Lớp |
|---|---|
| Nộp trùng, ngoài deadline, không đăng nhập, sách không sở hữu | Vitest (engine) + SQL (unique) + gọi API thật |
| Nộp sách có chương trả phí / đặt giá trong thời gian thi (D8) | Vitest (`no_paid_chapters`) + SQL (trigger, RPC) + thử form giá chương |
| Cuộc thi yêu cầu độc quyền: sách mặc định `true` nhưng chưa ký thỏa thuận, tắt độc quyền trong lúc thi (tác giả, PostgREST, admin) (D11) | Vitest (`require_exclusive`) + SQL (trigger, RPC) + thử nút độc quyền |
| Chuyển trạng thái contest, rút trước/sau deadline, nộp lại bật/tắt, disqualified | SQL + Vitest |
| Sửa trước/sau deadline → snapshot đúng bản | SQL/API (job đóng cổng) |
| Đóng cổng khi bài tụt điều kiện → chỉ gắn cờ, status giữ nguyên (D4) | SQL/API |
| Sách/chương bị gỡ | SQL (RLS) + Vitest (engine) |
| Ranking đồng điểm, phân trang ổn định | Vitest + SQL |
| Vote trùng / bài của chính mình / tài khoản mới / chưa đọc chương (D5) | SQL + Vitest (capability) |
| Lưu trữ, provenance award | SQL |
| Nhiều contest cùng mở, 1 sách nhiều contest | Vitest (`multi_contest`) |
| Quest cô lập, reroll event→event, Passport idempotent | SQL (Phase 3) |
| Migration với dữ liệu cũ; hồi quy Book/Chapter (comments, highlights, tiến độ, mua chương, **đặt giá chương cho sách không dự thi**, xoá/sắp xếp chương, audio, nhân vật) | Chạy migration trên dev + checklist thủ công theo `docs/DEV_WORKFLOW.md` |

Mỗi slice chỉ xong khi: migration + SQL test chạy trên dev/staging, `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, chạy thật route/UI (cả mobile width), và regression checklist. UI render được **không** phải là xong.

---

## XIV. QUYẾT ĐỊNH ĐÃ CHỐT (25/09/2026)

| # | Câu hỏi | Quyết định | Ảnh hưởng |
|---|---|---|---|
| D1 | Route công khai | **`/cuoc-thi`**, `/cuoc-thi/[slug]` (xác nhận lại sau khi đối chiếu thiết kế dùng `/contests`) | Trang ở `src/app/cuoc-thi/`. API giữ `/api/contests/*`, trang tác giả giữ `/author/contests` theo namespace tiếng Anh sẵn có. Ánh xạ route thiết kế ở XIX.1 |
| D2 | Duyệt bài mới | **Tự động** → `eligible` ngay khi nộp | IV.3; admin vẫn chuyển `ineligible`/`disqualified` được |
| D3 | Snapshot | **Phase 1** (Slice 1.6) | V.5; không cuộc thi thật nào đóng cổng trước khi 1.6 xong |
| D4 | Bài tụt điều kiện lúc đóng cổng | **Chỉ gắn cờ**, admin quyết | `review_flags`, V.3 |
| D5 | Luật vote | **1 vote / bài dự thi / tài khoản, không giới hạn số bài**; bắt buộc **đã đọc hết ≥ 1 chương** của truyện đó; **tài khoản ≥ 7 ngày**. Xác nhận lại 25/09/2026: **không** dùng "3 phiếu/người" của thiết kế (thiết kế tự ghi là giả định) | VII.5, `cast_contest_vote()`; UI bỏ "Còn x/3 phiếu" và "Hết phiếu" |
| D6 | Rút / nộp lại | **Rút trước deadline**; nộp lại **cấu hình theo cuộc thi** (mặc định tắt) | IV.4, capability `can_withdraw`/`can_resubmit` |
| D7 | Popular Phase 1 | **Chỉ đếm vote hợp lệ** | VII.1 |
| D8 | Chương trả phí | **Không được thu phí** (cả `price` và `audio_price`) từ lúc nộp **đến khi công bố kết quả** (`results`) | IV.5, trigger + RPC + rule |
| D9 | Test runner | **Thêm Vitest** cho logic thuần | XIII |
| D10 | Giải thưởng | Công bố bằng VND, **quy đổi sang token**, lưu tỷ giá lúc trao. **Admin chi trả thủ công** từng giải qua `pay_contest_award()` → `grant_platform_bonus()` có sẵn (Phase 1, Slice 1.7) | X, `contest_awards` |
| D11 | Cuộc thi yêu cầu độc quyền | Nộp: `is_exclusive = true` **và** thỏa thuận bản hiện hành. Trong lúc thi: **chặn cứng** tắt độc quyền (cả admin) đến khi công bố kết quả | IV.6, trigger trên `books` + RPC + rule |
| D12 | Lời hiển thị sau khi đóng nhận bài | "Bản dự thi đã được chốt; chỉnh sửa sau thời điểm này không tính vào bản chấm" (thay cho "tác giả không thể chỉnh sửa" trong thiết kế) | V.1; microsite, panel tác giả |

---

## XV. DANH SÁCH FILE

### Tạo mới — Phase 1
- **DB**: `migrations/20260926_add_contest_engine_core.sql`, `docs/supabase/tests/20260926_contest_engine_core.test.sql`, `migrations/2026xxxx_add_contest_submission_snapshots.sql` + test (Slice 1.6, D3).
- **Domain** `src/lib/contests/`: `types.ts`, `config.ts` (parse/validate + default), `capabilities.ts`, `eligibility/` (engine + `rules/*.ts`), `contest-service.ts`, `submission-service.ts`, `vote-service.ts`, `ranking-service.ts`, `feeds.ts`, `scoring/formulas/popular-v1.ts`, `snapshot-service.ts`.
- **API công khai**: `src/app/api/contests/route.ts`, `[slug]/route.ts`, `[slug]/eligibility/route.ts`, `[slug]/submissions/route.ts` (GET feed, POST nộp), `[slug]/submissions/[submissionId]/withdraw/route.ts`, `[slug]/submissions/[submissionId]/vote/route.ts` (POST/DELETE), `[slug]/rankings/route.ts`, `cron/advance/route.ts`.
- **API tác giả**: `src/app/api/authoring/contests/route.ts`, `src/app/api/authoring/books/[bookId]/cuoc-thi/route.ts` (khớp cấu trúc thư mục `api/authoring` khi code).
- **API admin**: `src/app/api/admin/contests/route.ts`, `[contestId]/route.ts`, `[contestId]/status/route.ts`, `[contestId]/submissions/[submissionId]/status/route.ts`, `[contestId]/awards/route.ts`.
- **Trang**: `src/app/cuoc-thi/page.tsx`, `src/app/cuoc-thi/[slug]/page.tsx`, `src/app/author/contests/page.tsx`, `src/app/admin/cuoc-thi/…` (danh sách, tạo/sửa, duyệt bài, trao giải).
- **Component** `src/components/contests/`: `contest-card.tsx`, `submission-card.tsx`, `submit-dialog.tsx`, `eligibility-checklist.tsx`, `contest-feed-tabs.tsx`, `ranking-table.tsx`, `vote-button.tsx`, `contest-badge.tsx`; `src/components/author/book-contest-section.tsx`. Dùng kit `src/components/ui/`, màu qua token `globals.css`.

### Sửa
- `docs/supabase/schema.sql`, `src/lib/supabase/types.ts` — mirror migration.
- `vercel.json` — thêm cron `/api/contests/cron/advance`.
- `src/components/nav-strip-links.tsx`, `src/components/mobile-nav-drawer.tsx` — mục "Cuộc thi".
- `src/components/author/book-overview.tsx` — nhúng section Cuộc thi.
- `src/app/truyen/[slug]/page.tsx` — badge đang dự thi / đoạt giải.
- `src/app/api/admin/cron/purge-deleted-content/route.ts` — dọn snapshot (D3).
- `src/app/api/authoring/chapters/[chapterId]/route.ts` (và route mobile tương ứng) — chuyển lỗi trigger D8 (`check_violation`) thành 409 tiếng Việt.
- `src/components/author/chapter-editor.tsx`, `publish-panel.tsx` — khoá ô giá chương/giá audio khi sách đang dự thi (D8).
- `src/app/api/authoring/books/[bookId]/route.ts`, `src/app/api/admin/books/[bookId]/route.ts` — chuyển lỗi trigger D11 (`hint = 'contest_exclusive_lock'`) thành 409 tiếng Việt.
- `src/components/author/publish-panel.tsx`, `author-workspace.tsx`, `src/components/admin/content-table.tsx` — khoá/giải thích nút độc quyền khi sách đang dự thi cuộc thi yêu cầu độc quyền (D11).
- `package.json` (devDependency `vitest`, script `test`), `vitest.config.ts` (mới), `CLAUDE.md` + `docs/DEV_WORKFLOW.md` (thêm `npm run test` vào quy trình kiểm tra) — D9.
- **Không sửa** `src/proxy.ts` (đã guard `/author/:path*`).

### Sửa ở phase sau
- Phase 2: `reading_sessions` (cột `source`), client đọc chương (gắn `source`).
- Phase 3: `task_templates`, `user_quest_pool`, `reset_quest_pool_slot()`, `src/lib/quests/quest-pool-service.ts`.

---

## XVI. KẾ HOẠCH TRIỂN KHAI THEO DEPENDENCY

```
Phase 1 — Contest MVP
 1.1 Migration core + RPC + RLS + SQL test + schema.sql + types.ts
      └─► 1.2 Domain lib: config, capabilities, eligibility engine, services, ranking popular
             ├─► 1.3 Admin: tạo/sửa cuộc thi, chuyển trạng thái, duyệt bài, trao giải
             │        (cần có trước để có dữ liệu thật cho 1.4)
             ├─► 1.4 Hub /cuoc-thi + microsite /cuoc-thi/[slug]: thể lệ, feed new/popular/discover,
             │        vote, CTA theo capability
             ├─► 1.5 Nộp bài 2 luồng + section Cuộc thi trong /author/[bookId] + /author/contests
             ├─► 1.6 Đóng cổng: cron advance + snapshot + purge cron (bắt buộc trước khi cuộc thi thật đầu tiên đóng cổng)
             └─► 1.7 Badge trên /truyen/[slug], trang kết quả, archive
 Mỗi slice: DB + logic + phân quyền + API + UI (desktop + mobile) + trạng thái rỗng/lỗi + test

Phase 2 — Fair Competition   (cần Phase 1 ổn định)
 signals valid reader/meaningful read → scores table + công thức popular-v2 → trending + hidden gems
 → fraud signals → judges + rubric + dashboard (đọc snapshot) → final score → analytics + traffic source

Phase 3 — Contest Engine   (cần Phase 2)
 rounds/shortlist → phân công & chấm ẩn danh → Contest Quest (quest_pool, event slot) → Passport
 → giải theo hạng mục, chứng nhận, chi trả prize qua ledger → portfolio nâng cao
```

---

## XVII. RỦI RO & TƯƠNG THÍCH NGƯỢC

| Rủi ro | Giảm thiểu |
|---|---|
| Quest cuộc thi lọt vào pool chung | Bộ lọc `quest_pool = 'general'` deploy trước template cuộc thi; unique index event slot |
| Cron trễ làm mở/đóng cổng sai | Capability kiểm cả thời gian; cron chỉ bắt kịp |
| Chấm nhầm phiên bản | Snapshot nội dung đầy đủ lúc đóng cổng (D3) |
| Snapshot giữ nội dung đã gỡ | Purge cron dọn snapshot |
| Lộ điểm giám khảo / danh sách vote | Điểm ở bảng riêng không có policy select; vote chỉ thấy của mình |
| `is_exclusive` mặc định `true` không phản ánh độc quyền thật | Rule `require_exclusive` kiểm thêm thỏa thuận bản hiện hành (D11) |
| Tác giả tắt độc quyền sau khi nộp (trong 3 ngày đầu, hoặc gọi thẳng PostgREST) | Trigger `books_block_exclusive_off_during_contest` (D11) |
| Trigger D11 chặn cả admin override trên `/admin/noi-dung` | Có chủ đích: admin loại bài trước (có lý do, có nhật ký), route trả 409 giải thích |
| Đếm từ SQL lệch với `countWords` JS | SQL test so sánh trên chuỗi mẫu |
| Xoá tài khoản trong tương lai vướng RESTRICT | Ghi chú cho tính năng xoá tài khoản |

Phase 1 chỉ **thêm** bảng/hàm/index/policy mới, không đổi cột hay policy của bảng hiện có → dữ liệu books/users cũ không cần backfill.

---

## XVIII. THAY ĐỔI SO VỚI BẢN TRƯỚC

- Sửa rule dùng `books.removed_at` (không tồn tại) → `deleted_at` + `removed_by`.
- Bỏ giả định `chapters.word_count`; thêm `contest_word_count()` / `get_book_contest_stats()`.
- Chuyển điểm số khỏi `contest_submissions` (tránh lộ `jury_score`); thêm bảng điểm riêng ở Phase 2.
- RLS: bỏ `select using (true)` trên `contest_votes`; bỏ policy INSERT submission yếu; submission công khai phải kèm điều kiện sách còn hiển thị và contest không nháp; award chỉ công khai sau khi công bố.
- `author_id` do trigger ghi từ `books`; FK tổng hợp để vote/award không lệch contest.
- Giải quyết mâu thuẫn unique vs nộp lại: nộp lại cập nhật cùng dòng + nhật ký sự kiện.
- Snapshot lưu nội dung đầy đủ (không chỉ hash) và được purge cùng nội dung gỡ; nêu rõ nợ kỹ thuật nếu hoãn.
- Thêm ma trận trạng thái, người/cơ chế chuyển trạng thái, capability API, luật vote (1 vote/bài, đã đọc hết ≥ 1 chương, tài khoản ≥ 7 ngày), tie-break tất định có `id`, lưu phiên bản thể lệ đã chấp nhận.
- Bổ sung phần còn thiếu: admin UI, discovery feeds, analytics + traffic source, thiết kế quest/passport có ràng buộc DB, kế hoạch kiểm thử, danh sách quyết định mở.
- Migration idempotent theo quy ước dự án; enum chữ thường; bỏ sửa `proxy.ts` không cần thiết.
- 25/09/2026: ghi các quyết định D1–D10 — route `/cuoc-thi`; duyệt tự động; snapshot ở Phase 1; cờ `review_flags` cho admin; luật vote D5; `can_resubmit`; cấm thu phí chương/audio khi dự thi (trigger + RPC `submit_contest_entry()` + rule); Vitest.
- 25/09/2026: xác minh nguồn chân lý độc quyền là `books.is_exclusive`; ghi D11 — rule `require_exclusive` kiểm cờ + thỏa thuận bản hiện hành, trigger trên `books` chặn cứng tắt độc quyền trong lúc thi (cả admin); `submit_contest_entry()` khoá thêm dòng sách; hai trigger dùng `hint` riêng để route phân biệt lỗi.
- 25/09/2026: đối chiếu thiết kế Claude Design (project "Thiết kế website Vịnh": `Vịnh Cuộc thi.dc.html`, `Vịnh Cuộc thi Tác giả.dc.html`, `Vịnh Cuộc thi Đặc tả.dc.html`) — thêm mục XIX; giữ D1 và D5; thêm D12; sửa D10 (VND → token, cột giải thưởng, thu hồi giải).

---

## XIX. ĐỐI CHIẾU THIẾT KẾ (Claude Design, 25/09/2026)

Nguồn: project Claude Design "Thiết kế website Vịnh" — prototype độc giả, prototype tác giả, đặc tả UX. `support.js` là runtime hiển thị prototype của Claude Design, không phải code của Vịnh; không port. Thiết kế là mock tĩnh cố định 1280px → dựng lại bằng component Next.js + kit `src/components/ui/`, mobile theo mục 6 của đặc tả.

### 1. Ánh xạ route

| Thiết kế | Vịnh |
|---|---|
| `/contests` | `/cuoc-thi` (D1) |
| `/contests/[slug]?tab=kham-pha\|bai\|bxh\|the-le\|giai`; khi RESULTS/ARCHIVED: `ket-qua\|tac-pham\|giai\|the-le\|dau-an` | `/cuoc-thi/[slug]?tab=…` (giữ tên tab tiếng Việt). URL không đổi suốt vòng đời, chỉ đổi bộ tab |
| `/story/[id]` + contest card | `/truyen/[slug]` |
| `/studio/[story]` › mục CUỘC THI | `/author/[bookId]` (section đầy đủ) + thẻ trạng thái gọn trong panel "Thông tin truyện" của trình soạn chương `/author/[bookId]/[chapterId]` |
| `/studio/contests` | `/author/contests` |
| `/studio/contests/[slug]/stats` | `/author/contests/[slug]/stats` (Phase 2 — analytics) |

### 2. Nhận từ thiết kế vào kế hoạch

- **Lifecycle theo phase** (bảng mục 7 đặc tả): CTA chính, banner, trạng thái tác giả, trạng thái Passport cho từng phase. Chuyển thành bảng hằng số trong `src/lib/contests/phase-copy.ts` (lời hiển thị), tách khỏi `capabilities.ts` (quyền).
- **Capability bổ sung**: `next_change_at` (mốc thời gian gần nhất làm đổi capability) để UI tự đổi phase đúng hạn mà không cần reload; `closing_soon` (còn < 48 giờ) cho chip "Sắp đóng" và countdown giờ:phút.
- **Khoá xếp hạng**: jury/final khoá tới `results`; popular mở khi `community_voting`; trending mở từ khi có bài (Phase 2). Khớp VI.2.
- **Bài dự thi**: mặc định sắp xếp "Ngẫu nhiên" (seed như feed `discover`), thêm "Mới nhất" và "A–Z"; lọc thể loại.
- **Stepper 6 chặng công khai** (Công bố, Nhận bài, Đóng bài, Bình chọn, Chấm giải, Kết quả): ngày "Công bố" lấy từ `contest_status_events` (lần chuyển sang `announced`).
- **Tab Dấu ấn**: chụp thống kê mùa thi thành `contests.legacy_stats jsonb` khi chuyển `archived` (không tính lại mỗi lần xem); timeline lấy từ `contest_status_events`.
- **Rút bài**: xác nhận 2 bước; phiếu đã có vẫn giữ trong DB nhưng không tính vào ranking khi bài không còn `eligible/shortlisted`.
- **Chưa đăng nhập**: đọc/khám phá bình thường; bình chọn / nộp bài mở màn đăng nhập rồi quay lại đúng hành động.
- **Múi giờ**: mọi hạn hiển thị giờ Việt Nam (GMT+7).
- **Trạng thái rỗng / đang tải / lỗi**: skeleton cùng kích thước card, lỗi từng hàng không làm hỏng cả trang, gửi bài lỗi giữ nguyên modal và checkbox.
- **Rule eligibility bổ sung** (từ thể lệ mẫu và modal nộp bài): `max_entries_per_author`, `no_prior_awards` (chưa từng đạt giải — dựa trên `contest_awards` chưa thu hồi), `first_published_after` (theo `books.published_at`). Mỗi kết quả kiểm trả số liệu thật cho UI (vd "Hiện có 18.240 chữ — vượt 13.240 chữ", "Chương 1 đăng 02/10/2026").
- **Cam kết lúc nộp**: checkbox "Tôi đã đọc và đồng ý thể lệ… Tôi xác nhận đây là tác phẩm gốc của tôi" — lưu cùng `rules_version_accepted`.
- **Khoá công thức chấm**: `scoring_config` không sửa được sau `voting_start` (validate ở admin API + trigger).
- **Hai nghĩa của "độc quyền"**: thể lệ mẫu dùng "độc quyền" theo nghĩa *chỉ dự thi cuộc thi này* (rule `multi_contest`). D11 là *độc quyền phân phối trên Vịnh* (`is_exclusive`). UI dùng hai nhãn khác nhau: "Chỉ dự thi cuộc thi này" và "Độc quyền trên Vịnh".
- **Token màu**: 6 màu thiết kế chưa có token trong `globals.css` (`#F7EFD8`, `#EBDCB4`, `#DDE6EA`, `#C7D6DD`, `#6b5f3a`, `#2f7d5b`) → thêm token mới hoặc dùng token gần nhất (`#2f7d5b` ≈ success `#2F7A4F`); không hardcode hex.

### 3. Thiết kế có nhưng để phase sau

| Phần | Phase | Ghi chú |
|---|---|---|
| Nhiệm vụ sự kiện + Passport (sidebar microsite, "Hành trình của bạn" ở hub, huy hiệu "Người đi hết mùa thi") | 3 | Phase 1–2 ẩn các khối này. Thiết kế đề xuất đổi nhiệm vụ sự kiện **1 lần/ngày** (reroll hiện có: 3 lần/ngày) — chốt khi làm Phase 3 |
| Trending / "Đang tăng tốc" | 2 | Ẩn qua `available_feeds` |
| Cột "Thay đổi" ▲▼ trong BXH | 2 | Cần lưu thứ hạng theo ngày. Mobile bỏ cột này |
| Analytics tác giả (8 KPI, nguồn độc giả, giữ chân theo chương), "độc giả từ cuộc thi" | 2 | Cần traffic source (XI.2) |
| Lọc hàng discovery theo độ tuổi 16+/18+ | — | Repo chưa có cột xếp hạng độ tuổi; ngoài phạm vi contest |

### 4. Câu hỏi — kết quả chốt 25/09/2026

| # | Câu hỏi | Kết quả |
|---|---|---|
| Q1 | **Thời điểm chụp snapshot.** Cron chạy 1 lần/ngày → có thể chụp muộn gần 24 giờ, lẫn chỉnh sửa sau hạn | **Đã chốt: snapshot-on-write + cron bắt kịp**. Xem XIX.5 |
| Q2 | **Trạng thái "Cần bổ sung"** | **Đã chốt 26/09/2026: giữ.** Dùng `review_flags` (D4), không thêm trạng thái. Xem XIX.6 |
| Q3 | **Số phiếu trong lúc bình chọn** | **Đã chốt**: ẩn số phiếu nhưng **vẫn hiện hạng** để tạo ganh đua. Microsite có 2 khối: **"Top truyện"** (top 5 theo phiếu hợp lệ, có hạng, không số phiếu; bấm vào mở BXH đầy đủ có hạng) và **"Truyện đề xuất"** (ngẫu nhiên, seed như feed `discover`). Đồng điểm → cùng hạng. Số phiếu công bố khi hết khung vote. Tác giả thấy hạng của bài mình |
| Q4 | **"Nhắc tôi khi mở"** | **Đã chốt**: Phase 1. Bảng `contest_reminders (contest_id, user_id)` + gửi qua `/api/notifications` sẵn có khi cuộc thi sang `submission_open` |
| Q5 | **Thể lệ đổi giữa chừng** | **Đã chốt: thể lệ không đổi.** Trigger khoá `rules_content`, `rules_version`, `eligibility_rules`, `vote_rules` khi cuộc thi rời `draft` (đã công khai). Sai sót phải phát hiện ở `draft`. `rules_version_accepted` vẫn lưu làm bằng chứng |
| Q6 | **Chi trả giải** | **Đã chốt: admin chi thủ công** từng giải, dùng lại `grant_platform_bonus()`. Xem X |
| Q7 | Điều kiện "đủ 16 tuổi", "đã xác minh email" | **Đã chốt** (xem dòng dưới) |
| Q7 | Điều kiện "đủ 16 tuổi", "đã xác minh email" trong thể lệ mẫu | Đã kiểm: `profiles.date_of_birth` có nhưng **nullable** (chỉ dùng tự điền hợp đồng); email xác minh có ở `auth.users.email_confirmed_at`. Đề xuất rule `min_author_age`: thiếu ngày sinh → chặn kèm hướng dẫn cập nhật hồ sơ; rule `email_verified` kiểm tự động |

### 5. Snapshot-on-write (Q1)

Mục tiêu: bản chấm **đúng bằng** trạng thái sách tại `submission_end`, dù cron chạy trễ.

- **Không cần so nội dung để biết sách có bị sửa.** Trigger chạy **ngay trong lúc ghi**, nên việc có thao tác ghi đã là tín hiệu "sắp bị sửa". Trigger chỉ cần một câu hỏi rẻ: *bài dự thi của sách này ở cuộc thi đã quá hạn đã có snapshot chưa?* (`exists` trên index).
- **Luồng**: lần ghi **đầu tiên** sau `submission_end` vào chương/sách của một bài dự thi chưa có snapshot → trigger `BEFORE` chụp toàn bộ sách, trong đó dòng đang bị sửa lấy giá trị `OLD` (trước khi sửa), các dòng khác lấy giá trị hiện tại (chưa ai sửa từ lúc hạn, nếu không trigger đã chạy trước đó). Sau đó mới cho ghi. Các lần ghi sau thấy snapshot đã có → bỏ qua ngay.
- **Các đường ghi phải được bắt**: sửa/xuất bản/gỡ chương (`update` trên `chapters`), thêm chương mới (`insert` — chương mới không vào snapshot), `reorder_book_chapters()` (đổi `order_index`), admin gỡ chương (`removed_at`), sửa tựa/tóm tắt/thể loại/tag sách (`update` trên `books`). Xoá chỉ áp dụng cho chương nháp → không ảnh hưởng.
- **Cron bắt kịp** (`/api/contests/cron/advance`): chụp các bài **chưa có snapshot** — tức là sách **không** bị sửa từ lúc hạn, nên trạng thái hiện tại chính là trạng thái lúc hạn. Idempotent nhờ unique `(submission_id, reason)`.
- **Chỉ các bài `submitted/eligible/shortlisted`** được chụp; bài đã rút/loại bỏ qua.
- `content_hash` (sha256) vẫn lưu, nhưng chỉ để Phase 2 hiện "đã sửa sau hạn" trên màn giám khảo — không dùng để quyết định có chụp hay không.
- **Chi phí**: sau hạn, mỗi thao tác ghi chương của sách dự thi tốn thêm 1 truy vấn `exists`; chỉ lần đầu tiên tốn thêm việc chụp (copy nội dung các chương đang hiển thị). Sách không dự thi: 1 truy vấn `exists` trả `false`.
- **Test** (SQL): sửa chương sau hạn → snapshot chứa nội dung cũ; sửa 2 lần → chỉ 1 snapshot; thêm chương sau hạn → không vào snapshot; đổi thứ tự sau hạn → snapshot giữ thứ tự cũ; sách không sửa → cron chụp; cron chạy 2 lần → không trùng.

### 6. "Cần bổ sung" — đã chốt giữ (Q2, 26/09/2026)

Dùng khi bài **vẫn hợp lệ về nguyên tắc** nhưng có thiếu sót **sửa được**, và BTC muốn cho tác giả cơ hội sửa trước khi loại. Hai nguồn:

1. **Hệ thống tự gắn lúc đóng cổng** (D4): bài tụt điều kiện sau khi nộp — vd tác giả gỡ chương nên còn dưới số chương tối thiểu, hoặc tổng số chữ tụt dưới ngưỡng.
2. **Admin gắn khi rà bài**: lỗi mà rule tự động không bắt được — vd tóm tắt quá ngắn / sơ sài, thiếu bìa, sai thể loại so với nội dung, tựa hoặc bìa vi phạm quy định trình bày.

Tác giả thấy cảnh báo trong "Cuộc thi của tôi" và panel Cuộc thi (vd "thiếu tóm tắt ≥ 50 chữ, bổ sung trước 23:59 31/10 để giữ tư cách dự thi"). Bài vẫn hiển thị, vẫn được đọc và bình chọn. Hết hạn mà chưa sửa → admin chuyển `ineligible`/`disqualified` hoặc gỡ cờ.

Nếu không có "Cần bổ sung", mọi thiếu sót chỉ có hai lựa chọn: bỏ qua, hoặc loại ngay.

**Cách lưu** — mỗi phần tử của `contest_submissions.review_flags`:

```json
{
  "id": "uuid",
  "code": "below_min_chapters_at_close | synopsis_too_short | …",
  "source": "system | admin",
  "message": "Thông báo tiếng Việt cho tác giả",
  "visible_to_author": true,
  "fix_by": "2026-10-31T16:59:00Z",
  "created_at": "…", "created_by": "uuid | null",
  "resolved_at": null, "resolved_by": null, "resolution": "fixed | dismissed | escalated"
}
```

- Nhãn "Cần bổ sung" được **suy ra**: bài có ít nhất 1 cờ `visible_to_author` chưa `resolved_at`. Không thêm giá trị vào `contest_submission_status`.
- Chỉ admin/system ghi cờ (qua RPC service-role, ghi kèm `contest_submission_events`). Tác giả không tự gỡ cờ; sau khi sửa, admin xác nhận `fixed`.
- Cờ `system` gắn lúc đóng cổng có thể được hệ thống tự gỡ (`fixed`) nếu lần kiểm lại sau đó đạt điều kiện.
- Thay cho cặp cột `flags_resolved_at` / `flags_resolved_by` cấp bài ở III.1 (trạng thái xử lý nằm trong từng cờ).
- Capability: `viewer_submission.needs_revision`, `viewer_submission.revision_deadline` (hạn sớm nhất trong các cờ đang mở).

