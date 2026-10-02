import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { consumeRateLimits } from "@/lib/rate-limit";
import { validateContentReport } from "@/lib/moderation/content-reports";

export async function POST(request: Request) {
  const db = createServiceRoleClient();
  const reporterId = await getAuthedUserId(db);
  if (!reporterId) return NextResponse.json({ error: "Vui lòng đăng nhập để báo cáo." }, { status: 401 });
  const parsed = validateContentReport(await request.json().catch(() => null));
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const limit = consumeRateLimits([{ key: `content-report:${reporterId}`, limit: 10, windowMs: 3600000 }]);
  if (!limit.ok) return NextResponse.json({ error: "Bạn gửi quá nhiều báo cáo. Vui lòng thử lại sau." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });
  const v = parsed.value;
  const { data: book, error: bookError } = await db.from("books").select("id, title, slug").eq("id", v.bookId).eq("published", true).is("deleted_at", null).maybeSingle();
  if (bookError) return NextResponse.json({ error: "Không thể kiểm tra tác phẩm." }, { status: 500 });
  if (!book) return NextResponse.json({ error: "Không tìm thấy tác phẩm công khai." }, { status: 404 });
  let chapterTitle: string | null = null;
  if (v.chapterId) {
    const { data: chapter, error } = await db.from("chapters").select("title").eq("id", v.chapterId).eq("book_id", book.id).eq("published", true).is("removed_at", null).maybeSingle();
    if (error) return NextResponse.json({ error: "Không thể kiểm tra chương." }, { status: 500 });
    if (!chapter) return NextResponse.json({ error: "Không tìm thấy chương công khai của tác phẩm." }, { status: 404 });
    chapterTitle = chapter.title;
  }
  const { error } = await db.from("content_reports").insert({ reporter_id: reporterId, book_id: book.id,
    chapter_id: v.chapterId, reason: v.reason, description: v.description, evidence_url: v.evidenceUrl,
    book_title: book.title, chapter_title: chapterTitle, book_slug: book.slug });
  if (error?.code === "23505") return NextResponse.json({ error: "Bạn đã báo cáo nội dung này. Báo cáo trước vẫn đang được xem xét." }, { status: 409 });
  if (error) { console.error("[content-reports] insert", error); return NextResponse.json({ error: "Không thể gửi báo cáo." }, { status: 500 }); }
  return NextResponse.json({ ok: true }, { status: 201 });
}
