import { DELETE, GET as read, PATCH, POST as createUpload } from '@/app/api/profile/cover/route';
import { imageAction } from '@/lib/mobile/image-actions';
import { mobileResponse } from '@/lib/mobile/response';
export { OPTIONS } from '@/lib/mobile/response';
export function GET(request: Request) { return mobileResponse(request, () => read(request)); }
export function POST(request: Request) {
  return mobileResponse(request, () => imageAction(request, { POST: createUpload, PATCH, DELETE }));
}
