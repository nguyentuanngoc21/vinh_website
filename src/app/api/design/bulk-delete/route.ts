import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MAX_IDS = 100;

/**
 * POST /api/design/bulk-delete — nút "Xóa (N)" khi bulk-select nhiều ảnh
 * trong form đăng thiết kế. Soft-delete (set deleted_at), KHÔNG .delete()
 * thật — giữ lại dữ liệu theo quyết định sản phẩm, cùng tinh thần
 * migrations/20260826_add_book_soft_delete.sql. RLS "illustrators update
 * their own design items" tự chặn theo hàng — .in("id", ids) chỉ set
 * được đúng những dòng thuộc về chính người gọi, dòng của người khác
 * lẫn trong danh sách chỉ đơn giản không match, không lỗi.
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
    return NextResponse.json({ error: "Chưa chọn ảnh nào." }, { status: 400 });
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: `Chỉ xoá tối đa ${MAX_IDS} ảnh mỗi lần.` }, { status: 400 });
  }

  const { error } = await supabase
    .from("design_items")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids);
  if (error) {
    console.error("[api/design/bulk-delete] update failed:", error);
    return NextResponse.json({ error: "Xoá thất bại." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
