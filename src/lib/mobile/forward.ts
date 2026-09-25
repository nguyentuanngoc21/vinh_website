/**
 * Re-issues a mobile request to a web route handler with a new method/body. Only the caller's
 * Authorization header is carried over — the web handler verifies it itself (getUserContext /
 * getRequestContext), so nothing the app sends besides the whitelisted body reaches the handler.
 */
export function forwardRequest(request: Request, method: string, body?: unknown) {
  return new Request(request.url, {
    method,
    headers: new Headers({ Authorization: request.headers.get('authorization') ?? '', 'Content-Type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
/** Keeps only the listed keys that the app actually sent. */
export function pick(body: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.filter(k => Object.hasOwn(body, k)).map(k => [k, body[k]]));
}
