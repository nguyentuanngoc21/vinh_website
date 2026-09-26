import { loadContestPage } from "@/lib/contests/public-view";
import { PRIVATE_NO_STORE, withContestContext } from "@/lib/contests/public-route";

/**
 * GET /api/contests/:slug — thông tin cuộc thi + capability của người xem
 * (can_submit, can_vote, results_visible…) để client render CTA, không tự so
 * deadline. Nháp trả 404.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return withContestContext(request, "get contest", async ({ client, userId }) => {
    const { contest, capabilities, viewerEntries, counts, announcedAt, reminderOn } = await loadContestPage(client, {
      slug,
      viewerId: userId,
    });
    return Response.json(
      { contest, capabilities, viewer_entries: viewerEntries, counts, announced_at: announcedAt, reminder_on: reminderOn },
      { headers: PRIVATE_NO_STORE }
    );
  });
}
