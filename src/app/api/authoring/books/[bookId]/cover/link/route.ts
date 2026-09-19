import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/authoring/books/:bookId/cover/link — tác giả dán link chia sẻ
 * mà MỘT HOẠ SĨ KHÁC gửi cho họ (id + share_token trong query string, xem
 * nút "Tạo link liên kết" ở design-upload-form.tsx) để gắn ảnh đó làm bìa
 * truyện của chính họ. Mirrors
 * src/app/api/authoring/chapters/[chapterId]/audio/link/route.ts — không
 * tự kiểm quyền sở hữu/khớp token ở route này, link_cover_to_book()
 * (SECURITY DEFINER, docs/supabase/schema.sql phần 9) tự làm cả 2 việc đó
 * bên trong transaction, dùng client cookie-bound của chính tác giả
 * (auth.uid() phải là tác giả thật, KHÔNG dùng service-role).
 */
export async function POST(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const shareUrl = typeof body?.shareUrl === "string" ? body.shareUrl.trim() : "";
  if (!shareUrl) {
    return NextResponse.json({ error: "Vui lòng dán link chia sẻ." }, { status: 400 });
  }

  let designItemId: string | null = null;
  let shareToken: string | null = null;
  try {
    const parsed = new URL(shareUrl, "https://vinh.invalid");
    designItemId = parsed.searchParams.get("id");
    shareToken = parsed.searchParams.get("token");
  } catch {
    // rơi xuống nhánh lỗi dưới
  }
  if (!designItemId || !shareToken) {
    return NextResponse.json({ error: "Link không hợp lệ — thiếu id hoặc token." }, { status: 400 });
  }

  const { error } = await supabase.rpc("link_cover_to_book", {
    p_book_id: bookId,
    p_design_item_id: designItemId,
    p_share_token: shareToken,
  });
  if (error) {
    // RPC RAISE EXCEPTION đã có message tiếng Việt rõ ràng ("Bạn không sở
    // hữu sách này" / "Share link không đúng hoặc đã bị thu hồi").
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // design_items (bảng gốc) chỉ chủ sở hữu select được (RLS) — tác giả
  // đang gọi route này thường KHÔNG phải hoạ sĩ vẽ ảnh, nên phải đọc qua
  // public_design_items (view công khai) để lấy lại image_url.
  const { data: item } = await supabase
    .from("public_design_items")
    .select("image_url")
    .eq("id", designItemId)
    .maybeSingle();
  const coverUrl = item ? supabase.storage.from("design-images").getPublicUrl(item.image_url).data.publicUrl : null;
  return NextResponse.json({ ok: true, coverUrl });
}
