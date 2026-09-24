import { GET as read, POST as update } from '@/app/api/profile/me/route';
import { mobileResponse } from '@/lib/mobile/response';
export { OPTIONS } from '@/lib/mobile/response';
export function GET(request: Request) { return mobileResponse(request, () => read(request)); }
export function POST(request: Request) { return mobileResponse(request, () => update(request)); }
