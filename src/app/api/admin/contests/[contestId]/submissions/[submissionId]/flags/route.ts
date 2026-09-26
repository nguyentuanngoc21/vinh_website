import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { addReviewFlag } from "@/lib/contests/admin-service";
import { ContestError } from "@/lib/contests/errors";
import { contestErrorResponse, optionalText, readJson } from "@/lib/contests/route-helpers";

/**
 * POST .../submissions/:submissionId/flags { code, message, fix_by?, visible_to_author? }
 * — gắn cờ "Cần bổ sung" (Q2). Không đổi trạng thái bài.
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
    const fixBy = body.fix_by;
    if (fixBy !== undefined && fixBy !== null && (typeof fixBy !== "string" || Number.isNaN(Date.parse(fixBy)))) {
      throw new ContestError("invalid_input", ["Hạn bổ sung không hợp lệ"]);
    }
    const submission = await addReviewFlag(supabase, {
      contestId,
      submissionId,
      adminId,
      code: typeof body.code === "string" ? body.code.trim() : "",
      message: optionalText(body.message, 500) ?? "",
      fixBy: typeof fixBy === "string" ? new Date(fixBy).toISOString() : null,
      visibleToAuthor: body.visible_to_author !== false,
    });
    return NextResponse.json({ submission }, { status: 201 });
  } catch (error) {
    return contestErrorResponse(error, "admin add review flag");
  }
}
