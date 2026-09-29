import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { ContestError } from "@/lib/contests/errors";
import { getJudgingOverview, reviewScorecard } from "@/lib/contests/judging-service";
import { contestErrorResponse, optionalText, readJson, requireUuid } from "@/lib/contests/route-helpers";

/** PATCH { action: "reopen" | "invalidate", reason } — admin mở lại hoặc huỷ phiếu chấm, luôn kèm lý do (ghi nhật ký). */
export async function PATCH(request: Request, { params }: { params: Promise<{ contestId: string; scorecardId: string }> }) {
  const { contestId, scorecardId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) return NextResponse.json({ error: "Bạn không có quyền thực hiện thao tác này." }, { status: 401 });
  try {
    const cid = requireUuid(contestId, "contest_not_found");
    const body = await readJson(request);
    const action = body.action;
    if (action !== "reopen" && action !== "invalidate") throw new ContestError("invalid_input", ["Thao tác không hợp lệ"]);
    await reviewScorecard(supabase, {
      contestId: cid,
      scorecardId: requireUuid(scorecardId, "scorecard_not_found"),
      adminId,
      action,
      reason: optionalText(body.reason, 1000),
    });
    return NextResponse.json(await getJudgingOverview(supabase, cid));
  } catch (error) {
    return contestErrorResponse(error, "admin review scorecard");
  }
}
