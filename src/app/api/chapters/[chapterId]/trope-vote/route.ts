import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { checkChapterAccess } from "@/lib/reading/chapter-access";
import { RewardEngine } from "@/lib/quests/reward-engine";

/**
 * POST /api/chapters/:chapterId/trope-vote — bình chọn 1 nhân vật (mang 1
 * "trope"/mẫu hình) làm yêu thích trong chương đang đọc — nhiệm vụ
 * reader_vote_trope. 1 vote/chương/user (unique user_id+chapter_id, xem
 * migrations/20260919_add_characters.sql) — đổi ý thì UPDATE, không tính
 * lại tiến trình nhiệm vụ lần 2 (chỉ tăng ở lần vote ĐẦU cho chương này).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const { chapterId } = await params;
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập để bình chọn." }, { status: 401 });
  }
  // Chỉ người đọc được chương mới tương tác được (trước đây nhận mọi chapterId,
  // kể cả chương khoá chưa mua hoặc chưa xuất bản) — xem src/lib/reading/chapter-access.ts.
  const access = await checkChapterAccess(supabase, userId, chapterId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json().catch(() => null);
  const characterId = typeof body?.characterId === "string" ? body.characterId : "";
  if (!characterId) {
    return NextResponse.json({ error: "Thiếu nhân vật cần bình chọn." }, { status: 400 });
  }

  const { data: tagged } = await supabase
    .from("chapter_characters")
    .select("character_id")
    .eq("chapter_id", chapterId)
    .eq("character_id", characterId)
    .maybeSingle();
  if (!tagged) {
    return NextResponse.json({ error: "Nhân vật này không xuất hiện trong chương." }, { status: 400 });
  }

  const { data: existingVote } = await supabase
    .from("character_trope_votes")
    .select("id")
    .eq("user_id", userId)
    .eq("chapter_id", chapterId)
    .maybeSingle();

  if (existingVote) {
    const { error } = await supabase
      .from("character_trope_votes")
      .update({ character_id: characterId })
      .eq("id", existingVote.id);
    if (error) {
      console.error("[trope-vote] update failed:", error);
      return NextResponse.json({ error: "Không thể ghi nhận bình chọn." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, characterId });
  }

  const { error } = await supabase
    .from("character_trope_votes")
    .insert({ user_id: userId, chapter_id: chapterId, character_id: characterId });
  if (error) {
    console.error("[trope-vote] insert failed:", error);
    return NextResponse.json({ error: "Không thể ghi nhận bình chọn." }, { status: 500 });
  }

  const result = await RewardEngine.incrementTaskProgress(supabase, { userId, taskCode: "reader_vote_trope" });
  if (!result.ok) console.error("[trope-vote] incrementTaskProgress failed:", result.error);

  return NextResponse.json({ ok: true, characterId });
}
