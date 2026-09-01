/**
 * Policy constants for the commission/escrow order system. Centralized
 * here like src/lib/wallet/config.ts — several of these mirror numbers
 * from the design mock rather than a signed-off business decision.
 */

/** Days an order sits in `delivered` before the cron
 * (src/app/api/orders/cron/auto-confirm) auto-confirms it on the buyer's
 * behalf. Baked into deliver_order()'s `auto_confirm_at = now() + interval
 * '7 days'` at the DB level too — keep in sync if this changes (would need
 * a migration, not just this constant, since the interval is hardcoded in
 * the SQL function body; this constant is for the cron's own display/log
 * text and any future re-check, not the actual gating column). */
export const AUTO_CONFIRM_DAYS = 7;

/** Days a seller's `order_earning` credit sits in balance_pending before
 * settle_due_pending_transactions() (src/lib/wallet, reused as-is) moves it
 * to balance_available — same hold-period policy as purchase_credit
 * (src/lib/wallet/config.ts HOLD_PERIOD_DAYS), kept as a separate constant
 * here so order-earning payout timing can be tuned independently of
 * chapter-purchase payout timing later without touching wallet config. */
export const ORDER_EARNING_HOLD_DAYS = 4;
