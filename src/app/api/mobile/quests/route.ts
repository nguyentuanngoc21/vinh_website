import { GET as pool } from '@/app/api/quests/pool/route';
import { mobileResponse } from '@/lib/mobile/response';
export { OPTIONS } from '@/lib/mobile/response';
// Today's pool (created idempotently on first read), same shape as the web's /api/quests/pool.
export function GET(request: Request) { return mobileResponse(request, () => pool(request)); }
