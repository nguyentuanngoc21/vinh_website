import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/authoring/chapters/:chapterId/audio/link — tác giả dán link
 * chia sẻ mà MỘT DIỄN VIÊN LỒNG TIẾNG KHÁC gửi cho họ (id + share_token
 * trong query string, xem "Bản thu của tôi" ở /audio/new) để gắn bản thu
 * đó vào 1 chương của chính mình — luồng "Tác giả dán link" mô tả ở
 * docs/supabase/schema.sql phần 9. Không tự kiểm quyền sở hữu/khớp token
 * ở route này — link_audio_to_chapter() (SECURITY DEFINER) tự làm cả 2
 * việc đó bên trong transaction, dùng client cookie-bound của chính tác
 * giả (auth.uid() phải là tác giả thật, KHÔNG dùng service-role).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const { chapterId } = await params;
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

  let audioNarrationId: string | null = null;
  let shareToken: string | null = null;
  try {
    // Chấp nhận link đầy đủ (https://vinh.vn/lien-ket-audio?id=...&token=...)
    // — chỉ đọc query string, domain/path không quan trọng (dev/prod khác
    // domain vẫn dán được).
    const parsed = new URL(shareUrl, "https://vinh.invalid");
    audioNarrationId = parsed.searchParams.get("id");
    shareToken = parsed.searchParams.get("token");
  } catch {
    // rơi xuống nhánh lỗi dưới
  }
  if (!audioNarrationId || !shareToken) {
    return NextResponse.json({ error: "Link không hợp lệ — thiếu id hoặc token." }, { status: 400 });
  }

  const { error } = await supabase.rpc("link_audio_to_chapter", {
    p_chapter_id: chapterId,
    p_audio_narration_id: audioNarrationId,
    p_share_token: shareToken,
  });
  if (error) {
    // RPC RAISE EXCEPTION đã có message tiếng Việt rõ ràng ("Bạn không sở
    // hữu sách chứa chương này" / "Share link không đúng hoặc đã bị thu hồi").
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
