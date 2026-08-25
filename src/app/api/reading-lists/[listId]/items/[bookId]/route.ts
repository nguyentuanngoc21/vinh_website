import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

/** DELETE /api/reading-lists/:listId/items/:bookId — gỡ 1 sách khỏi danh sách. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ listId: string; bookId: string }> }
) {
  const { listId, bookId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  }

  const { data: list } = await supabase
    .from("reading_lists")
    .select("id")
    .eq("id", listId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!list) {
    return NextResponse.json({ error: "Không tìm thấy danh sách." }, { status: 404 });
  }

  const { error } = await supabase
    .from("reading_list_items")
    .delete()
    .eq("list_id", listId)
    .eq("book_id", bookId);
  if (error) {
    console.error("[reading-lists] remove item failed:", error);
    return NextResponse.json({ error: "Không thể gỡ khỏi danh sách. Vui lòng thử lại." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
