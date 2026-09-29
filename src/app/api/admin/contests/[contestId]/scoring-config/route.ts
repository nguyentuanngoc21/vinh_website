import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { getContestById } from "@/lib/contests/admin-service";
import { getScoringConfigState, saveScoringConfig } from "@/lib/contests/judging-service";
import { contestErrorResponse, optionalText, readJson, requireUuid } from "@/lib/contests/route-helpers";

/** GET /api/admin/contests/:contestId/scoring-config — version đang dùng + lịch sử. */
export async function GET(_request: Request, { params }: { params: Promise<{ contestId: string }> }) {
  const { contestId } = await params;
  const supabase = createServiceRoleClient();
  if (!(await getAuthedAdminId(supabase))) return NextResponse.json({ error: "Bạn không có quyền thực hiện thao tác này." }, { status: 401 });
  try {
    const contest = await getContestById(supabase, requireUuid(contestId, "contest_not_found"));
    return NextResponse.json(await getScoringConfigState(supabase, contest));
  } catch (error) {
    return contestErrorResponse(error, "admin get scoring config");
  }
}

/**
 * PUT { config, reason } — lưu version cấu hình chấm MỚI (version cũ bất biến).
 * Từ lúc khung chấm chính thức bắt đầu phải có lý do (J11); rubric khoá khi đã có phiếu chấm.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ contestId: string }> }) {
  const { contestId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) return NextResponse.json({ error: "Bạn không có quyền thực hiện thao tác này." }, { status: 401 });
  try {
    const contest = await getContestById(supabase, requireUuid(contestId, "contest_not_found"));
    const body = await readJson(request);
    const version = await saveScoringConfig(supabase, { contestId: contest.id, adminId, config: body.config, reason: optionalText(body.reason, 1000) });
    return NextResponse.json({ version, state: await getScoringConfigState(supabase, await getContestById(supabase, contest.id)) });
  } catch (error) {
    return contestErrorResponse(error, "admin save scoring config");
  }
}
