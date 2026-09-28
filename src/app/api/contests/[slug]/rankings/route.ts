import { capabilitiesFor, getContestBySlug, getContestViewer } from "@/lib/contests/contest-service";
import { ContestError } from "@/lib/contests/errors";
import { getPopularRanking, getScoredRanking, getTrendingRanking } from "@/lib/contests/feeds";
import { PRIVATE_NO_STORE, withContestContext } from "@/lib/contests/public-route";
import { ensureFreshScores } from "@/lib/contests/scores-service";

/**
 * GET /api/contests/:slug/rankings?kind=popular|trending|final|jury&cursor=&limit=
 * — BXH theo capability: Bảng phiếu bình chọn mở từ lúc bình chọn (số phiếu ẩn
 * đến khi hết khung — Q3); Trending (độc giả mới 7 ngày, P4) khi có bài và còn
 * diễn ra; Chung cuộc / Ban giám khảo sau khi công bố, từ lượt tính đang công
 * bố (Slice 2.6b — trả đủ, không phân trang; null nếu chưa có lượt công bố).
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return withContestContext(request, "contest ranking", async ({ client, userId }) => {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") ?? "popular";
    if (kind !== "popular" && kind !== "trending" && kind !== "final" && kind !== "jury") throw new ContestError("ranking_not_visible");

    const contest = await getContestBySlug(client, slug);
    const capabilities = capabilitiesFor(contest, await getContestViewer(client, userId), null);
    const input = {
      contest,
      capabilities,
      cursor: url.searchParams.get("cursor"),
      limit: Number(url.searchParams.get("limit")) || undefined,
    };
    if (kind === "final" || kind === "jury") {
      const page = await getScoredRanking(client, { contest, capabilities, kind });
      return Response.json(page ?? { items: [], next_cursor: null, values_visible: true, changes_visible: false }, { headers: PRIVATE_NO_STORE });
    }
    if (kind === "trending") {
      // Chỉ trang đầu gọi làm mới bảng điểm (SQL tự bỏ qua nếu chưa quá 15 phút).
      if (!input.cursor && capabilities.rankings_visible.trending) await ensureFreshScores(client, contest.id);
      return Response.json(await getTrendingRanking(client, input), { headers: PRIVATE_NO_STORE });
    }
    return Response.json(await getPopularRanking(client, input), { headers: PRIVATE_NO_STORE });
  });
}
