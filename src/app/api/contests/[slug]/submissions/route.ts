import { genres } from "@/lib/books";
import { capabilitiesFor, getContestBySlug, getContestViewer } from "@/lib/contests/contest-service";
import { ContestError } from "@/lib/contests/errors";
import { getContestEntries, type EntrySort } from "@/lib/contests/feeds";
import { PRIVATE_NO_STORE, unauthorized, withContestContext } from "@/lib/contests/public-route";
import { readJson, requireUuid } from "@/lib/contests/route-helpers";
import { submitEntry } from "@/lib/contests/submission-service";

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

/**
 * POST /api/contests/:slug/submissions { bookId, acceptedRulesVersion } — gửi
 * tác phẩm dự thi. Một API cho cả 2 điểm vào (microsite và trang truyện của
 * tác giả). Không nhận authorId / status / eligibility từ client: server chạy
 * lại toàn bộ điều kiện rồi submit_contest_entry() kiểm lại dưới khoá.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return withContestContext(request, "submit entry", async ({ client, userId }) => {
    if (!userId) return unauthorized();
    const body = await readJson(request);
    const bookId = requireUuid(body.bookId, "book_not_found");
    const accepted = typeof body.acceptedRulesVersion === "string" ? body.acceptedRulesVersion : "";
    const contest = await getContestBySlug(client, slug);
    const { submission, eligibility } = await submitEntry(client, { contest, viewerId: userId, bookId, acceptedRulesVersion: accepted });
    return Response.json(
      { submission: { id: submission.id, status: submission.status, submitted_at: submission.submitted_at }, eligibility },
      { status: 201, headers: PRIVATE_NO_STORE }
    );
  });
}
