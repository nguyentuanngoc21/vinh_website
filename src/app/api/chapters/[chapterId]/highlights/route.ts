import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { checkChapterAccess } from "@/lib/reading/chapter-access";

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
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
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
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập để highlight." }, { status: 401 });
  }
  // Chỉ người đọc được chương mới tương tác được (trước đây nhận mọi chapterId,
  // kể cả chương khoá chưa mua hoặc chưa xuất bản) — xem src/lib/reading/chapter-access.ts.
  const access = await checkChapterAccess(supabase, userId, chapterId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
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
