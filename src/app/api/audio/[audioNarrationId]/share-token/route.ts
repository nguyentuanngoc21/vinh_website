import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/audio/:audioNarrationId/share-token — "Tạo lại link" ở
 * "Bản thu của tôi" (src/components/audio-hub/my-narrations-list.tsx).
 * Gọi RPC regenerate_audio_share_token (docs/supabase/schema.sql phần 9)
 * — tự kiểm narrator_id = auth.uid() bên trong, nên dùng client
 * cookie-bound của chính người sở hữu, KHÔNG service-role.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ audioNarrationId: string }> }
) {
  const { audioNarrationId } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("regenerate_audio_share_token", {
    p_audio_narration_id: audioNarrationId,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ shareToken: data });
}
