import { GET as read, POST as send } from '@/app/api/messages/[userId]/route';
import { mobileResponse } from '@/lib/mobile/response';
export { OPTIONS } from '@/lib/mobile/response';
type Context = { params: Promise<{ userId: string }> };
export function GET(request: Request, context: Context) { return mobileResponse(request, () => read(request, context)); }
export function POST(request: Request, context: Context) { return mobileResponse(request, () => send(request, context)); }
