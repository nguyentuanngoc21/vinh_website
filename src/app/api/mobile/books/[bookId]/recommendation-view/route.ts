import { getRequestContext, requestError } from '@/lib/mobile/request-context';
import { mobileResponse } from '@/lib/mobile/response';
import { RewardEngine } from '@/lib/quests/reward-engine';
export { OPTIONS } from '@/lib/mobile/response';

// Quest reader_view_recommendations: counted when a signed-in reader opens a book from "Gợi ý cho bạn",
// the same trigger as the web book page's ?from=goi-y (src/app/truyen/[slug]/page.tsx).
export function POST(request: Request) {
  return mobileResponse(request, async () => {
    let auth;
    try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
    if (!auth.userId) return Response.json({ error: 'Vui lòng đăng nhập lại.' }, { status: 401 });
    const result = await RewardEngine.incrementTaskProgress(auth.client, { userId: auth.userId, taskCode: 'reader_view_recommendations' });
    if (!result.ok) console.error('[mobile] recommendation view quest failed:', result.error);
    return Response.json({ ok: true });
  });
}
