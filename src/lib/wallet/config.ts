/**
 * Policy constants for the wallet/ledger system. Deliberately centralized
 * here (not sprinkled through the services) so finance/product can review
 * and tune every number in one place — several of these are placeholder
 * defaults called out as "để config" in the design doc, not values anyone
 * has signed off on.
 */

/** Days an author's revenue-share credit sits in balance_pending before
 * settle_due_pending_transactions() moves it to balance_available. */
export const HOLD_PERIOD_DAYS = 4;

/** VND value of 1 token when cashing out via withdrawal. Mirrors the
 * custom top-up rate in src/lib/topup.ts (CUSTOM_UNIT_PRICE) for now —
 * revisit once deposit/withdrawal are on real payment rails, since paying
 * out at the exact top-up rate leaves no margin and bonus tokens (pack
 * bonuses, platform_bonus grants) get cashed out at full price too. */
export const TOKEN_TO_VND_RATE = 200;

/** Minimum a single withdrawal request may move, in tokens. */
export const MIN_WITHDRAWAL_TOKENS = 500; // 500 * 200đ = 100,000đ

/** Max number of withdrawal *requests* (regardless of outcome) a user may
 * create in a rolling 30-day window. */
export const MAX_WITHDRAWALS_PER_MONTH = 5;

/** Default author/platform split for a chapter purchase when the caller
 * doesn't specify one — 70/30, author-favoring. */
export const DEFAULT_AUTHOR_SHARE_RATE = 0.7;

/**
 * AML-style withdrawal cap — NOT a fully-resolved policy, flagged as such
 * in the design doc ("cân nhắc... để tránh rủi ro rửa tiền"). Default here
 * takes the more conservative reading: a user can always withdraw revenue
 * they *earned* (purchase_credit once settled, platform_bonus) in full,
 * but self-deposited principal they never spent can only be withdrawn up
 * to what they've actually deposited — closes the trivial deposit → sit →
 * withdraw laundering loop without penalizing authors cashing out real
 * sales. Compliance should confirm this before relying on it in production.
 */
export const CAP_WITHDRAWAL_TO_NET_DEPOSITS = true;

export function tokensToVnd(tokens: number): number {
  return Math.round(tokens * TOKEN_TO_VND_RATE);
}
