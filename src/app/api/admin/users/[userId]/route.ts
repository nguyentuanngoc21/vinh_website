import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import type { Role } from "@/lib/supabase/types";

const VALID_ROLES: Role[] = ["user", "admin", "super_admin"];

/**
 * PATCH /api/admin/users/:userId — đổi role (Người dùng, xem
 * src/app/admin/nguoi-dung/[userId]/page.tsx). Cùng tinh thần override
 * bằng service-role như api/admin/books/[bookId]/route.ts. Chặn tự hạ
 * quyền chính mình xuống 'user' — dễ tự khoá mình khỏi /admin (proxy.ts
 * chặn theo role) mà không ai khác kịp nâng lại nếu đang là admin duy
 * nhất; muốn đổi role của chính mình thì nhờ admin khác làm.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const role = body?.role;
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "role không hợp lệ." }, { status: 400 });
  }
  if (userId === adminId && role !== "super_admin" && role !== "admin") {
    return NextResponse.json({ error: "Không thể tự hạ quyền của chính mình." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId)
    .select("id, role")
    .maybeSingle();
  if (error) {
    console.error("[admin/users] update role failed:", error);
    return NextResponse.json({ error: "Cập nhật thất bại." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Không tìm thấy người dùng." }, { status: 404 });
  }

  return NextResponse.json(data);
}
