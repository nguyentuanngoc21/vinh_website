import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { parseContestPatch } from "@/lib/contests/admin-input";
import { deleteDraftContest, getContestById, getStatusEvents, updateContest } from "@/lib/contests/admin-service";
import { ContestError } from "@/lib/contests/errors";
import { contestErrorResponse, readJson } from "@/lib/contests/route-helpers";

type Params = { params: Promise<{ contestId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { contestId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [contest, events] = await Promise.all([getContestById(supabase, contestId), getStatusEvents(supabase, contestId)]);
    return NextResponse.json({ contest, events });
  } catch (error) {
    return contestErrorResponse(error, "admin get contest");
  }
}

/**
 * PATCH /api/admin/contests/:contestId — sửa thông tin. Trạng thái đổi qua
 * /status; thể lệ, slug, cấu hình khoá khi rời nháp (DB trả rules_locked).
 */
export async function PATCH(request: Request, { params }: Params) {
  const { contestId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const parsed = parseContestPatch(await readJson(request), "update");
    if (!parsed.ok) throw new ContestError("invalid_input", parsed.errors);
    return NextResponse.json({ contest: await updateContest(supabase, contestId, parsed.value) });
  } catch (error) {
    return contestErrorResponse(error, "admin update contest");
  }
}

/** DELETE — chỉ cuộc thi nháp (cuộc thi đã công khai không bao giờ bị xoá). */
export async function DELETE(_request: Request, { params }: Params) {
  const { contestId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await deleteDraftContest(supabase, contestId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return contestErrorResponse(error, "admin delete contest");
  }
}
