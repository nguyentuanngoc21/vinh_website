import { getRequestContext, requestError } from '@/lib/mobile/request-context';
import { mobileResponse } from '@/lib/mobile/response';
import { getListingForViewer } from '@/lib/orders/public-listing';
export { OPTIONS } from '@/lib/mobile/response';
// A listing as a buyer sees it before ordering (tiers, terms, samples); 404 when not viewable.
export function GET(request: Request, context: { params: Promise<{ listingId: string }> }) {
  return mobileResponse(request, async () => {
    let auth;
    try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
    const { listingId } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(listingId))
      return Response.json({ error: 'Không tìm thấy dịch vụ.' }, { status: 404 });
    const listing = await getListingForViewer(auth.client, listingId, auth.userId);
    if (!listing) return Response.json({ error: 'Không tìm thấy dịch vụ.' }, { status: 404 });
    return Response.json({ listing });
  });
}
