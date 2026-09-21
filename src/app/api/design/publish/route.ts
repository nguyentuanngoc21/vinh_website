import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MAX_IDS = 100;

/**
 * POST /api/design/publish — nút "Hoàn tất" ở form đăng thiết kế
 * (design-upload-form.tsx). Ảnh chèn qua POST /api/design luôn ở trạng
 * thái draft (published_at NULL, xem
 * migrations/20260921_add_design_item_publish_state.sql) — chỉ SELECT
 * được bởi chính họa sĩ, KHÔNG hiện qua public_design_items. Route này là
 * nơi DUY NHẤT set published_at = now(), làm ảnh hiện công khai ở
 * /thiet-ke. .is("published_at", null) để idempotent — gọi lại không đè
 * mốc công khai gốc của ảnh đã công khai từ trước.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id: unknown) => typeof id === "string") : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "Chưa có ảnh nào để đăng." }, { status: 400 });
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: `Chỉ đăng tối đa ${MAX_IDS} ảnh mỗi lần.` }, { status: 400 });
  }

  const { error } = await supabase
    .from("design_items")
    .update({ published_at: new Date().toISOString() })
    .in("id", ids)
    .is("published_at", null);
  if (error) {
    console.error("[api/design/publish] update failed:", error);
    return NextResponse.json({ error: "Đăng thiết kế thất bại." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
