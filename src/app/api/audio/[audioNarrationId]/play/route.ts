import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/audio/:audioNarrationId/play — gọi 1 lần mỗi khi
 * NowPlayingProvider bắt đầu phát 1 track LẦN ĐẦU trong phiên trình duyệt
 * hiện tại (không phải mỗi lần tua/resume), tăng play_count thật qua RPC
 * increment_audio_play_count. Không yêu cầu đăng nhập — nghe không cần
 * tài khoản, giống lượt xem sách.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ audioNarrationId: string }> }
) {
  const { audioNarrationId } = await params;
  const supabase = createServiceRoleClient();

  const { error } = await supabase.rpc("increment_audio_play_count", {
    p_audio_narration_id: audioNarrationId,
  });
  if (error) {
    console.error("[api/audio/play] increment failed:", error);
    return NextResponse.json({ error: "Không thể ghi nhận lượt nghe." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
