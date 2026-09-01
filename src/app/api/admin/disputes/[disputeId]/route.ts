import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { DisputeService } from "@/lib/orders/dispute-service";
import type { OrderStatus } from "@/lib/supabase/types";

const VALID_RESUME_STATUSES: OrderStatus[] = [
  "draft", "brief_confirmed", "deposit_paid", "in_progress", "delivered", "completed", "cancelled",
];

/** PATCH /api/admin/disputes/:disputeId — admin xử lý xong (Mục 9):
 * quyết định bên có lỗi (nếu có, cập nhật Trust Score), mở khóa lại đơn
 * về 1 trạng thái, hoàn tiền thủ công nếu cần. */
export async function PATCH(request: Request, { params }: { params: Promise<{ disputeId: string }> }) {
  const { disputeId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const resolutionNote = typeof body?.resolutionNote === "string" ? body.resolutionNote.trim() : "";
  const atFaultUserId = typeof body?.atFaultUserId === "string" ? body.atFaultUserId : null;
  const resumeStatus = VALID_RESUME_STATUSES.includes(body?.resumeStatus) ? (body.resumeStatus as OrderStatus) : "cancelled";
  const refundAmount = Number.isFinite(Number(body?.refundAmount)) ? Math.max(0, Number(body.refundAmount)) : 0;

  if (!resolutionNote) {
    return NextResponse.json({ error: "Thiếu ghi chú quyết định xử lý." }, { status: 400 });
  }

  try {
    const dispute = await DisputeService.resolve(supabase, {
      disputeId,
      adminId,
      resolutionNote,
      atFaultUserId,
      resumeStatus,
      refundAmount,
    });
    return NextResponse.json({ dispute });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không xử lý được tranh chấp.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
