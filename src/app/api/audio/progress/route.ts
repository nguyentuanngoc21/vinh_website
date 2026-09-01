import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/audio/progress — upsert vị trí nghe dở thật (audio_progress),
 * gọi từ NowPlayingProvider (src/lib/audio/now-playing-context.tsx) mỗi
 * ~8s khi đang phát + ngay khi pause/kết thúc/đóng tab. Dùng client
 * cookie-bound của chính người nghe (KHÔNG phải service-role) — RLS
 * "users manage their own audio progress" đã đủ và đúng ý: chỉ được ghi
 * đè đúng dòng của chính mình. Chưa đăng nhập → 401, provider tự nuốt lỗi
 * này (nghe vẫn hoạt động cho khách, chỉ là không lưu được tiến độ).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const audioNarrationId = typeof body?.audioNarrationId === "string" ? body.audioNarrationId : null;
  const positionSeconds = Number(body?.positionSeconds);
  if (!audioNarrationId || !Number.isFinite(positionSeconds) || positionSeconds < 0) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  const { error } = await supabase
    .from("audio_progress")
    .upsert(
      {
        user_id: user.id,
        audio_narration_id: audioNarrationId,
        position_seconds: Math.floor(positionSeconds),
        // upsert() chỉ update đúng các cột có trong payload — updated_at
        // default now() CHỈ áp dụng lúc insert, không tự bump lại lúc
        // update qua ON CONFLICT, nên phải set tay ở đây để "Audio đang
        // nghe" (sắp theo updated_at mới nhất) luôn đúng.
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,audio_narration_id" }
    );
  if (error) {
    console.error("[api/audio/progress] upsert failed:", error);
    return NextResponse.json({ error: "Không lưu được tiến độ nghe." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
