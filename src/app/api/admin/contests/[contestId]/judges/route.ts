import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { getContestById } from "@/lib/contests/admin-service";
import { assignJudge, listJudges } from "@/lib/contests/judging-service";
import { contestErrorResponse, readJson, requireUuid } from "@/lib/contests/route-helpers";

/** GET /api/admin/contests/:contestId/judges */
export async function GET(_request: Request, { params }: { params: Promise<{ contestId: string }> }) {
  const { contestId } = await params;
  const supabase = createServiceRoleClient();
  if (!(await getAuthedAdminId(supabase))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ judges: await listJudges(supabase, requireUuid(contestId, "contest_not_found")) });
  } catch (error) {
    return contestErrorResponse(error, "admin list judges");
  }
}

/** POST { username } — gán giám khảo (tài khoản Vịnh sẵn có, không đổi role). */
export async function POST(request: Request, { params }: { params: Promise<{ contestId: string }> }) {
  const { contestId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const contest = await getContestById(supabase, requireUuid(contestId, "contest_not_found"));
    const body = await readJson(request);
    await assignJudge(supabase, { contestId: contest.id, adminId, username: typeof body.username === "string" ? body.username : "" });
    return NextResponse.json({ judges: await listJudges(supabase, contest.id) }, { status: 201 });
  } catch (error) {
    return contestErrorResponse(error, "admin assign judge");
  }
}
