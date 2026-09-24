import { GET as getOptions } from '@/app/api/profile/services/tag-options/route';
import { mobileResponse } from '@/lib/mobile/response';
export { OPTIONS } from '@/lib/mobile/response';
export function GET(request: Request) {
  return mobileResponse(request, () => getOptions(request));
}
