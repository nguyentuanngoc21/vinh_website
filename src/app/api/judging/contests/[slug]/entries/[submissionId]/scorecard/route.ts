import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { ContestError } from "@/lib/contests/errors";
import { saveMyScorecard } from "@/lib/contests/judging-service";
import { contestErrorResponse, optionalText, readJson, requireUuid } from "@/lib/contests/route-helpers";

/**
 * PUT /api/judging/contests/:slug/entries/:submissionId/scorecard { scores, note, finalize }
 * — giám khảo lưu nháp / chốt phiếu. Chỉ giám khảo đang được gán; DB kiểm lại
 * rubric, điểm tối đa, trạng thái cuộc thi và tự tính tổng.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ slug: string; submissionId: string }> }) {
  const { slug, submissionId } = await params;
  const supabase = createServiceRoleClient();
  const judgeId = await getAuthedUserId(supabase);
  if (!judgeId) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  try {
    const body = await readJson(request);
    const raw = body.scores;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new ContestError("invalid_scores");
    const scores: Record<string, number> = {};
    for (const [code, value] of Object.entries(raw as Record<string, unknown>)) {
      if (value === null || value === "") continue;
      if (typeof value !== "number" || !Number.isFinite(value)) throw new ContestError("invalid_scores");
      scores[code] = value;
    }
    const card = await saveMyScorecard(supabase, {
      slug,
      submissionId: requireUuid(submissionId, "submission_not_found"),
      judgeId,
      scores,
      note: optionalText(body.note, 4000),
      finalize: body.finalize === true,
    });
    return NextResponse.json({ scorecard: { id: card.id, status: card.status, total: Number(card.total) } });
  } catch (error) {
    return contestErrorResponse(error, "judge save scorecard");
  }
}
