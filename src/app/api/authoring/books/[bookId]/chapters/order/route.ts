import { NextResponse } from "next/server";
import { getUserContext, requestError } from "@/lib/mobile/request-context";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PUT /api/authoring/books/:bookId/chapters/order — body `{ chapterIds }`: MỌI
 * chương của sách theo thứ tự mới. RPC reorder_book_chapters (SECURITY
 * INVOKER — RLS "authors update chapters on their own books" vẫn áp dụng) kiểm
 * chủ sách, đủ/không trùng chương, và chương cuối phải đứng cuối. Xem
 * migrations/20260925_add_chapter_delete_and_reorder.sql.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  if (!UUID.test(bookId)) {
    return NextResponse.json({ error: "Không tìm thấy truyện." }, { status: 404 });
  }
  const body = await request.json().catch(() => null);
  const chapterIds: unknown = body?.chapterIds;
  if (
    !Array.isArray(chapterIds) ||
    chapterIds.length === 0 ||
    chapterIds.length > 1000 ||
    !chapterIds.every((id) => typeof id === "string" && UUID.test(id))
  ) {
    return NextResponse.json({ error: "Danh sách chương không hợp lệ." }, { status: 400 });
  }

  let auth;
  try {
    auth = await getUserContext(request);
  } catch (e) {
    return requestError(e);
  }
  const { supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  }

  const { error } = await supabase.rpc("reorder_book_chapters", {
    p_book_id: bookId,
    p_chapter_ids: chapterIds as string[],
  });
  if (error) {
    const message = error.message ?? "";
    if (message.includes("not owned by caller")) {
      return NextResponse.json({ error: "Không tìm thấy truyện hoặc bạn không có quyền sửa." }, { status: 404 });
    }
    if (message.includes("Chapter list must contain")) {
      return NextResponse.json(
        { error: "Danh sách chương đã thay đổi (có chương vừa thêm hoặc xoá). Hãy tải lại rồi thử lại." },
        { status: 409 }
      );
    }
    if (message.includes("The last chapter must stay last")) {
      return NextResponse.json({ error: "Chương cuối phải đứng cuối cùng." }, { status: 400 });
    }
    console.error("[authoring] reorder chapters failed:", error);
    return NextResponse.json({ error: "Lưu thứ tự thất bại. Vui lòng thử lại." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, chapterIds });
}
