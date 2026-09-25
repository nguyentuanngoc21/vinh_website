import { GET as list, POST as add } from '@/app/api/audio/[audioNarrationId]/comments/route';
import { DELETE as remove } from '@/app/api/audio/[audioNarrationId]/comments/[commentId]/route';
import { POST as toggleLike } from '@/app/api/audio/[audioNarrationId]/comments/[commentId]/like/route';
import { mobileResponse } from '@/lib/mobile/response';
export { OPTIONS } from '@/lib/mobile/response';

type Ctx = { params: Promise<{ audioNarrationId: string }> };
const forward = (request: Request, method: string, body?: unknown) => new Request(request.url, {
  method, headers: new Headers({ Authorization: request.headers.get('authorization') ?? '', 'Content-Type': 'application/json' }),
  body: body === undefined ? undefined : JSON.stringify(body),
});
// Comments under an audio narration, exactly as the web now-playing panel (one reply level, likes).
export function GET(request: Request, context: Ctx) {
  return mobileResponse(request, () => list(request, context));
}
export function POST(request: Request, context: Ctx) {
  return mobileResponse(request, async () => {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const commentId = typeof body?.commentId === 'string' ? body.commentId : '';
    const withComment = async () => ({ params: Promise.resolve({ ...(await context.params), commentId }) });
    switch (body?.action) {
      case 'comment': return add(forward(request, 'POST', { content: body.content, parentCommentId: body.parentCommentId ?? null }), context);
      case 'delete': return remove(forward(request, 'DELETE'), await withComment());
      case 'like': return toggleLike(forward(request, 'POST'), await withComment());
      default: return Response.json({ error: 'Thao tác không hợp lệ.' }, { status: 400 });
    }
  });
}
