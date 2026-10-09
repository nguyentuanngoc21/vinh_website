import { NextResponse } from "next/server";
import { getUserContext, requestError } from "@/lib/mobile/request-context";
import { loadOwnedChapter } from "@/lib/authoring/owned-chapter";
import { isUuid } from "@/lib/validation/uuid";

/** GET — danh sách phiên bản cũ của chương (không kèm nội dung). */
export async function GET(request: Request, { params }: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await params;
  if (!isUuid(chapterId)) return NextResponse.json({ error: "Chương không hợp lệ." }, { status: 400 });
  let auth;
  try { auth = await getUserContext(request); } catch (e) { return requestError(e); }
  if (!auth.userId) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  if (!(await loadOwnedChapter(auth.supabase, auth.userId, chapterId))) return NextResponse.json({ error: "Không tìm thấy chương." }, { status: 404 });
  // chapter_versions has no client grants (same sensitivity as chapters.content).
  const { data, error } = await auth.admin().from("chapter_versions")
    .select("id, title, word_count, content_version, created_at").eq("chapter_id", chapterId).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Không tải được lịch sử." }, { status: 500 });
  return NextResponse.json({ versions: data }, { headers: { "Cache-Control": "private, no-store" } });
}
