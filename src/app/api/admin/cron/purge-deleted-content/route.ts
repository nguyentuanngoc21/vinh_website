import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Scheduled qua vercel.json (hàng ngày) — dọn NỘI DUNG NẶNG (không xoá
 * hàng) của truyện/chương đã bị xoá/gỡ quá RETENTION_DAYS ngày. Quyết
 * định thiết kế (đã xác nhận với admin): KHÔNG xoá thật book/chapter —
 * orders.book_id/author_name_agreements.book_id tham chiếu books KHÔNG
 * có ON DELETE CASCADE, nên DELETE thật sẽ vỡ khoá ngoại (nếu sách có
 * đơn ghostwriting/thoả thuận đứng tên) hoặc phải ép cascade và phá huỷ
 * vĩnh viễn hồ sơ giao dịch — không an toàn cho 1 sản phẩm có giao dịch
 * token thật. Thay vào đó chỉ rỗng hoá phần NẶNG (content chương, cover,
 * synopsis), giữ nguyên hàng metadata (tiêu đề, lý do gỡ, ai gỡ, audit
 * trail ở chapter_moderation_actions/book_moderation_actions) vĩnh viễn.
 *
 * content_purged_at not null đánh dấu đã dọn — content-table.tsx/
 * chapter-moderation-table.tsx dùng cờ này để ẩn mặc định + tắt nút
 * "Khôi phục" (phục hồi 1 hàng đã rỗng nội dung là vô nghĩa).
 *
 * 2 luồng độc lập, không chồng nhau:
 *   1. Sách đã xoá (books.deleted_at) quá hạn — dọn CẢ sách (cover/
 *      synopsis) LẪN content của MỌI chương thuộc sách đó (chương không
 *      thể đọc được nữa từ lúc sách bị xoá — xem RLS "published chapters
 *      follow their book's visibility" — nên dọn cùng lúc, không đợi
 *      removed_at riêng của từng chương, vì chương KHÔNG có removed_at
 *      trong trường hợp này).
 *   2. Chương bị admin gỡ RIÊNG LẺ (chapters.removed_at, sách vẫn sống)
 *      quá hạn — dọn content của chương đó (không đụng gì tới sách).
 *
 * Auth: cùng pattern api/wallet/cron/settle-pending/route.ts —
 * `Authorization: Bearer ${CRON_SECRET}` do Vercel Cron tự gắn.
 */
const RETENTION_DAYS = 30;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    console.error("[admin] CRON_SECRET is not set — purge-deleted-content is unauthenticated.");
  }

  const supabase = createServiceRoleClient();
  const nowIso = new Date().toISOString();
  const cutoffIso = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // 1. Sách đã xoá quá hạn, chưa dọn.
  const { data: expiredBooks, error: expiredBooksError } = await supabase
    .from("books")
    .select("id")
    .lt("deleted_at", cutoffIso)
    .is("content_purged_at", null);
  if (expiredBooksError) {
    console.error("[admin] purge-deleted-content: query expired books failed:", expiredBooksError);
    return NextResponse.json({ error: "Truy vấn sách đã xoá thất bại." }, { status: 500 });
  }
  const expiredBookIds = (expiredBooks ?? []).map((b) => b.id);

  let chaptersPurgedViaBook = 0;
  if (expiredBookIds.length > 0) {
    const { data: updatedChapters, error: chaptersError } = await supabase
      .from("chapters")
      .update({ content: "", content_purged_at: nowIso })
      .in("book_id", expiredBookIds)
      .is("content_purged_at", null)
      .select("id");
    if (chaptersError) {
      console.error("[admin] purge-deleted-content: purge chapters of expired books failed:", chaptersError);
    } else {
      chaptersPurgedViaBook = updatedChapters?.length ?? 0;
    }

    const { error: booksError } = await supabase
      .from("books")
      .update({ cover_design_item_id: null, synopsis: null, content_purged_at: nowIso })
      .in("id", expiredBookIds);
    if (booksError) {
      console.error("[admin] purge-deleted-content: purge expired books failed:", booksError);
    }
  }

  // 2. Chương bị gỡ riêng lẻ quá hạn (sách vẫn sống) — chapters của các
  // sách vừa dọn ở bước 1 đã có content_purged_at nên KHÔNG bị query này
  // chạm lại (điều kiện .is("content_purged_at", null)).
  const { data: updatedStandaloneChapters, error: standaloneError } = await supabase
    .from("chapters")
    .update({ content: "", content_purged_at: nowIso })
    .lt("removed_at", cutoffIso)
    .is("content_purged_at", null)
    .select("id");
  if (standaloneError) {
    console.error("[admin] purge-deleted-content: purge standalone removed chapters failed:", standaloneError);
  }

  return NextResponse.json({
    purgedBooks: expiredBookIds.length,
    purgedChaptersViaBook: chaptersPurgedViaBook,
    purgedChaptersStandalone: updatedStandaloneChapters?.length ?? 0,
  });
}
