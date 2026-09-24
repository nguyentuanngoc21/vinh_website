import { GET as list } from '@/app/api/messages/route';
import { mobileResponse } from '@/lib/mobile/response';
export { OPTIONS } from '@/lib/mobile/response';
export function GET(request: Request) { return mobileResponse(request, () => list(request)); }
