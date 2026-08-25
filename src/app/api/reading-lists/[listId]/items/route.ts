import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

async function assertOwnList(
  supabase: ReturnType<typeof createServiceRoleClient>,
  listId: string,
  userId: string
) {
  const { data: list } = await supabase
    .from("reading_lists")
    .select("id")
    .eq("id", listId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!list;
}

/** POST /api/reading-lists/:listId/items — thêm 1 sách vào danh sách. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ listId: string }> }
) {
  const { listId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const bookId = typeof body?.bookId === "string" ? body.bookId : "";
  if (!bookId) {
    return NextResponse.json({ error: "Thiếu sách cần thêm." }, { status: 400 });
  }

  // 404 (không lộ chuyện danh sách có tồn tại hay không cho người không
  // sở hữu) thay vì 403 — cùng cách các route authoring khác trong repo
  // xử lý "không tìm thấy hoặc không có quyền".
  if (!(await assertOwnList(supabase, listId, userId))) {
    return NextResponse.json({ error: "Không tìm thấy danh sách." }, { status: 404 });
  }

  const { error } = await supabase.from("reading_list_items").insert({ list_id: listId, book_id: bookId });
  if (error && error.code !== "23505") {
    console.error("[reading-lists] add item failed:", error);
    return NextResponse.json({ error: "Không thể thêm vào danh sách. Vui lòng thử lại." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
