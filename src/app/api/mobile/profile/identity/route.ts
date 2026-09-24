import { GET as read, POST as verify } from '@/app/api/profile/identity/route';
import { mobileResponse } from '@/lib/mobile/response';
export { OPTIONS } from '@/lib/mobile/response';
// Same OCR check, private bucket and masking as the web identity form.
export function GET(request: Request) { return mobileResponse(request, () => read(request)); }
export function POST(request: Request) { return mobileResponse(request, () => verify(request)); }
