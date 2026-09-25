import { NextResponse } from "next/server";
import { getUserContext, requestError } from "@/lib/mobile/request-context";

/**
 * PUT /api/authoring/chapters/:chapterId/characters — thay TOÀN BỘ tập
 * nhân vật gắn với chương này bằng đúng danh sách gửi lên (xoá hết rồi
 * chèn lại — đơn giản hơn diff thêm/bớt, số nhân vật/chương nhỏ). RLS
 * "authors tag characters in their own chapters" chặn sửa chương của
 * sách người khác qua cả DELETE lẫn INSERT.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const { chapterId } = await params;
  const body = await request.json().catch(() => null);
  const rawIds: unknown[] = Array.isArray(body?.characterIds) ? body.characterIds : [];
  const characterIds: string[] | null = Array.isArray(body?.characterIds)
    ? [...new Set(rawIds.filter((id): id is string => typeof id === "string"))]
    : null;
  if (!characterIds) {
    return NextResponse.json({ error: "Danh sách nhân vật không hợp lệ." }, { status: 400 });
  }

  let auth;
  try {
    auth = await getUserContext(request);
  } catch (e) {
    return requestError(e);
  }
  const { supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  }

  const { data: chapter } = await supabase.from("chapters").select("id, book_id").eq("id", chapterId).maybeSingle();
  if (!chapter) {
    return NextResponse.json({ error: "Không tìm thấy chương." }, { status: 404 });
  }

  // Chặn gắn nhân vật của SÁCH KHÁC vào chương này (FK character_id chỉ
  // đảm bảo nhân vật tồn tại, không đảm bảo cùng sách).
  if (characterIds.length > 0) {
    const { count } = await supabase
      .from("characters")
      .select("id", { count: "exact", head: true })
      .eq("book_id", chapter.book_id)
      .in("id", characterIds);
    if ((count ?? 0) !== characterIds.length) {
      return NextResponse.json({ error: "1 hoặc nhiều nhân vật không thuộc sách này." }, { status: 400 });
    }
  }

  const { error: deleteError } = await supabase.from("chapter_characters").delete().eq("chapter_id", chapterId);
  if (deleteError) {
    console.error("[chapter-characters] clear failed:", deleteError);
    return NextResponse.json({ error: "Lưu thất bại. Vui lòng thử lại." }, { status: 500 });
  }

  if (characterIds.length > 0) {
    const { error: insertError } = await supabase
      .from("chapter_characters")
      .insert(characterIds.map((characterId) => ({ chapter_id: chapterId, character_id: characterId })));
    if (insertError) {
      console.error("[chapter-characters] insert failed:", insertError);
      return NextResponse.json(
        { error: "Lưu thất bại — kiểm tra bạn có phải tác giả sách này không." },
        { status: 403 }
      );
    }
  }

  return NextResponse.json({ ok: true, characterIds });
}
