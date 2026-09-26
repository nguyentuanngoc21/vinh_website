import { getContestBySlug } from "@/lib/contests/contest-service";
import { PRIVATE_NO_STORE, unauthorized, withContestContext } from "@/lib/contests/public-route";
import { castVote, retractVote } from "@/lib/contests/vote-service";

type Params = { params: Promise<{ slug: string; submissionId: string }> };

/**
 * POST — bình chọn (D5: 1 phiếu / bài / tài khoản, đã đọc hết ≥ 1 chương,
 * tài khoản đủ tuổi). Luật kiểm trong cast_contest_vote(); lỗi trả mã lý do.
 */
export async function POST(request: Request, { params }: Params) {
  const { slug, submissionId } = await params;
  return withContestContext(request, "cast vote", async ({ client, userId }) => {
    if (!userId) return unauthorized();
    const contest = await getContestBySlug(client, slug);
    await castVote(client, { contest, viewerId: userId, submissionId });
    return Response.json({ has_voted: true }, { status: 201, headers: PRIVATE_NO_STORE });
  });
}

/** DELETE — bỏ phiếu (chỉ trong khung bình chọn). */
export async function DELETE(request: Request, { params }: Params) {
  const { slug, submissionId } = await params;
  return withContestContext(request, "retract vote", async ({ client, userId }) => {
    if (!userId) return unauthorized();
    const contest = await getContestBySlug(client, slug);
    await retractVote(client, { contest, viewerId: userId, submissionId });
    return Response.json({ has_voted: false }, { headers: PRIVATE_NO_STORE });
  });
}
