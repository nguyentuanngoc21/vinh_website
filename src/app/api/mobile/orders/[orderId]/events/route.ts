import { GET as read } from '@/app/api/orders/[orderId]/events/route';
import { mobileResponse } from '@/lib/mobile/response';
export { OPTIONS } from '@/lib/mobile/response';
export function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  return mobileResponse(request, () => read(request, context));
}
