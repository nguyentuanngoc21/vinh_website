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
-- --- Đợt 2026-08-25 -> 2026-08-31 (đã bỏ sót khi audit này viết lần đầu) ---
union all
select '20260825_restrict_books_column_grants',
  exists(select 1 from information_schema.column_privileges where table_schema='public' and table_name='books' and grantee='authenticated' and column_name='title' and privilege_type='UPDATE')
  and not exists(select 1 from information_schema.column_privileges where table_schema='public' and table_name='books' and grantee='authenticated' and column_name='view_count' and privilege_type='UPDATE')
union all
select '20260825_update_book_genres',
  exists(select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
         where t.relname = 'books' and c.conname = 'books_genre_check'
           and pg_get_constraintdef(c.oid) like '%Đời sống - Xã hội%')
union all
select '20260827_drop_stale_apply_transaction_overloads',
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='apply_transaction') = 1
union all
select '20260827_restrict_profiles_column_grants',
  not exists(select 1 from information_schema.column_privileges where table_schema='public' and table_name='profiles' and grantee='authenticated' and privilege_type='UPDATE')
union all
select '20260827_restrict_sensitive_rpc_execute_grants',
  not exists(select 1 from information_schema.routine_privileges where routine_schema='public' and routine_name='apply_transaction' and grantee='authenticated' and privilege_type='EXECUTE')
union all
select '20260828_add_agreement_acceptances',
  exists(select 1 from information_schema.tables where table_schema='public' and table_name='agreement_acceptances')
union all
select '20260828_add_direct_messages',
  exists(select 1 from information_schema.tables where table_schema='public' and table_name='direct_messages')
union all
select '20260828_add_quest_generation_jobs',
  exists(select 1 from information_schema.tables where table_schema='public' and table_name='quest_generation_jobs')
union all
select '20260828_add_user_quest_pool',
  exists(select 1 from information_schema.tables where table_schema='public' and table_name='user_quest_pool')
union all
select '20260828_extend_author_public_profiles',
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='author_public_profiles' and column_name='bio')
union all
select '20260829_add_author_contract_fields',
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='date_of_birth')
  and exists(select 1 from information_schema.columns where table_schema='public' and table_name='identity_verifications' and column_name='cccd_issued_at')
union all
select '20260831_add_book_read_counts_daily',
  exists(select 1 from information_schema.views where table_schema='public' and table_name='book_read_counts_daily')
-- --- Hệ thống giao dịch commission (2026-09-01) ---
union all
select '20260901_add_blogger_creator_tag',
  exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='creator_tag' and e.enumlabel='blogger')
union all
select '20260901_add_order_earning_transaction_type',
  exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='transaction_type' and e.enumlabel='order_earning')
union all
select '20260901_add_order_payment_transaction_type',
  exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='transaction_type' and e.enumlabel='order_payment')
union all
select '20260901_add_order_system_core',
  exists(select 1 from information_schema.tables where table_schema='public' and table_name='orders')
  and exists(select 1 from information_schema.tables where table_schema='public' and table_name='order_events')
  and exists(select 1 from information_schema.tables where table_schema='public' and table_name='service_listings')
  and exists(select 1 from information_schema.tables where table_schema='public' and table_name='service_samples')
  and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='confirm_order_received')
union all
select '20260901_add_service_tag_catalog',
  exists(select 1 from information_schema.tables where table_schema='public' and table_name='service_tag_options')
  and exists(select 1 from information_schema.tables where table_schema='public' and table_name='service_tag_suggestions')
  and exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='is_private')
union all
select '20260901_add_manuscript_share',
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='books' and column_name='finalized_at')
  and exists(select 1 from information_schema.tables where table_schema='public' and table_name='manuscript_access_grants')
  and exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='book_id')
  and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='attach_order_book')
union all
select '20260901_add_order_delivery_assets',
  exists(select 1 from storage.buckets where id = 'order-deliverables')
  and exists(select 1 from information_schema.tables where table_schema='public' and table_name='order_delivered_assets')
  and exists(select 1 from information_schema.tables where table_schema='public' and table_name='order_file_requests')
  and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='resolve_order_file_request')
union all
select '20260901_add_order_refund_transaction_type',
  exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='transaction_type' and e.enumlabel='order_refund')
union all
select '20260901_add_order_cancel_system',
  exists(select 1 from information_schema.tables where table_schema='public' and table_name='order_cancel_requests')
  and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='calculate_refund')
  and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_lost_contact_report')
union all
select '20260901_add_ghostwriting_authorship',
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='books' and column_name='is_ghostwritten')
  and exists(select 1 from information_schema.columns where table_schema='public' and table_name='books' and column_name='author_display')
  and exists(select 1 from information_schema.tables where table_schema='public' and table_name='author_name_agreements')
  and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='confirm_author_name_agreement')
union all
select '20260901_add_trust_and_disputes',
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='trust_orders_completed')
  and exists(select 1 from information_schema.columns where table_schema='public' and table_name='direct_messages' and column_name='flagged_off_platform')
  and exists(select 1 from information_schema.tables where table_schema='public' and table_name='disputes')
  and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='resolve_dispute')
union all
-- CREATE OR REPLACE (không thêm bảng/cột mới) — marker soi thẳng vào mã
-- nguồn hàm (pg_proc.prosrc) tìm dòng đặc trưng CHỈ có ở bản mới (vế
-- seller-fault tra bảng sàn 90% ở mốc draft_pending — bản cũ luôn hằng
-- số 100%, không có chuỗi '90' này ở nhánh đó).
select '20260901_add_order_refund_minimum_table',
  exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'calculate_refund'
      and p.prosrc like '%when ''draft_pending'' then 90%'
  )
union all
-- Metadata tier/rule/multi/optional/warn_text thêm cho service_tag_options
-- (đối chiếu lại TAG_GROUPS/VOICE_GROUPS trong Vịnh Cá nhân.dc.html sau
-- khi người dùng báo giao diện tag sai — xem
-- migrations/20260901_add_service_tag_option_metadata.sql).
select '20260901_add_service_tag_option_metadata',
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='service_tag_options' and column_name='tier')
  and exists(select 1 from information_schema.columns where table_schema='public' and table_name='service_tag_options' and column_name='warn_text')
order by 1;
