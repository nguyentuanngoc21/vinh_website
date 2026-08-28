/**
 * Policy constants for the Quest System's reward engine — same rationale
 * as src/lib/wallet/config.ts: centralized here so the numbers are easy
 * to find and tune, not because any of them are final/signed-off.
 */

/** Token cost to rescue an at-risk streak (see rescue_streak_with_tokens()
 * in migrations/20260827_add_streak_sync_functions.sql). Fixed, not
 * scaled by streak length — confirmed choice; revisit if rescue turns out
 * to be abused (see note in that migration re: streak no longer fully
 * reflecting real reading behavior once paid rescue is unlimited). */
export const STREAK_RESCUE_TOKEN_COST = 50;

/**
 * Display-only mirrors of constants that are actually enforced in SQL
 * (sync_reading_streak()/rescue_streak_with_tokens() — see
 * migrations/20260827_add_streak_sync_functions.sql). SQL is the source of
 * truth; these exist so UI copy ("còn 48 giờ để cứu streak", "đạt mốc 100
 * ngày để +1 thẻ nghỉ") doesn't hardcode magic numbers separately. If you
 * change the SQL, update these too — nothing enforces they stay in sync.
 */
export const STREAK_RESCUE_GRACE_HOURS = 48;
export const REST_DAY_ACCRUAL_INTERVAL_DAYS = 7;
export const REST_DAY_BANK_CAP_GROWTH_INTERVAL_DAYS = 100;
export const REST_DAY_BANK_CAP_MAX = 31;
