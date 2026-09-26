import { capabilitiesFor, getContestBySlug, getContestViewer } from "@/lib/contests/contest-service";
import { ContestError } from "@/lib/contests/errors";
import { getPopularRanking } from "@/lib/contests/feeds";
import { PRIVATE_NO_STORE, withContestContext } from "@/lib/contests/public-route";

/**
 * GET /api/contests/:slug/rankings?kind=popular&cursor=&limit= — BXH theo
 * capability: Độc giả yêu thích mở từ lúc bình chọn (số phiếu ẩn đến khi hết
 * khung — Q3). Trending / Ban giám khảo / Chung cuộc thuộc Phase 2.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return withContestContext(request, "contest ranking", async ({ client, userId }) => {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") ?? "popular";
    if (kind !== "popular") throw new ContestError("ranking_not_visible");

    const contest = await getContestBySlug(client, slug);
    const capabilities = capabilitiesFor(contest, await getContestViewer(client, userId), null);
    const page = await getPopularRanking(client, {
      contest,
      capabilities,
      cursor: url.searchParams.get("cursor"),
      limit: Number(url.searchParams.get("limit")) || undefined,
    });
    return Response.json(page, { headers: PRIVATE_NO_STORE });
  });
}
