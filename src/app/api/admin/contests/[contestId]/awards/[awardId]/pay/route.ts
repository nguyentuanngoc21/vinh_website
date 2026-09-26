import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { payAward } from "@/lib/contests/admin-service";
import { contestErrorResponse, requireUuid } from "@/lib/contests/route-helpers";

/**
 * POST /api/admin/contests/:contestId/awards/:awardId/pay — admin chi trả 1
 * giải (token đã quy đổi lúc trao) vào ví tác giả. Chỉ sau khi công bố kết
 * quả; không chi 2 lần, không chi giải đã thu hồi (DB kiểm dưới khoá).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ contestId: string; awardId: string }> }) {
  const { contestId, awardId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const award = await payAward(supabase, {
      contestId: requireUuid(contestId, "contest_not_found"),
      awardId: requireUuid(awardId, "award_not_found"),
      adminId,
    });
    return NextResponse.json({ award });
  } catch (error) {
    return contestErrorResponse(error, "admin pay award");
  }
}
