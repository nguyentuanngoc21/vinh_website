import { getContestBySlug } from "@/lib/contests/contest-service";
import { PRIVATE_NO_STORE, unauthorized, withContestContext } from "@/lib/contests/public-route";
import { requireUuid } from "@/lib/contests/route-helpers";
import { ContestError } from "@/lib/contests/errors";
import { previewEligibility } from "@/lib/contests/submission-service";

/**
 * GET /api/contests/:slug/eligibility?bookId= — xem trước điều kiện dự thi
 * cho 1 sách, hoặc mọi sách của người xem (nạp theo lô). Chỉ để báo sớm; lúc
 * gửi server kiểm lại toàn bộ.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return withContestContext(request, "preview eligibility", async ({ client, userId }) => {
    if (!userId) return unauthorized();
    const contest = await getContestBySlug(client, slug);
    const search = new URL(request.url).searchParams;
    const raw = search.get("bookId");
    const selection = search.get("chapterIds");
    if (selection !== null && !raw) throw new ContestError("invalid_chapter_selection");
    const chapterIds = selection === null ? undefined : selection.split(",").filter(Boolean).map((id) => requireUuid(id, "invalid_chapter_selection"));
    if (chapterIds && (chapterIds.length > 1000 || new Set(chapterIds).size !== chapterIds.length)) throw new ContestError("invalid_chapter_selection");
    const books = await previewEligibility(client, {
      contest,
      viewerId: userId,
      bookId: raw ? requireUuid(raw, "book_not_found") : null,
      chapterIds,
    });
    return Response.json({ rules_version: contest.rules_version, books }, { headers: PRIVATE_NO_STORE });
  });
}
