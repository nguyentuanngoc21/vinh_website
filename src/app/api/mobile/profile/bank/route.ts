import { GET as read, POST as update } from '@/app/api/profile/bank/route';
import { VIETNAM_BANKS } from '@/lib/banks';
import { mobileResponse } from '@/lib/mobile/response';
export { OPTIONS } from '@/lib/mobile/response';
// The app has no copy of src/lib/banks.ts, so the picker list travels with the saved details.
export function GET(request: Request) {
  return mobileResponse(request, async () => {
    const response = await read(request);
    if (!response.ok) return response;
    return Response.json({ ...(await response.json()), banks: VIETNAM_BANKS });
  });
}
export function POST(request: Request) { return mobileResponse(request, () => update(request)); }
