import { POST as accept } from '@/app/api/profile/agreements/[agreementId]/accept/route';
import { mobileResponse } from '@/lib/mobile/response';
export { OPTIONS } from '@/lib/mobile/response';
export function POST(request: Request, context: { params: Promise<{ agreementId: string }> }) {
  return mobileResponse(request, () => accept(request, context));
}
