import { NextResponse } from "next/server";
import { getUserContext, requestError } from "@/lib/mobile/request-context";
import { loadOwnedChapter } from "@/lib/authoring/owned-chapter";
import { isUuid } from "@/lib/validation/uuid";

/** GET — nội dung 1 phiên bản cũ, để xem/so sánh/khôi phục vào trình soạn thảo. */
export async function GET(request: Request, { params }: { params: Promise<{ chapterId: string; versionId: string }> }) {
  const { chapterId, versionId } = await params;
  if (!isUuid(chapterId) || !isUuid(versionId)) return NextResponse.json({ error: "Phiên bản không hợp lệ." }, { status: 400 });
  let auth;
  try { auth = await getUserContext(request); } catch (e) { return requestError(e); }
  if (!auth.userId) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  if (!(await loadOwnedChapter(auth.supabase, auth.userId, chapterId))) return NextResponse.json({ error: "Không tìm thấy chương." }, { status: 404 });
  const { data, error } = await auth.admin().from("chapter_versions")
    .select("id, title, content, word_count, created_at").eq("id", versionId).eq("chapter_id", chapterId).maybeSingle();
  if (error) return NextResponse.json({ error: "Không tải được phiên bản." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Không tìm thấy phiên bản." }, { status: 404 });
  return NextResponse.json({ version: data }, { headers: { "Cache-Control": "private, no-store" } });
}
