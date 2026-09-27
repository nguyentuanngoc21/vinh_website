import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { getContestById } from "@/lib/contests/admin-service";
import { ContestError } from "@/lib/contests/errors";
import { listScoreRuns, publishScoreRun } from "@/lib/contests/final-scoring-service";
import { contestErrorResponse, optionalText, readJson, requireUuid } from "@/lib/contests/route-helpers";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const contest = await getContestById(supabase, requireUuid(contestId, "contest_not_found"));
    if (!UUID.test(runId)) throw new ContestError("score_run_not_found");
    const body = await readJson(request);
    await publishScoreRun(supabase, { contestId: contest.id, runId, adminId, reason: optionalText(body.reason, 1000) });
    return NextResponse.json({ runs: await listScoreRuns(supabase, contest) });
  } catch (error) {
    return contestErrorResponse(error, "admin publish score run");
  }
}
