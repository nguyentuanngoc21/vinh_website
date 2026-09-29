import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { getContestById } from "@/lib/contests/admin-service";
import { ContestError } from "@/lib/contests/errors";
import { listScoreRuns, publishScoreRun } from "@/lib/contests/final-scoring-service";
import { contestErrorResponse, optionalText, readJson, requireUuid } from "@/lib/contests/route-helpers";
import { isUuid } from "@/lib/validation/uuid";

/**
 * POST /api/admin/contests/:contestId/score-runs/:runId/publish { reason } —
 * chọn lượt tính CHÍNH THỨC làm kết quả. Thay kết quả đã công bố cần lý do;
 * lượt cũ giữ lại (đánh dấu thay thế). Công khai trên microsite sau khi cuộc
 * thi chuyển sang "Đã có kết quả".
 */
export async function POST(request: Request, { params }: { params: Promise<{ contestId: string; runId: string }> }) {
  const { contestId, runId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) return NextResponse.json({ error: "Bạn không có quyền thực hiện thao tác này." }, { status: 401 });
  try {
    const contest = await getContestById(supabase, requireUuid(contestId, "contest_not_found"));
    if (!isUuid(runId)) throw new ContestError("score_run_not_found");
    const body = await readJson(request);
    await publishScoreRun(supabase, { contestId: contest.id, runId, adminId, reason: optionalText(body.reason, 1000) });
    return NextResponse.json({ runs: await listScoreRuns(supabase, contest) });
  } catch (error) {
    return contestErrorResponse(error, "admin publish score run");
  }
}
