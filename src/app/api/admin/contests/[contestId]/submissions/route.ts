import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { listSubmissionsForAdmin } from "@/lib/contests/admin-service";
import { ensureFreshScores } from "@/lib/contests/scores-service";
import { contestErrorResponse, parseSubmissionStatus } from "@/lib/contests/route-helpers";

/** GET /api/admin/contests/:contestId/submissions?status=&flagged=1&page= */
export async function GET(request: Request, { params }: { params: Promise<{ contestId: string }> }) {
  const { contestId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    await ensureFreshScores(supabase, contestId);
    const result = await listSubmissionsForAdmin(supabase, {
      contestId,
      status: status ? parseSubmissionStatus(status) : null,
      flaggedOnly: url.searchParams.get("flagged") === "1",
      page: Number(url.searchParams.get("page")) || 1,
    });
    return NextResponse.json(result);
  } catch (error) {
    return contestErrorResponse(error, "admin list submissions");
  }
}
