import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/design/resolve-link — validate + preview 1 link chia sẻ
 * thiết kế TRƯỚC khi tác giả chèn ảnh vào nội dung chương (xem
 * chapter-editor.tsx, nút "Chèn ảnh thiết kế"). Dùng service-role vì
 * design_items base table chỉ chủ sở hữu select được (RLS) — link thường
 * thuộc về 1 hoạ sĩ KHÁC với tác giả đang gọi route này, không thể dùng
 * client cookie-bound của tác giả để đọc trực tiếp.
 *
 * QUAN TRỌNG: route này CHỈ trả imageUrl/title/altText, KHÔNG BAO GIỜ trả
 * lại share_token — chapter-editor.tsx chèn 1 marker
 * `[[thiet-ke:<designItemId>]]` vào nội dung chương (KHÔNG phải URL gốc),
 * để share_token không bao giờ lộ vào chapters.content (chapters.content
 * là text thô, hiện ra thẳng ở page source trang đọc cho mọi độc giả —
 * xem reader.tsx). Việc xác thực token đúng CHỦ chỉ xảy ra đúng 1 lần ở
 * đây, lúc tác giả dán link; sau đó reader.tsx resolve lại bằng id qua
 * public_design_items (view công khai, không cần token) để hiển thị.
 */
export async function POST(request: Request) {
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

  const serviceClient = createServiceRoleClient();
  const { data: item } = await serviceClient
    .from("design_items")
    .select("id, title, image_url, alt_text, share_token, deleted_at")
    .eq("id", designItemId)
    .maybeSingle();
  if (!item || item.deleted_at || item.share_token !== shareToken) {
    return NextResponse.json({ error: "Share link không đúng hoặc đã bị thu hồi." }, { status: 400 });
  }

  const { data: urlData } = serviceClient.storage.from("design-images").getPublicUrl(item.image_url);
  return NextResponse.json({
    designItemId: item.id,
    title: item.title,
    altText: item.alt_text,
    imageUrl: urlData.publicUrl,
  });
}
