import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

/**
 * GET /api/authoring/books/:bookId/manuscript — đọc bản thảo cho người
 * ĐƯỢC SHARE (không phải tác giả, không cần book đã published). KHÔNG mở
 * rộng RLS select của books/chapters cho việc này (xem ghi chú ở
 * migrations/20260901_add_manuscript_share.sql) — dùng service-role, tự
 * kiểm manuscript_access_grants còn hiệu lực (revoked_at is null — grant
 * đã LOCKED vẫn đọc được bình thường, locked chỉ chặn gỡ/share lại, xem
 * route share/route.ts).
 *
 * "Render-only, chặn copy/tải" (Mục 4.3 đặc tả) là việc của UI phía
 * client (trang đọc riêng, không phải trang /truyen công khai) — route
 * này chỉ trả dữ liệu thô kèm cảnh báo rõ trong response, KHÔNG tự làm
 * watermark/ảnh hoá nội dung (cần thư viện xử lý ảnh riêng, ngoài phạm
 * vi phase này — xem báo cáo tiến độ).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: grant } = await supabase
    .from("manuscript_access_grants")
    .select("id, granted_at, locked_at")
    .eq("book_id", bookId)
    .eq("granted_to_user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();
  if (!grant) {
    return NextResponse.json({ error: "Bạn không có quyền xem bản thảo này." }, { status: 403 });
  }

  const { data: book } = await supabase
    .from("books")
    .select("id, title, synopsis, author_id, finalized_at")
    .eq("id", bookId)
    .maybeSingle();
  if (!book) {
    return NextResponse.json({ error: "Không tìm thấy truyện." }, { status: 404 });
  }

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, title, content, order_index")
    .eq("book_id", bookId)
    .order("order_index", { ascending: true });

  return NextResponse.json({
    book: { id: book.id, title: book.title, synopsis: book.synopsis, finalized: !!book.finalized_at },
    chapters: chapters ?? [],
    grantedAt: grant.granted_at,
    locked: !!grant.locked_at,
  });
}
