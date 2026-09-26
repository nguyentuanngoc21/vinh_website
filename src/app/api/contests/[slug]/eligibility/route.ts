import { getContestBySlug } from "@/lib/contests/contest-service";
import { PRIVATE_NO_STORE, unauthorized, withContestContext } from "@/lib/contests/public-route";
import { requireUuid } from "@/lib/contests/route-helpers";
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
    const raw = new URL(request.url).searchParams.get("bookId");
    const books = await previewEligibility(client, {
      contest,
      viewerId: userId,
      bookId: raw ? requireUuid(raw, "book_not_found") : null,
    });
    return Response.json({ rules_version: contest.rules_version, books }, { headers: PRIVATE_NO_STORE });
  });
}
