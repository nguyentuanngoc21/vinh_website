import { PATCH } from '@/app/api/profile/services/[listingId]/route';
import { mobileResponse } from '@/lib/mobile/response';
import { serviceEdit } from '@/lib/mobile/service-edit';
export { OPTIONS } from '@/lib/mobile/response';
export function POST(request: Request, context: { params: Promise<{ listingId: string }> }) {
  return mobileResponse(request, async () => {
    const body = await request.json().catch(() => null);
    let patch;
    try { patch = body?.action === 'edit' ? serviceEdit(body.fields) :
      typeof body?.isAcceptingOrders === 'boolean' ? { isAcceptingOrders: body.isAcceptingOrders } :
      typeof body?.isAcceptingCommissions === 'boolean' ? { isAcceptingCommissions: body.isAcceptingCommissions } : null; }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Dữ liệu không hợp lệ.' }, { status: 400 }); }
    if (!patch) return Response.json({ error: 'Thao tác không hợp lệ.' }, { status: 400 });
    const forwarded = new Request(request.url, { method: 'PATCH', headers: request.headers,
      body: JSON.stringify(patch) });
    return PATCH(forwarded, context);
  });
}
