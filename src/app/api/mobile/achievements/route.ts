import { GET as list } from '@/app/api/achievements/route';
import { mobileResponse } from '@/lib/mobile/response';
export { OPTIONS } from '@/lib/mobile/response';
// Lazily syncs unlocks (and rewards) before listing, exactly like the web page.
export function GET(request: Request) { return mobileResponse(request, () => list(request)); }
