import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { LedgerService } from "@/lib/wallet/ledger-service";
import { rejectUnauthorizedCron } from "@/lib/cron-auth";

/**
 * Scheduled via vercel.json (hourly) — Vercel Cron sends a GET request
 * and, when CRON_SECRET is set, an `Authorization: Bearer <CRON_SECRET>`
 * header automatically; see
 * node_modules/next/dist/docs/01-app/01-getting-started (route handlers)
 * and Vercel's Cron Jobs docs. Reject anything without a matching header
 * so this can't be triggered by an outside POST hitting the URL directly.
 */
export async function GET(request: Request) {
  const denied = rejectUnauthorizedCron(request, "wallet/settle-pending");
  if (denied) return denied;

  const supabase = createServiceRoleClient();
  const settled = await LedgerService.settleDuePendingTransactions(supabase);

  return NextResponse.json({ settledCount: settled.length });
}
