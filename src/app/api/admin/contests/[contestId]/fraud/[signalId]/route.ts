import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ContestFraudStatus } from "@/lib/supabase/types";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { ContestError } from "@/lib/contests/errors";
import { getFraudCounts, listFraudSignals, reviewFraudSignal } from "@/lib/contests/fraud-service";
import { contestErrorResponse, optionalText, readJson, requireUuid } from "@/lib/contests/route-helpers";

const STATUSES: ContestFraudStatus[] = ["confirmed", "dismissed", "open"];

/**
 * PATCH /api/admin/contests/:contestId/fraud/:signalId { status, note } —
 * xác nhận (loại phiếu + lượt đọc của tài khoản khỏi điểm cuộc thi này), bỏ
 * qua, hoặc mở lại. Bảng điểm được tính lại ngay. Khoá sau khi công bố kết quả.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ contestId: string; signalId: string }> }) {
  const { contestId, signalId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const cid = requireUuid(contestId, "contest_not_found");
    const sid = requireUuid(signalId, "signal_not_found");
    const body = await readJson(request);
    const status = body.status as ContestFraudStatus;
    if (!STATUSES.includes(status)) throw new ContestError("invalid_input", ["Cách xử lý không hợp lệ"]);
    await reviewFraudSignal(supabase, { contestId: cid, signalId: sid, adminId, status, note: optionalText(body.note, 1000) });
    const [all, counts] = await Promise.all([listFraudSignals(supabase, { contestId: cid, status: "all" }), getFraudCounts(supabase, cid)]);
    return NextResponse.json({ signal: all.find((s) => s.id === sid) ?? null, counts });
  } catch (error) {
    return contestErrorResponse(error, "admin review fraud signal");
  }
}
