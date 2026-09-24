import { GET as read } from '@/app/api/orders/[orderId]/original-file/route';
import { mobileResponse } from '@/lib/mobile/response';
export { OPTIONS } from '@/lib/mobile/response';
// Download link for the original (unwatermarked) file, only after both parties agreed.
export function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  return mobileResponse(request, () => read(request, context));
}
