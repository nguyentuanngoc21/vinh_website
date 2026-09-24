import { getMobileClients } from '@/lib/mobile/request-context';
import { publicMobileResponse } from '@/lib/mobile/response';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { registerAccount } from '@/lib/registration';
export { OPTIONS } from '@/lib/mobile/response';

// Same rules as /api/auth/register, against the mobile Supabase project. The app then
// confirms the email with the OTP code via Supabase Auth directly (no PKCE cookie needed).
export function POST(request: Request) {
  return publicMobileResponse(async () => {
    if (!checkRateLimit(`register:${getClientIp(request)}`, 10, 10 * 60_000))
      return Response.json({ error: 'Bạn đã thử đăng ký quá nhiều lần. Vui lòng thử lại sau ít phút.' }, { status: 429 });
    const form = await request.formData().catch(() => null);
    if (!form) return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 400 });
    const { anon, admin } = getMobileClients();
    return registerAccount(form, { authClient: anon, admin, origin: new URL(request.url).origin });
  });
}
