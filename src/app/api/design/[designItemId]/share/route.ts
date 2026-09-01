import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/design/:designItemId/share — gọi SAU khi shareOrCopy()
 * (src/lib/share.ts) thành công ("shared" hoặc "copied"), tăng
 * share_count thật +1 qua RPC increment_design_item_share_count (an toàn
 * dưới race condition, không cho client tự set số tùy ý — xem
 * migrations/20260901_add_design_item_gallery_metadata.sql). Không yêu
 * cầu đăng nhập — chia sẻ không cần tài khoản, giống lượt xem sách.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ designItemId: string }> }
) {
  const { designItemId } = await params;
  const supabase = createServiceRoleClient();

  const { error } = await supabase.rpc("increment_design_item_share_count", {
    p_design_item_id: designItemId,
  });
  if (error) {
    console.error("[design/share] increment failed:", error);
    return NextResponse.json({ error: "Không thể ghi nhận lượt chia sẻ." }, { status: 500 });
  }

  const { data: row } = await supabase
    .from("public_design_items")
    .select("share_count")
    .eq("id", designItemId)
    .maybeSingle();

  return NextResponse.json({ shareCount: row?.share_count ?? 0 });
}
