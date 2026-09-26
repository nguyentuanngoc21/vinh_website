import { getContestBySlug } from "@/lib/contests/contest-service";
import { PRIVATE_NO_STORE, unauthorized, withContestContext } from "@/lib/contests/public-route";
import { requireUuid } from "@/lib/contests/route-helpers";
import { withdrawEntry } from "@/lib/contests/submission-service";

/**
 * POST /api/contests/:slug/submissions/:submissionId/withdraw — tác giả rút
 * bài của chính mình, chỉ trước hạn nhận bài (D6). Phiếu đã có không bị xoá
 * nhưng không còn được tính.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string; submissionId: string }> }) {
  const { slug, submissionId } = await params;
  return withContestContext(request, "withdraw entry", async ({ client, userId }) => {
    if (!userId) return unauthorized();
    const contest = await getContestBySlug(client, slug);
    const submission = await withdrawEntry(client, { contest, viewerId: userId, submissionId: requireUuid(submissionId, "submission_not_found") });
    return Response.json({ submission: { id: submission.id, status: submission.status } }, { headers: PRIVATE_NO_STORE });
  });
}
