import { POST as createBook } from '@/app/api/authoring/books/route';
import { getUserContext, requestError } from '@/lib/mobile/request-context';
import { mobileResponse } from '@/lib/mobile/response';
import { forwardRequest, pick } from '@/lib/mobile/forward';
import { listAuthorBooks } from '@/lib/authoring/workspace';
export { OPTIONS } from '@/lib/mobile/response';

// The caller's own works (drafts included), as the web author sidebar.
export function GET(request: Request) {
  return mobileResponse(request, async () => {
    let auth;
    try { auth = await getUserContext(request); } catch (e) { return requestError(e); }
    if (!auth.userId) return Response.json({ error: 'Vui lòng đăng nhập lại.' }, { status: 401 });
    return Response.json({ books: await listAuthorBooks(auth.supabase, auth.userId) });
  });
}

const CREATE_FIELDS = ['title', 'synopsis', 'genre', 'tags', 'isExclusive', 'chapterTitle', 'chapterContent', 'published', 'price', 'isLastChapter'];
// POST { action: 'create', …fields } → web POST /api/authoring/books (new book + first chapter).
export function POST(request: Request) {
  return mobileResponse(request, async () => {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (body?.action !== 'create') return Response.json({ error: 'Thao tác không hợp lệ.' }, { status: 400 });
    return createBook(forwardRequest(request, 'POST', pick(body, CREATE_FIELDS)));
  });
}
