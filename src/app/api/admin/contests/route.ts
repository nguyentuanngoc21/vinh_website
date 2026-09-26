import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { parseContestPatch } from "@/lib/contests/admin-input";
import { createContest, listContestsForAdmin } from "@/lib/contests/admin-service";
import { ContestError } from "@/lib/contests/errors";
import { contestErrorResponse, readJson } from "@/lib/contests/route-helpers";

/** GET /api/admin/contests — mọi cuộc thi (kể cả nháp) + số bài hợp lệ. */
export async function GET() {
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ contests: await listContestsForAdmin(supabase) });
  } catch (error) {
    return contestErrorResponse(error, "admin list contests");
  }
}

/** POST /api/admin/contests — tạo cuộc thi ở trạng thái nháp. */
export async function POST(request: Request) {
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const parsed = parseContestPatch(await readJson(request), "create");
    if (!parsed.ok) throw new ContestError("invalid_input", parsed.errors);
    const contest = await createContest(supabase, adminId, parsed.value);
    return NextResponse.json({ contest }, { status: 201 });
  } catch (error) {
    return contestErrorResponse(error, "admin create contest");
  }
}
