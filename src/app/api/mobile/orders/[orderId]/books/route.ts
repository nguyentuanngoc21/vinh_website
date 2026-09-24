import { getRequestContext, requestError } from '@/lib/mobile/request-context';
import { mobileResponse } from '@/lib/mobile/response';
import { getOrderForActor } from '@/lib/orders/order-service';
export { OPTIONS } from '@/lib/mobile/response';

// The seller's own books to attach to a ghostwriting order (attach_order_book() re-checks ownership).
export function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  return mobileResponse(request, async () => {
    let auth;
    try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
    const { client, userId } = auth;
    if (!userId) return Response.json({ error: 'Vui lòng đăng nhập lại.' }, { status: 401 });
    const order = await getOrderForActor(client, (await context.params).orderId, userId);
    if (!order || order.seller_id !== userId) return Response.json({ error: 'Không tìm thấy đơn hàng.' }, { status: 404 });
    const { data, error } = await client.from('books').select('id,title').eq('author_id', userId).is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) return Response.json({ error: 'Không tải được danh sách truyện.' }, { status: 502 });
    return Response.json({ books: data ?? [] });
  });
}
