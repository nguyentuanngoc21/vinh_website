import { getRequestContext, requestError } from '@/lib/mobile/request-context';
import { mobileResponse } from '@/lib/mobile/response';
import { withParties } from '@/lib/mobile/orders';
import { getOrderForActor } from '@/lib/orders/order-service';
export { OPTIONS } from '@/lib/mobile/response';

// Detail for one order the caller is party to (404 otherwise, never "exists but not yours").
export function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  return mobileResponse(request, async () => {
    let auth;
    try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
    const { client, userId } = auth;
    if (!userId) return Response.json({ error: 'Vui lòng đăng nhập lại.' }, { status: 401 });
    const { orderId } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId))
      return Response.json({ error: 'Không tìm thấy đơn hàng.' }, { status: 404 });
    const order = await getOrderForActor(client, orderId, userId);
    if (!order) return Response.json({ error: 'Không tìm thấy đơn hàng.' }, { status: 404 });
    const { data: listing } = await client.from('service_listings').select('name,service_type').eq('id', order.listing_id).maybeSingle();
    const [withNames] = await withParties(client, userId, [order]);
    return Response.json({ order: { ...withNames, service_listings: listing ?? null } });
  });
}
