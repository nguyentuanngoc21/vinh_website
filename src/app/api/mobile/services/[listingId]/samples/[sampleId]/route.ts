import { DELETE } from '@/app/api/profile/services/[listingId]/samples/[sampleId]/route';
import { mobileResponse } from '@/lib/mobile/response';
export { OPTIONS } from '@/lib/mobile/response';
export function POST(request: Request, context: { params: Promise<{ listingId: string; sampleId: string }> }) {
  return mobileResponse(request, async () => {
    const body = await request.json().catch(() => null);
    if (body?.action !== 'remove') return Response.json({ error: 'Thao tác không hợp lệ.' }, { status: 400 });
    return DELETE(request, context);
  });
}
