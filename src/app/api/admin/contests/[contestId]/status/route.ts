import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { transitionContest } from "@/lib/contests/admin-service";
import { contestErrorResponse, optionalText, parseContestStatus, readJson } from "@/lib/contests/route-helpers";

/**
 * POST /api/admin/contests/:contestId/status { to, reason? } — chuyển trạng
 * thái theo ma trận (chỉ đi tiến; DB từ chối chuyển sai, ghi nhật ký).
 */
export async function POST(request: Request, { params }: { params: Promise<{ contestId: string }> }) {
  const { contestId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await readJson(request);
    const contest = await transitionContest(supabase, {
      contestId,
      to: parseContestStatus(body.to),
      adminId,
      reason: optionalText(body.reason, 500),
    });
    return NextResponse.json({ contest });
  } catch (error) {
    return contestErrorResponse(error, "admin transition contest");
  }
}
