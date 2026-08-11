import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { WalletService } from "@/lib/wallet/wallet-service";

const MAX_LIMIT = 100;

export async function GET(request: Request) {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  try {
    const { entries, total } = await WalletService.getTransactions(supabase, userId, { limit, offset });
    return NextResponse.json({ entries, total, limit, offset });
  } catch {
    return NextResponse.json({ error: "Không thể tải lịch sử giao dịch." }, { status: 500 });
  }
}
