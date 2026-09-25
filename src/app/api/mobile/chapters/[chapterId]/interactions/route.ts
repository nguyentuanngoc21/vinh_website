import { GET as listComments, POST as addComment } from '@/app/api/chapters/[chapterId]/comments/route';
import { DELETE as deleteComment } from '@/app/api/chapters/[chapterId]/comments/[commentId]/route';
import { GET as listHighlights, POST as addHighlight } from '@/app/api/chapters/[chapterId]/highlights/route';
import { DELETE as deleteHighlight } from '@/app/api/chapters/[chapterId]/highlights/[highlightId]/route';
import { POST as toggleVote } from '@/app/api/chapters/[chapterId]/vote/route';
import { POST as voteTrope } from '@/app/api/chapters/[chapterId]/trope-vote/route';
import { POST as recordShare } from '@/app/api/books/[bookId]/share/route';
import { POST as followAuthor } from '@/app/api/authors/[authorId]/follow/route';
import { getRequestContext, requestError } from '@/lib/mobile/request-context';
import { mobileResponse } from '@/lib/mobile/response';
import { getChapterInteractions } from '@/lib/reading/chapter-interactions';
export { OPTIONS } from '@/lib/mobile/response';

type Ctx = { params: Promise<{ chapterId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const forward = (request: Request, method: string, body?: unknown) => new Request(request.url, {
  method, headers: new Headers({ Authorization: request.headers.get('authorization') ?? '', 'Content-Type': 'application/json' }),
  body: body === undefined ? undefined : JSON.stringify(body),
});

// Everything the reader shows around a chapter, in one request: web comment/highlight routes plus state.
export function GET(request: Request, context: Ctx) {
  return mobileResponse(request, async () => {
    let auth;
    try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
    if (!auth.userId) return Response.json({ error: 'Vui lòng đăng nhập lại.' }, { status: 401 });
    const { chapterId } = await context.params;
    if (!UUID.test(chapterId)) return Response.json({ error: 'Không tìm thấy chương.' }, { status: 404 });
    const [state, comments, highlights] = await Promise.all([
      getChapterInteractions(auth.client, chapterId, auth.userId),
      listComments(forward(request, 'GET'), context).then(r => r.json()),
      listHighlights(forward(request, 'GET'), context).then(r => r.json()),
    ]);
    if (!state) return Response.json({ error: 'Không tìm thấy chương.' }, { status: 404 });
    return Response.json({ ...state, comments: comments.comments ?? [], highlights: highlights.highlights ?? [] });
  });
}

type Body = Record<string, unknown>;
const id = (v: unknown) => (typeof v === 'string' ? v : '');
// action → web handler; only each action's own fields are forwarded. The web routes check read access.
export function POST(request: Request, context: Ctx) {
  return mobileResponse(request, async () => {
    const body = (await request.json().catch(() => null)) as Body | null;
    const params = await context.params;
    switch (body?.action) {
      case 'comment':
        return addComment(forward(request, 'POST', { content: body.content, paragraphIndex: body.paragraphIndex, parentCommentId: body.parentCommentId ?? null }), context);
      case 'delete-comment':
        return deleteComment(forward(request, 'DELETE'), { params: Promise.resolve({ ...params, commentId: id(body.commentId) }) });
      case 'highlight':
        return addHighlight(forward(request, 'POST', { paragraphIndex: body.paragraphIndex, charStart: body.charStart, charEnd: body.charEnd }), context);
      case 'remove-highlight':
        return deleteHighlight(forward(request, 'DELETE'), { params: Promise.resolve({ ...params, highlightId: id(body.highlightId) }) });
      case 'vote':
        return toggleVote(forward(request, 'POST'), context);
      case 'trope-vote':
        return voteTrope(forward(request, 'POST', { characterId: body.characterId }), context);
      case 'share':
        // The share route only records quest progress; the app calls it after the share sheet reports a real share.
        return recordShare(forward(request, 'POST'), { params: Promise.resolve({ bookId: id(body.bookId) }) });
      case 'follow-author':
        return followAuthor(forward(request, 'POST'), { params: Promise.resolve({ authorId: id(body.authorId) }) });
      default:
        return Response.json({ error: 'Thao tác không hợp lệ.' }, { status: 400 });
    }
  });
}
