import { getRequestContext, requestError } from '@/lib/mobile/request-context';
import { mobileResponse } from '@/lib/mobile/response';
export { OPTIONS } from '@/lib/mobile/response';
export function GET(request: Request) {
  return mobileResponse(request, async () => {
    let auth;
    try { auth = await getRequestContext(request); } catch (error) { return requestError(error); }
    const { client, userId } = auth;
    const username = new URL(request.url).searchParams.get('username')?.trim().replace(/^@/, '') || '';
    if (!username || username.length > 80) return Response.json({ error: 'Nhập tên tài khoản hợp lệ.' }, { status: 400 });
    const { data, error } = await client.from('author_public_profiles').select('id,nickname,username')
      .eq('username', username).maybeSingle();
    if (error) return Response.json({ error: 'Không tìm được tài khoản. Vui lòng thử lại.' }, { status: 502 });
    if (!data) return Response.json({ error: 'Không tìm thấy tên tài khoản này.' }, { status: 404 });
    if (data.id === userId) return Response.json({ error: 'Không thể tự nhắn tin cho chính mình.' }, { status: 400 });
    return Response.json({ person: data });
  });
}
