import { getContestBySlug } from "@/lib/contests/contest-service";
import { PRIVATE_NO_STORE, unauthorized, withContestContext } from "@/lib/contests/public-route";
import { setReminder } from "@/lib/contests/public-view";

type Params = { params: Promise<{ slug: string }> };

/** POST — bật "Nhắc tôi khi mở" (Q4); chỉ khi cuộc thi đang "Sắp mở nhận bài". */
export async function POST(request: Request, { params }: Params) {
  const { slug } = await params;
  return withContestContext(request, "set reminder", async ({ client, userId }) => {
    if (!userId) return unauthorized();
    const contest = await getContestBySlug(client, slug);
    return Response.json({ reminder_on: await setReminder(client, { contest, userId, on: true }) }, { headers: PRIVATE_NO_STORE });
  });
}

/** DELETE — tắt nhắc. */
export async function DELETE(request: Request, { params }: Params) {
  const { slug } = await params;
  return withContestContext(request, "unset reminder", async ({ client, userId }) => {
    if (!userId) return unauthorized();
    const contest = await getContestBySlug(client, slug);
    return Response.json({ reminder_on: await setReminder(client, { contest, userId, on: false }) }, { headers: PRIVATE_NO_STORE });
  });
}
