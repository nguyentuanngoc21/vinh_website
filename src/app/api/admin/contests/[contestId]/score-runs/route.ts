import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { getContestById } from "@/lib/contests/admin-service";
import { ContestError } from "@/lib/contests/errors";
import { computeScoreRun, listScoreRuns } from "@/lib/contests/final-scoring-service";
import { contestErrorResponse, readJson, requireUuid } from "@/lib/contests/route-helpers";

/** GET /api/admin/contests/:contestId/score-runs — các lượt tính (mới nhất trước) + lý do cần tính lại. */
export async function GET(_request: Request, { params }: { params: Promise<{ contestId: string }> }) {
  const { contestId } = await params;
  const supabase = createServiceRoleClient();
  if (!(await getAuthedAdminId(supabase))) return NextResponse.json({ error: "Bạn không có quyền thực hiện thao tác này." }, { status: 401 });
  try {
    const contest = await getContestById(supabase, requireUuid(contestId, "contest_not_found"));
    return NextResponse.json({ runs: await listScoreRuns(supabase, contest) });
  } catch (error) {
    return contestErrorResponse(error, "admin list score runs");
  }
}

/**
 * POST { kind: "preview" | "final" } — tính 1 lượt bằng version cấu hình đang
 * áp dụng (không nhận cấu hình khác — J3 mục 15). 'final' chỉ sau khi hết khung chấm.
 */
export async function POST(request: Request, { params }: { params: Promise<{ contestId: string }> }) {
  const { contestId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) return NextResponse.json({ error: "Bạn không có quyền thực hiện thao tác này." }, { status: 401 });
  try {
    const contest = await getContestById(supabase, requireUuid(contestId, "contest_not_found"));
    const body = await readJson(request);
    if (body.kind !== "preview" && body.kind !== "final") throw new ContestError("invalid_input", ["kind: preview | final"]);
    const result = await computeScoreRun(supabase, { contest, adminId, kind: body.kind });
    return NextResponse.json({ ...result, runs: await listScoreRuns(supabase, contest) }, { status: 201 });
  } catch (error) {
    return contestErrorResponse(error, "admin compute score run");
  }
}
