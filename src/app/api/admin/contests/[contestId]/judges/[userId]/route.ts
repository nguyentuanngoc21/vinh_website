import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { ContestError } from "@/lib/contests/errors";
import { listJudges, removeJudge } from "@/lib/contests/judging-service";
import { contestErrorResponse, optionalText, readJson, requireUuid } from "@/lib/contests/route-helpers";
import { isUuid } from "@/lib/validation/uuid";

/** DELETE { reason } — gỡ giám khảo; phiếu của người đó không vào điểm nữa (J5). */
export async function DELETE(request: Request, { params }: { params: Promise<{ contestId: string; userId: string }> }) {
  const { contestId, userId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) return NextResponse.json({ error: "Bạn không có quyền thực hiện thao tác này." }, { status: 401 });
  try {
    const cid = requireUuid(contestId, "contest_not_found");
    if (!isUuid(userId)) throw new ContestError("judge_not_found");
    const body = await readJson(request);
    await removeJudge(supabase, { contestId: cid, userId, adminId, reason: optionalText(body.reason, 1000) });
    return NextResponse.json({ judges: await listJudges(supabase, cid) });
  } catch (error) {
    return contestErrorResponse(error, "admin remove judge");
  }
}
