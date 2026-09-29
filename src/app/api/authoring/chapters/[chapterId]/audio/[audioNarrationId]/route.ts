import { NextResponse } from "next/server";
import { createClient, requireSupabaseUser } from "@/lib/supabase/server";

/**
 * DELETE /api/authoring/chapters/:chapterId/audio/:audioNarrationId — gỡ
 * liên kết audio khỏi 1 chương. Không cần xin phép diễn viên lồng tiếng
 * (đây là quyền của tác giả với truyện của họ) — policy "book authors
 * unlink audio from their own chapters" (docs/supabase/schema.sql phần 9)
 * đã chặn qua RLS, route này không tự kiểm ownership tay, giống PATCH
 * /api/authoring/chapters/[chapterId].
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ chapterId: string; audioNarrationId: string }> }
) {
  const { chapterId, audioNarrationId } = await params;
  const supabase = await createClient();
  const auth = await requireSupabaseUser(supabase);
  if ("response" in auth) return auth.response;

  const { error } = await supabase
    .from("chapter_audio_links")
    .delete()
    .eq("chapter_id", chapterId)
    .eq("audio_narration_id", audioNarrationId);
  if (error) {
    console.error("[chapter audio/unlink] delete failed:", error);
    return NextResponse.json({ error: "Gỡ audio thất bại." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
