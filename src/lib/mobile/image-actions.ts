type Handler = (request: Request) => Promise<Response>;
/** Maps mobile POST { action } onto the web image routes' POST/PATCH/DELETE (signed upload flow). */
export async function imageAction(request: Request, handlers: { POST: Handler; PATCH: Handler; DELETE: Handler }) {
  const body = await request.json().catch(() => null);
  const forward = (method: string, payload?: unknown) => new Request(request.url, {
    method, headers: request.headers, body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  if (body?.action === 'upload-url') return handlers.POST(forward('POST', { contentType: body.contentType }));
  if (body?.action === 'confirm') return handlers.PATCH(forward('PATCH', { path: body.path }));
  if (body?.action === 'remove') return handlers.DELETE(forward('DELETE'));
  return Response.json({ error: 'Thao tác không hợp lệ.' }, { status: 400 });
}
