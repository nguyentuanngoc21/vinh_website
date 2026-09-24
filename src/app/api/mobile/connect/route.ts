import { getRequestContext, requestError } from '@/lib/mobile/request-context';
import { mobileResponse } from '@/lib/mobile/response';
import { loadConnectDirectory } from '@/lib/connect/directory';
export { OPTIONS } from '@/lib/mobile/response';
// Same people, works, services and follow state as the web's /ket-noi page.
export function GET(request: Request) {
  return mobileResponse(request, async () => {
    let auth;
    try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
    return Response.json({ people: await loadConnectDirectory(auth.client, auth.userId) });
  });
}
