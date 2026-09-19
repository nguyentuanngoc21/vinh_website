import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/design/:designItemId/share-token — "Tạo link liên kết" /
 * "Tạo lại link" trong form đăng thiết kế. Mirrors
 * src/app/api/audio/[audioNarrationId]/share-token/route.ts. Gọi RPC
 * regenerate_design_share_token (docs/supabase/schema.sql phần 9) — tự
 * kiểm illustrator_id = auth.uid() bên trong, nên dùng client cookie-bound
 * của chính người sở hữu, KHÔNG service-role.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ designItemId: string }> }) {
  const { designItemId } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("regenerate_design_share_token", {
    p_design_item_id: designItemId,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ shareToken: data });
}
