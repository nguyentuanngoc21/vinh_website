import { genres } from "@/lib/books";
import { capabilitiesFor, getContestBySlug, getContestViewer } from "@/lib/contests/contest-service";
import { ContestError } from "@/lib/contests/errors";
import { getContestEntries, type EntrySort } from "@/lib/contests/feeds";
import { PRIVATE_NO_STORE, withContestContext } from "@/lib/contests/public-route";

const SORTS: EntrySort[] = ["new", "discover", "az"];
const GENRES = new Set(genres.map((g) => g.label));

/**
 * GET /api/contests/:slug/submissions?sort=new|discover|az&genre=&cursor=&limit=
 * — bài dự thi hợp lệ (sách còn hiển thị), kèm trạng thái nút Bình chọn của
 * người xem cho từng bài (tính theo lô trong SQL).
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return withContestContext(request, "list contest entries", async ({ client, userId }) => {
    const url = new URL(request.url);
    const sort = (url.searchParams.get("sort") ?? "new") as EntrySort;
    if (!SORTS.includes(sort)) throw new ContestError("invalid_sort");
    const genre = url.searchParams.get("genre");
    if (genre && !GENRES.has(genre)) throw new ContestError("invalid_input", ["Thể loại không hợp lệ"]);

    const contest = await getContestBySlug(client, slug);
    const viewer = await getContestViewer(client, userId);
    const capabilities = capabilitiesFor(contest, viewer, null);
    const page = await getContestEntries(client, {
      contest,
      capabilities,
      sort,
      genre,
      cursor: url.searchParams.get("cursor"),
      limit: Number(url.searchParams.get("limit")) || undefined,
      viewerId: userId,
    });
    return Response.json(page, { headers: PRIVATE_NO_STORE });
  });
}
