import { getRequestContext, requestError } from '@/lib/mobile/request-context';
import { mobileResponse } from '@/lib/mobile/response';
import { withParties } from '@/lib/mobile/orders';
import { listOrdersForUser } from '@/lib/orders/order-service';
export { OPTIONS } from '@/lib/mobile/response';

// All of the caller's orders, or only those with `withUserId` (a chat thread). Same safe query as the web.
export function GET(request: Request) {
  return mobileResponse(request, async () => {
    let auth;
    try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
    const { client, userId } = auth;
    if (!userId) return Response.json({ error: 'Vui lòng đăng nhập lại.' }, { status: 401 });
    const withUserId = new URL(request.url).searchParams.get('withUserId');
    const result = await listOrdersForUser(client, userId, withUserId || null);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ orders: await withParties(client, userId, result.orders) });
  });
}
