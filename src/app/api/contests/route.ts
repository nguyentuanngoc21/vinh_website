import { listContestsForHub } from "@/lib/contests/contest-service";
import { PRIVATE_NO_STORE, withContestContext } from "@/lib/contests/public-route";

/** GET /api/contests — hub: cuộc thi nổi bật, đang diễn ra, đã kết thúc (kèm số bài/tác giả). */
export async function GET(request: Request) {
  return withContestContext(request, "list contests", async ({ client }) => {
    const hub = await listContestsForHub(client);
    return Response.json(hub, { headers: PRIVATE_NO_STORE });
  });
}
