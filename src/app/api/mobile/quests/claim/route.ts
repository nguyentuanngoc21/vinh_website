import { POST as claim } from '@/app/api/quests/claim/route';
import { mobileResponse } from '@/lib/mobile/response';
export { OPTIONS } from '@/lib/mobile/response';
export function POST(request: Request) { return mobileResponse(request, () => claim(request)); }
