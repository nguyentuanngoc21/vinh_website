import { NextResponse } from "next/server";
import { getUserContext, requestError } from "@/lib/mobile/request-context";
import { findNameIssues, namesFrom } from "@/lib/authoring/name-check";
import { isUuid } from "@/lib/validation/uuid";

export const maxDuration = 60;
const PAGE = 1000, BATCH = 40;

/**
 * GET — "Kiểm tra cả truyện": chương nào có tên riêng viết lệch dấu/hoa thường
 * so với nhân vật + địa danh/thuật ngữ đã đăng ký. Metadata qua client RLS của
 * tác giả; chỉ `content` (bị REVOKE) đọc bằng service-role cho đúng các id đó.
 */
export async function GET(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  if (!isUuid(bookId)) return NextResponse.json({ error: "Truyện không hợp lệ." }, { status: 400 });
  let auth;
  try { auth = await getUserContext(request); } catch (e) { return requestError(e); }
  if (!auth.userId) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  const { data: book } = await auth.supabase.from("books").select("author_id, deleted_at").eq("id", bookId).maybeSingle();
  if (!book || book.author_id !== auth.userId || book.deleted_at) return NextResponse.json({ error: "Không tìm thấy truyện." }, { status: 404 });

  const [characters, terms] = await Promise.all([
    auth.supabase.from("characters").select("name, aliases, archived_at").eq("book_id", bookId),
    auth.supabase.from("story_terms").select("name, aliases").eq("book_id", bookId),
  ]);
  const names = namesFrom(characters.data ?? [], terms.data ?? []);
  if (!names.length) return NextResponse.json({ chapters: [], names: 0 });

  const chapters: { id: string; title: string; order_index: number }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await auth.supabase.from("chapters").select("id, title, order_index")
      .eq("book_id", bookId).is("removed_at", null).order("order_index").range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: "Không tải được chương." }, { status: 500 });
    chapters.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  const admin = auth.admin();
  const results: { id: string; title: string; order_index: number; issues: { found: string; expected: string; count: number }[] }[] = [];
  for (let i = 0; i < chapters.length; i += BATCH) {
    const slice = chapters.slice(i, i + BATCH);
    const { data, error } = await admin.from("chapters").select("id, content").in("id", slice.map(c => c.id));
    if (error) return NextResponse.json({ error: "Không đọc được nội dung chương." }, { status: 500 });
    const content = new Map((data ?? []).map(r => [r.id, r.content ?? ""]));
    for (const ch of slice) {
      const issues = findNameIssues(content.get(ch.id) ?? "", names);
      if (issues.length) results.push({ ...ch, issues: issues.map(x => ({ found: x.found, expected: x.expected, count: x.positions.length })) });
    }
  }
  return NextResponse.json({ chapters: results, names: names.length, scanned: chapters.length }, { headers: { "Cache-Control": "private, no-store" } });
}
