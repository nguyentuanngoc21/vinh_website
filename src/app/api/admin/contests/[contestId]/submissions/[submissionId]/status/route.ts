import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { setSubmissionStatusAsAdmin } from "@/lib/contests/admin-service";
import { contestErrorResponse, optionalText, parseSubmissionStatus, readJson } from "@/lib/contests/route-helpers";

/**
 * POST .../submissions/:submissionId/status { to, reason? } — admin duyệt /
 * đánh không hợp lệ / loại bài. ineligible, disqualified bắt buộc lý do
 * (hiển thị cho tác giả); disqualified là trạng thái cuối.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ contestId: string; submissionId: string }> }
) {
  const { contestId, submissionId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await readJson(request);
    const submission = await setSubmissionStatusAsAdmin(supabase, {
      contestId,
      submissionId,
      to: parseSubmissionStatus(body.to),
      adminId,
      reason: optionalText(body.reason, 1000),
    });
    return NextResponse.json({ submission });
  } catch (error) {
    return contestErrorResponse(error, "admin set submission status");
  }
}
