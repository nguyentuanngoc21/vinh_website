import { listAuthorContests } from "@/lib/contests/author-service";
import { PRIVATE_NO_STORE, unauthorized, withContestContext } from "@/lib/contests/public-route";

/** GET /api/authoring/contests — "Cuộc thi của tôi": đang tham gia / đã kết thúc (portfolio). */
export async function GET(request: Request) {
  return withContestContext(request, "author contests", async ({ client, userId }) => {
    if (!userId) return unauthorized();
    return Response.json(await listAuthorContests(client, { viewerId: userId }), { headers: PRIVATE_NO_STORE });
  });
}
