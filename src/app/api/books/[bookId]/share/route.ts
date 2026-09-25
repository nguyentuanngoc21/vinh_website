import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { RewardEngine } from "@/lib/quests/reward-engine";

/**
 * POST /api/books/:bookId/share — gọi từ reader.tsx (handleShareStory,
 * handleShareExcerpt) SAU KHI shareOrCopy() thành công (Web Share API mở
 * được share sheet, hoặc rơi xuống clipboard) — chỉ để ghi nhận tiến
 * trình nhiệm vụ reader_share_story, không lưu gì về nội dung/nơi đã
 * chia sẻ (Web Share API không cho biết người dùng chọn app nào, hoặc có
 * thật sự gửi đi hay huỷ giữa chừng). Best-effort — không đăng nhập vẫn
 * trả 401 nhưng client tự nuốt lỗi (chia sẻ vẫn thành công với người
 * dùng, chỉ là không tính nhiệm vụ).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  await params; // bookId không cần dùng — nhiệm vụ không phân biệt theo sách.
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await RewardEngine.incrementTaskProgress(supabase, { userId, taskCode: "reader_share_story" });
  if (!result.ok) {
    console.error("[books/share] incrementTaskProgress failed:", result.error);
    return NextResponse.json({ error: "Không ghi nhận được." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
