-- Migration: real week/month/quarter numbers for /rankings' "Truyện chữ"
-- tab (src/lib/rankings/get-book-rankings.ts). Until now that tab only had
-- books.view_count — a single all-time running total, no timestamps — so
-- there was nothing to bucket into a genuine week/month/quarter split or
-- a real rank delta; the period tabs were dropped rather than backed with
-- fabricated numbers.
--
-- reading_history already has a real read_at per read event. This exposes
-- a day-bucketed, anonymous (no user_id) public aggregate over it — same
-- "aggregate goes through its own view, base table keeps owner-only RLS"
-- pattern as chapter_vote_counts (migrations/20260824_add_chapter_votes.sql):
-- reading_history's "users manage their own reading history" policy still
-- applies to the base table; this view runs as its owner and isn't
-- subject to that policy, same reason chapter_vote_counts isn't subject to
-- chapter_votes' owner-only policy.
--
-- App code fetches day rows for whatever lookback the longest period
-- needs (currently the quarter-before-last), then sums the days that fall
-- in each period's current window and the equal-length window right
-- before it (for the ▲/▼ delta) — see get-book-rankings.ts. Grouping by
-- day rather than fetching every reading_history row keeps that bounded
-- by (book × active day), not by read count.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

CREATE OR REPLACE VIEW public.book_read_counts_daily AS
  SELECT book_id, date_trunc('day', read_at)::date AS read_date, count(*)::integer AS read_count
  FROM public.reading_history
  GROUP BY book_id, date_trunc('day', read_at)::date;

COMMIT;

-- Notes:
-- 1. Idempotent (CREATE OR REPLACE) — chạy lại an toàn.
-- 2. Sau khi chạy, cập nhật docs/supabase/schema.sql (thêm view này ngay
--    sau reading_history) + src/lib/supabase/types.ts (view
--    Views.book_read_counts_daily) — cả hai đã cập nhật sẵn trong commit
--    này, chỉ cần áp migration vào project Supabase thật.
-- 3. Không cần GRANT riêng — giống mọi view public khác trong schema.sql
--    (author_public_profiles, chapter_vote_counts, public_design_items,
--    public_audio_narrations): default privileges của project đã cho
--    anon/authenticated SELECT trên view mới trong schema public.
