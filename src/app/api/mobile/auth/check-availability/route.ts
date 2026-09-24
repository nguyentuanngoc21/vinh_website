import { getMobileClients } from '@/lib/mobile/request-context';
import { publicMobileResponse } from '@/lib/mobile/response';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { checkSignupAvailability } from '@/lib/registration';
export { OPTIONS } from '@/lib/mobile/response';

export function GET(request: Request) {
  return publicMobileResponse(async () => {
    if (!checkRateLimit(`check-availability:${getClientIp(request)}`, 30, 60_000))
      return Response.json({ error: 'Bạn thao tác quá nhanh, vui lòng thử lại sau.' }, { status: 429 });
    const { searchParams } = new URL(request.url);
    return checkSignupAvailability(getMobileClients().admin, searchParams.get('field'), searchParams.get('value'));
  });
}
