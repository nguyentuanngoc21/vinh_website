import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/authoring/books/:bookId/finalize — "Hoàn thiện" (một chiều,
 * không unset lại được — trigger prevent_unfinalize_book chặn ở tầng DB).
 * Tự động khóa mọi manuscript_access_grants đang hoạt động của truyện này
 * (trigger lock_manuscript_grants_on_finalize) — không đổi trường
 * author_display/is_ghostwritten nào (Module 5/6, việc riêng, phase sau).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  }

  const { data: current } = await supabase
    .from("books")
    .select("id, author_id, finalized_at")
    .eq("id", bookId)
    .maybeSingle();
  if (!current || current.author_id !== userData.user.id) {
    return NextResponse.json({ error: "Không tìm thấy truyện hoặc bạn không có quyền." }, { status: 404 });
  }
  if (current.finalized_at) {
    return NextResponse.json({ error: "Truyện này đã Hoàn thiện từ trước." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("books")
    .update({ finalized_at: new Date().toISOString() })
    .eq("id", bookId)
    .select("id, finalized_at")
    .maybeSingle();
  if (error || !data) {
    console.error("[authoring] finalize book failed:", error);
    return NextResponse.json({ error: "Không hoàn thiện được." }, { status: 500 });
  }

  return NextResponse.json({ book: data });
}
