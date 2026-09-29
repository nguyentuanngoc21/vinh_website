import { getRequestContext, requestError } from '@/lib/mobile/request-context';
import { mobileResponse } from '@/lib/mobile/response';
import { recordReadingProgress } from '@/lib/reading/record-progress';
import { isUuid } from '@/lib/validation/uuid';
export { OPTIONS } from '@/lib/mobile/response';

// Mobile counterpart of /api/books/[bookId]/reading-progress, with server-side access checks.
export function POST(request: Request, context: { params: Promise<{ bookId: string }> }) {
  return mobileResponse(request, async () => {
    let auth;
    try { auth = await getRequestContext(request); } catch (error) { return requestError(error); }
    const { client, userId } = auth;
    if (!userId) return Response.json({ error: 'Vui lòng đăng nhập lại.' }, { status: 401 });
    const { bookId } = await context.params;
    const body = await request.json().catch(() => null);
    const chapterId = typeof body?.chapterId === 'string' ? body.chapterId : '';
    const paragraphIndex = body?.paragraphIndex;
    if (!isUuid(bookId) || !isUuid(chapterId) || !Number.isInteger(paragraphIndex) || paragraphIndex < 0 ||
      (body.completed !== undefined && typeof body.completed !== 'boolean'))
      return Response.json({ error: 'Dữ liệu tiến độ đọc không hợp lệ.' }, { status: 400 });
    const result = await recordReadingProgress(client, userId,
      { bookId, chapterId, paragraphIndex, completed: body.completed === true });
    return result.ok ? Response.json({ ok: true }) : Response.json({ error: result.error }, { status: result.status });
  });
}
