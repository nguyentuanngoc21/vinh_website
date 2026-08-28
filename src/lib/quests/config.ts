/**
 * Policy constants for the Quest System's reward engine — same rationale
 * as src/lib/wallet/config.ts: centralized here so the numbers are easy
 * to find and tune, not because any of them are final/signed-off.
 */
import type { QuestType } from "@/lib/supabase/types";

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

/**
 * Random daily quest pool (spec mục 1.3, migrations/20260828_add_user_quest_pool.sql).
 * Trọng số CỐ ĐỊNH theo quest_type (không theo user — không có khái
 * niệm level/rank nào trong hệ thống) — số càng lớn, càng dễ được random
 * chọn vào các slot "tự do" (ngoài 3 slot bắt buộc discovery/engagement/
 * khác). Không ảnh hưởng gì tới việc CÓ được chọn vào 3 slot bắt buộc
 * hay không — trong mỗi bucket bắt buộc, trọng số chỉ quyết định ứng
 * viên nào trong CÙNG quest_type đó được ưu tiên.
 */
export const QUEST_TYPE_WEIGHTS: Record<QuestType, number> = {
  discovery: 3,
  engagement: 3,
  lore_hunt: 2,
  cross_compare: 2,
  prediction: 2,
  topup: 1,
};

/** Số quest/ngày random trong khoảng [MIN, MAX] — spec: "3-5 quest/ngày". */
export const DAILY_POOL_MIN_SIZE = 3;
export const DAILY_POOL_MAX_SIZE = 5;

/** Ngân sách reset CHUNG cho cả pool/ngày (không phải mỗi quest riêng) —
 * enforce thật ở SQL (reset_quest_pool_slot, đếm trực tiếp
 * quest_reset_events) — hằng số này chỉ để truyền vào RPC, không tự nó
 * enforce gì (đổi ở đây thì lần gọi RPC sau tự dùng số mới ngay, không
 * cần migration). */
export const MAX_QUEST_RESETS_PER_DAY = 3;

/** Quest bị đổi ra khi reset LOẠI HẲN (không giảm % dần) khỏi pool random
 * của user đó trong N ngày kế tiếp — tính ở TS layer khi build danh sách
 * ứng viên (query quest_reset_events), không có logic này trong SQL. */
export const QUEST_RESET_COOLDOWN_DAYS = 3;
