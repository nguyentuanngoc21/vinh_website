import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { deleteAward, getContestById, revokeAward } from "@/lib/contests/admin-service";
import { ContestError } from "@/lib/contests/errors";
import { contestErrorResponse, optionalText, readJson } from "@/lib/contests/route-helpers";

type Params = { params: Promise<{ contestId: string; awardId: string }> };

/** PATCH { revoke: true, reason } — thu hồi giải, giữ nguyên bản ghi (provenance). */
export async function PATCH(request: Request, { params }: Params) {
  const { contestId, awardId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await readJson(request);
    const reason = optionalText(body.reason, 500);
    if (body.revoke !== true) throw new ContestError("invalid_input");
    if (!reason) throw new ContestError("reason_required");
    const contest = await getContestById(supabase, contestId);
    return NextResponse.json({ award: await revokeAward(supabase, { contest, awardId, adminId, reason }) });
  } catch (error) {
    return contestErrorResponse(error, "admin revoke award");
  }
}

/** DELETE — chỉ khi kết quả chưa công bố và giải chưa chi trả. */
export async function DELETE(_request: Request, { params }: Params) {
  const { contestId, awardId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const contest = await getContestById(supabase, contestId);
    await deleteAward(supabase, { contest, awardId });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return contestErrorResponse(error, "admin delete award");
  }
}
