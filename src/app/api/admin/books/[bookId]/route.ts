import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";

/**
 * PATCH /api/admin/books/:bookId — admin/super_admin override cho trang
 * "Nội dung" (src/app/admin/noi-dung/page.tsx). Dùng service-role, bỏ
 * qua RLS/GRANT của books VÀ mọi business rule ở
 * src/app/api/authoring/books/[bookId]/route.ts (khoá exclusivity 3
 * ngày, điều kiện xoá/giao dịch) — đúng nghĩa "override", không phải bản
 * nới của route tác giả. getAuthedAdminId() (src/lib/wallet/session.ts,
 * cùng pattern api/admin/bonus/route.ts) đã chấp nhận cả admin và
 * super_admin.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const update: { is_exclusive?: boolean; deleted_at?: string | null } = {};

  if (typeof body?.is_exclusive === "boolean") {
    update.is_exclusive = body.is_exclusive;
  }
  // deleted: true -> xoá (set deleted_at = now), false -> khôi phục (null).
  if (typeof body?.deleted === "boolean") {
    update.deleted_at = body.deleted ? new Date().toISOString() : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Không có gì để cập nhật." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("books")
    .update(update)
    .eq("id", bookId)
    .select("id, title, is_exclusive, deleted_at")
    .maybeSingle();

  if (error) {
    console.error("[admin] update book failed:", error);
    return NextResponse.json({ error: "Cập nhật thất bại. Vui lòng thử lại." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Không tìm thấy truyện." }, { status: 404 });
  }

  return NextResponse.json(data);
}
