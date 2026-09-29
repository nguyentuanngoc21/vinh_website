const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'private, no-store' };
/** JSON response with the shared mobile CORS/no-store headers. */
export const mobileJson = (body: unknown, status = 200) => Response.json(body, { status, headers });
/** CORS preflight reply; routes with a narrower method/header set pass their own lists. */
export function mobileOptions(methods = 'GET, POST, OPTIONS', allowHeaders = 'Authorization, Content-Type') {
  return new Response(null, { status: 204, headers: { ...headers,
    'Access-Control-Allow-Methods': methods, 'Access-Control-Allow-Headers': allowHeaders } });
}
export function OPTIONS() {
  return mobileOptions();
}
export async function mobileResponse(request: Request, task: () => Promise<Response>) {
  if (!/^Bearer \S+$/i.test(request.headers.get('authorization') || '')) return Response.json({ error: 'Vui lòng đăng nhập.' }, { status: 401, headers });
  try {
    const response = await task();
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    return response;
  } catch { return Response.json({ error: 'Dịch vụ tạm thời không khả dụng.' }, { status: 503, headers }); }
}
/** For the few mobile routes used before sign-in (registration); callers must rate-limit. */
export async function publicMobileResponse(task: () => Promise<Response>) {
  try {
    const response = await task();
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    return response;
  } catch { return Response.json({ error: 'Dịch vụ tạm thời không khả dụng.' }, { status: 503, headers }); }
}
