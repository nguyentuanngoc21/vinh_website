import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/authoring/books/:bookId/share — Share bản thảo kiểu Drive
 * (yêu cầu bổ sung #1), TỔNG QUÁT cho mọi truyện, không chỉ ghostwriting.
 * Đúng 1 tài khoản đang được share/truyện — ép bằng partial unique index
 * (migrations/20260901_add_manuscript_share.sql), route chỉ cần bắt lỗi
 * unique_violation để trả thông báo dễ hiểu, không tự kiểm tay.
 *
 * RLS-scoped client (createClient(), không phải service-role) — đúng
 * pattern các route /api/authoring/books/* khác; policy "book owner
 * grants access" đã tự kiểm ownership + book chưa finalized.
 */
export async function POST(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim().replace(/^@/, "") : "";
  if (!username) {
    return NextResponse.json({ error: "Thiếu tên tài khoản cần share." }, { status: 400 });
  }

  const { data: target } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "Không tìm thấy tài khoản này." }, { status: 404 });
  }
  if (target.id === userData.user.id) {
    return NextResponse.json({ error: "Không thể share cho chính mình." }, { status: 400 });
  }

  const { data: grant, error } = await supabase
    .from("manuscript_access_grants")
    .insert({ book_id: bookId, granted_to_user_id: target.id, granted_by_user_id: userData.user.id })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Truyện này đang được share cho 1 tài khoản khác — gỡ share cũ trước." },
        { status: 409 }
      );
    }
    console.error("[authoring] share manuscript failed:", error);
    return NextResponse.json(
      { error: "Không share được — truyện không tồn tại, không phải của bạn, hoặc đã Hoàn thiện." },
      { status: 400 }
    );
  }

  return NextResponse.json({ grant });
}

/** DELETE /api/authoring/books/:bookId/share — gỡ share đang hoạt động
 * (revoked_at = now()). Có thể share lại người khác sau đó (miễn book
 * chưa Hoàn thiện) — chỉ cần POST lại. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("manuscript_access_grants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("book_id", bookId)
    .is("revoked_at", null)
    .is("locked_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[authoring] revoke manuscript share failed:", error);
    return NextResponse.json({ error: "Không gỡ được share." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Không có share nào đang hoạt động để gỡ." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
