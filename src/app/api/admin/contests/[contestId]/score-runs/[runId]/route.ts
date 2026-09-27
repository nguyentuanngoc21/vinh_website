import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { ContestError } from "@/lib/contests/errors";
import { getScoreRun } from "@/lib/contests/final-scoring-service";
import { contestErrorResponse, requireUuid } from "@/lib/contests/route-helpers";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/admin/contests/:contestId/score-runs/:runId — bảng điểm đầy đủ các tầng (audit). */
export async function GET(_request: Request, { params }: { params: Promise<{ contestId: string; runId: string }> }) {
  const { contestId, runId } = await params;
  const supabase = createServiceRoleClient();
  if (!(await getAuthedAdminId(supabase))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    if (!UUID.test(runId)) throw new ContestError("score_run_not_found");
    return NextResponse.json(await getScoreRun(supabase, requireUuid(contestId, "contest_not_found"), runId));
  } catch (error) {
    return contestErrorResponse(error, "admin get score run");
  }
}
