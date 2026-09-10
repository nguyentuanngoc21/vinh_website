import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

const MAX_HIGHLIGHT_CHARS = 2000;

/**
 * GET /api/chapters/:chapterId/highlights — CHỈ trả về highlight của
 * CHÍNH viewer hiện tại (bảng highlights riêng tư, không công khai như
 * anchored_comments — RLS "users manage their own highlights" cũng chặn
 * y hệt, nhưng route dùng service-role nên tự lọc `.eq("user_id", ...)`
 * ở đây, không dựa vào RLS). Chưa đăng nhập -> danh sách rỗng, không lỗi
 * (đọc chương không bắt buộc đăng nhập).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const { chapterId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ highlights: [] });
  }

  const { data, error } = await supabase
    .from("highlights")
    .select("id, paragraph_index, char_start, char_end")
    .eq("chapter_id", chapterId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[highlights] list failed:", error);
    return NextResponse.json({ error: "Không tải được highlight." }, { status: 500 });
  }

  return NextResponse.json({
    highlights: (data ?? []).map((h) => ({
      id: h.id,
      paragraphIndex: h.paragraph_index,
      charStart: h.char_start,
      charEnd: h.char_end,
    })),
  });
}

/**
 * POST /api/chapters/:chapterId/highlights — tạo 1 highlight từ 1 lượt
 * bôi đen thật (charStart/charEnd tính trên plain text của đoạn văn,
 * xem src/lib/reading/highlights.ts textOffsetWithin() ở client) — KHÁC
 * anchored_comments (dùng offset danh nghĩa 0/1 vì không cần vị trí thật).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const { chapterId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập để highlight." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const paragraphIndex = Number(body?.paragraphIndex);
  const charStart = Number(body?.charStart);
  const charEnd = Number(body?.charEnd);
  if (
    !Number.isInteger(paragraphIndex) ||
    paragraphIndex < 0 ||
    !Number.isInteger(charStart) ||
    charStart < 0 ||
    !Number.isInteger(charEnd) ||
    charEnd <= charStart ||
    charEnd - charStart > MAX_HIGHLIGHT_CHARS
  ) {
    return NextResponse.json({ error: "Vùng bôi đen không hợp lệ." }, { status: 400 });
  }

  const { data: highlight, error } = await supabase
    .from("highlights")
    .insert({
      user_id: userId,
      chapter_id: chapterId,
      paragraph_index: paragraphIndex,
      char_start: charStart,
      char_end: charEnd,
    })
    .select("id")
    .single();
  if (error || !highlight) {
    console.error("[highlights] insert failed:", error);
    return NextResponse.json({ error: "Highlight thất bại." }, { status: 500 });
  }

  return NextResponse.json({
    highlight: { id: highlight.id, paragraphIndex, charStart, charEnd },
  });
}
