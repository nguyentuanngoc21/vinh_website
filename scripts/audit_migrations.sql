-- Audit: đã chạy migration nào trên project thật chưa — 1 dòng/file,
-- kiểm 1 marker đại diện (cột/bảng/enum/hàm do đúng file đó tạo).
-- true = đã chạy (marker tồn tại). false = CHƯA chạy.
select '20260806_add_penalty_percent' as migration,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='transactions' and column_name='penalty_percent') as applied
union all
select '20260807_wallet_ledger_extension',
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='transactions' and column_name='status')
union all
select '20260819_add_book_genre',
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='books' and column_name='genre')
union all
select '20260820_add_chapter_price',
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='chapters' and column_name='price')
union all
select '20260824_add_author_follows',
  exists(select 1 from information_schema.tables where table_schema='public' and table_name='author_follows')
union all
select '20260824_add_book_progress',
  exists(select 1 from information_schema.tables where table_schema='public' and table_name='book_progress')
union all
select '20260824_add_book_tags_and_view_count',
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='books' and column_name='tags')
union all
select '20260824_add_chapter_is_last',
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='chapters' and column_name='is_last_chapter')
union all
select '20260824_add_chapter_votes',
  exists(select 1 from information_schema.tables where table_schema='public' and table_name='chapter_votes')
union all
select '20260824_add_reading_lists',
  exists(select 1 from information_schema.tables where table_schema='public' and table_name='reading_lists')
union all
select '20260826_add_book_exclusivity',
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='books' and column_name='is_exclusive')
union all
select '20260826_add_book_soft_delete',
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='books' and column_name='deleted_at')
union all
select '20260826_add_profile_bank_info',
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='bank_code')
union all
select '20260827_add_bank_account_name',
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='bank_account_name')
union all
select '20260827_add_profile_bio',
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='bio')
union all
select '20260828_add_profile_cover_image',
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='cover_image_url')
-- --- Quest System (hôm nay) ---
union all
select '20260827_extend_task_templates_for_quests',
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='task_templates' and column_name='quest_type')
union all
select '20260827_add_quest_examples_pool',
  exists(select 1 from information_schema.tables where table_schema='public' and table_name='quest_examples_pool')
union all
select '20260827_add_hidden_quests',
  exists(select 1 from information_schema.tables where table_schema='public' and table_name='hidden_quests')
union all
select '20260827_add_quest_reset_events',
  exists(select 1 from information_schema.tables where table_schema='public' and table_name='quest_reset_events')
union all
select '20260827_add_reading_behavior_tables',
  exists(select 1 from information_schema.tables where table_schema='public' and table_name='highlights')
union all
select '20260827_add_anchored_comments',
  exists(select 1 from information_schema.tables where table_schema='public' and table_name='anchored_comments')
union all
select '20260827_add_quest_reward_transaction_type',
  exists(select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname='transaction_type' and e.enumlabel='quest_reward')
union all
select '20260827_add_quest_streak_to_profiles',
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='current_quest_streak')
union all
select '20260827_add_streak_bonus_transaction_type',
  exists(select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname='transaction_type' and e.enumlabel='streak_bonus')
union all
select '20260827_add_streak_rescue_transaction_type',
  exists(select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname='transaction_type' and e.enumlabel='streak_rescue')
union all
select '20260827_add_streak_milestones',
  exists(select 1 from information_schema.tables where table_schema='public' and table_name='streak_milestones')
union all
select '20260827_add_streak_sync_functions',
  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sync_reading_streak')
order by 1;
