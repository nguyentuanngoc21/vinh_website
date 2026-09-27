import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { getJudgingOverview } from "@/lib/contests/judging-service";
import { contestErrorResponse, requireUuid } from "@/lib/contests/route-helpers";

/** GET /api/admin/contests/:contestId/scorecards — bảng tiến độ chấm (bài × giám khảo) + nhật ký gần nhất. */
export async function GET(_request: Request, { params }: { params: Promise<{ contestId: string }> }) {
  const { contestId } = await params;
  const supabase = createServiceRoleClient();
  if (!(await getAuthedAdminId(supabase))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await getJudgingOverview(supabase, requireUuid(contestId, "contest_not_found")));
  } catch (error) {
    return contestErrorResponse(error, "admin judging overview");
  }
}
