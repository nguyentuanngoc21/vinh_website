import { POST as reset } from '@/app/api/quests/reset/route';
import { mobileResponse } from '@/lib/mobile/response';
export { OPTIONS } from '@/lib/mobile/response';
export function POST(request: Request) { return mobileResponse(request, () => reset(request)); }
