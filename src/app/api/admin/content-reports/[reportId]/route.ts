import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { isUuid } from "@/lib/validation/uuid";

export async function PATCH(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const db = createServiceRoleClient();
  const admin = await getAuthedAdminId(db);
  if (!admin) return NextResponse.json({ error: "Bạn không có quyền xử lý báo cáo." }, { status: 403 });
  const { reportId } = await params;
  if (!isUuid(reportId)) return NextResponse.json({ error: "Báo cáo không hợp lệ." }, { status: 400 });
  const body = await request.json().catch(() => null);
  const status = body?.status;
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (!["reviewing", "resolved", "dismissed"].includes(status) || note.length > 3000 || (status !== "reviewing" && !note))
    return NextResponse.json({ error: "Chọn trạng thái hợp lệ và nhập kết quả xử lý khi đóng báo cáo." }, { status: 400 });
  const { data, error } = await db.from("content_reports").update({ status, resolution_note: note || null,
    reviewed_by: admin, updated_at: new Date().toISOString() }).eq("id", reportId).in("status", ["pending", "reviewing"]).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Không thể cập nhật báo cáo." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Báo cáo đã đóng hoặc không tồn tại. Vui lòng tải lại trang." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
