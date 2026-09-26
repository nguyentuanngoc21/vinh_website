import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { parseAwardInput } from "@/lib/contests/admin-input";
import { createAward, getContestById, listAwards } from "@/lib/contests/admin-service";
import { ContestError } from "@/lib/contests/errors";
import { contestErrorResponse, readJson } from "@/lib/contests/route-helpers";

type Params = { params: Promise<{ contestId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { contestId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ awards: await listAwards(supabase, contestId) });
  } catch (error) {
    return contestErrorResponse(error, "admin list awards");
  }
}

/**
 * POST /api/admin/contests/:contestId/awards — trao giải cho 1 bài. Giải
 * nhập bằng VND, server tự quy đổi token theo tỷ giá hiện hành (D10). Chi
 * trả thủ công ở Slice 1.7; giải chỉ công khai sau khi công bố kết quả.
 */
export async function POST(request: Request, { params }: Params) {
  const { contestId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const parsed = parseAwardInput(await readJson(request));
    if (!parsed.ok) throw new ContestError("invalid_input", parsed.errors);
    const contest = await getContestById(supabase, contestId);
    const award = await createAward(supabase, { contest, adminId, award: parsed.value });
    return NextResponse.json({ award }, { status: 201 });
  } catch (error) {
    return contestErrorResponse(error, "admin create award");
  }
}
