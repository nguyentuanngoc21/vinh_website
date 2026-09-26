import { getBookContestPanel } from "@/lib/contests/author-service";
import { ContestError } from "@/lib/contests/errors";
import { PRIVATE_NO_STORE, unauthorized, withContestContext } from "@/lib/contests/public-route";
import { requireUuid } from "@/lib/contests/route-helpers";

/**
 * GET /api/authoring/books/:bookId/cuoc-thi — section "Cuộc thi" của 1 truyện:
 * các bài dự thi của truyện (trạng thái, hạn, capability từng bài), các cuộc
 * thi đang nhận bài kèm điều kiện của truyện này, và khoá giá / độc quyền.
 */
export async function GET(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  return withContestContext(request, "book contest panel", async ({ client, userId }) => {
    if (!userId) return unauthorized();
    const { data: book, error } = await client.from("books").select("author_id, deleted_at").eq("id", requireUuid(bookId, "book_not_found")).maybeSingle();
    if (error || !book || book.author_id !== userId || book.deleted_at) throw new ContestError("book_not_found");
    return Response.json(await getBookContestPanel(client, { bookId, viewerId: userId }), { headers: PRIVATE_NO_STORE });
  });
}
