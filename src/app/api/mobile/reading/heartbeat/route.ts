import { getRequestContext, requestError } from '@/lib/mobile/request-context';
import { mobileResponse } from '@/lib/mobile/response';
import { parseHeartbeatBody, recordReadingHeartbeat } from '@/lib/reading/record-heartbeat';
export { OPTIONS } from '@/lib/mobile/response';

// Mobile counterpart of /api/reading/heartbeat — app sends one every 60s while the chapter is on screen.
export function POST(request: Request) {
  return mobileResponse(request, async () => {
    let auth;
    try { auth = await getRequestContext(request); } catch (error) { return requestError(error); }
    const { client, userId } = auth;
    if (!userId) return Response.json({ error: 'Vui lòng đăng nhập lại.' }, { status: 401 });
    const input = parseHeartbeatBody(await request.json().catch(() => null));
    if (!input) return Response.json({ error: 'Dữ liệu nhịp đọc không hợp lệ.' }, { status: 400 });
    const result = await recordReadingHeartbeat(client, userId, input);
    return result.ok
      ? Response.json({ sessionId: result.sessionId, activeSeconds: result.activeSeconds })
      : Response.json({ error: result.error }, { status: result.status });
  });
}
