import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdmin } from "@/lib/wallet/session";
import type { Role } from "@/lib/supabase/types";

const VALID_ROLES: Role[] = ["user", "admin", "super_admin"];

const RPC_ERRORS: Record<string, { status: number; error: string }> = {
  actor_not_super_admin: { status: 403, error: "Chỉ Super Admin được đổi quyền." },
  self_demotion: { status: 400, error: "Không thể tự hạ quyền của chính mình." },
  target_not_found: { status: 404, error: "Không tìm thấy người dùng." },
};

/**
 * PATCH /api/admin/users/:userId — đổi role (Người dùng, xem
 * src/app/admin/nguoi-dung/[userId]/page.tsx).
 *
 * CHỈ super_admin được đổi role (admin thường nhận 403) — nếu không, bất
 * kỳ admin nào cũng tự nâng mình/người khác lên super_admin được. Kiểm
 * quyền, chặn super_admin tự hạ quyền, cập nhật và ghi role_change_logs
 * đều nằm trong RPC admin_set_user_role (1 transaction — xem
 * migrations/20260928_add_role_change_logs.sql); check ở đây chỉ để trả
 * 403 sớm. Role đọc từ profiles, không từ cookie.
 *
 * Người bị đổi role KHÔNG cần đăng nhập lại: cookie vinh_session được làm
 * mới qua /api/auth/session (xem route đó).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const supabase = createServiceRoleClient();
  const caller = await getAuthedAdmin(supabase);
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (caller.role !== "super_admin") {
    return NextResponse.json({ error: RPC_ERRORS.actor_not_super_admin.error }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const role = body?.role;
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "role không hợp lệ." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("admin_set_user_role", {
    p_actor_id: caller.id,
    p_target_id: userId,
    p_role: role,
  });
  if (error) {
    const known = error.hint ? RPC_ERRORS[error.hint] : undefined;
    if (known) {
      return NextResponse.json({ error: known.error }, { status: known.status });
    }
    console.error("[admin/users] update role failed:", error);
    return NextResponse.json({ error: "Cập nhật thất bại." }, { status: 500 });
  }

  return NextResponse.json({ id: userId, role: data });
}
