import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { LedgerService } from "@/lib/wallet/ledger-service";

/**
 * Admin-only. Grants a platform_bonus (contest prize, etc.) straight from
 * company funds — no hold period, doesn't touch anyone else's balance,
 * and is kept out of author revenue-share reporting by construction (see
 * platform_bonus_grants in the migration). getAuthedAdminId() is the first
 * gate; grant_platform_bonus() re-checks the admin's role DB-side as a
 * second, since the service-role client below bypasses RLS entirely.
 */
export async function POST(request: Request) {
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const recipientId = typeof body?.recipientId === "string" ? body.recipientId : "";
  const amount = Number(body?.amount);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (!recipientId || !Number.isFinite(amount) || amount <= 0 || !reason) {
    return NextResponse.json(
      { error: "Thiếu recipientId, amount (dương), hoặc reason." },
      { status: 400 }
    );
  }

  try {
    const transaction = await LedgerService.grantPlatformBonus(supabase, {
      adminId,
      recipientId,
      amount,
      reason,
    });
    return NextResponse.json(transaction, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Không thể cấp thưởng.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
