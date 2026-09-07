import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

const LIST_LIMIT = 30;

/**
 * GET /api/notifications — "mục Thông báo" (chuông ở header, xem
 * notification-bell.tsx). Lớp (A) trong đặc tả gỡ chương — chỉ
 * title/link ngắn; nội dung đầy đủ (lớp B) nằm ở Hội thoại
 * (direct_messages), bấm vào `link` sẽ điều hướng tới đó.
 */
export async function GET() {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, link, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) {
    console.error("[notifications] list failed:", error);
    return NextResponse.json({ error: "Không tải được thông báo." }, { status: 500 });
  }

  const notifications = data ?? [];
  return NextResponse.json({
    notifications,
    unreadCount: notifications.filter((n) => n.read_at === null).length,
  });
}

/**
 * PATCH /api/notifications — đánh dấu đã đọc. Body `{ id }` đánh dấu 1
 * thông báo (khi tác giả bấm vào để mở Hội thoại); `{ markAllRead: true }`
 * đánh dấu hết (khi mở dropdown chuông).
 */
export async function PATCH(request: Request) {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const now = new Date().toISOString();

  if (body?.markAllRead === true) {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) {
      console.error("[notifications] mark all read failed:", error);
      return NextResponse.json({ error: "Đánh dấu đã đọc thất bại." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) {
    return NextResponse.json({ error: "Thiếu id." }, { status: 400 });
  }
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: now })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) {
    console.error("[notifications] mark read failed:", error);
    return NextResponse.json({ error: "Đánh dấu đã đọc thất bại." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
