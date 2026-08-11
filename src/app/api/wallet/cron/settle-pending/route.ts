import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { LedgerService } from "@/lib/wallet/ledger-service";

/**
 * Scheduled via vercel.json (hourly) — Vercel Cron sends a GET request
 * and, when CRON_SECRET is set, an `Authorization: Bearer <CRON_SECRET>`
 * header automatically; see
 * node_modules/next/dist/docs/01-app/01-getting-started (route handlers)
 * and Vercel's Cron Jobs docs. Reject anything without a matching header
 * so this can't be triggered by an outside POST hitting the URL directly.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    // Fail loudly in production rather than silently running an
    // unauthenticated cron endpoint — mirrors session.ts's SESSION_SECRET
    // guard.
    console.error("[wallet] CRON_SECRET is not set — settle-pending is unauthenticated.");
  }

  const supabase = createServiceRoleClient();
  const settled = await LedgerService.settleDuePendingTransactions(supabase);

  return NextResponse.json({ settledCount: settled.length });
}
