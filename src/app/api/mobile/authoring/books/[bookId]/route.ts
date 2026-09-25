import { PATCH as updateBook, DELETE as deleteBook } from '@/app/api/authoring/books/[bookId]/route';
import { POST as addChapters } from '@/app/api/authoring/books/[bookId]/chapters/route';
import { PUT as reorderChapters } from '@/app/api/authoring/books/[bookId]/chapters/order/route';
import { POST as addCharacter } from '@/app/api/authoring/books/[bookId]/characters/route';
import { PATCH as updateCharacter, DELETE as deleteCharacter } from '@/app/api/authoring/books/[bookId]/characters/[characterId]/route';
import { POST as shareManuscript, DELETE as unshareManuscript } from '@/app/api/authoring/books/[bookId]/share/route';
import { POST as finalizeBook } from '@/app/api/authoring/books/[bookId]/finalize/route';
import { getUserContext, requestError } from '@/lib/mobile/request-context';
import { mobileResponse } from '@/lib/mobile/response';
import { forwardRequest, pick } from '@/lib/mobile/forward';
import { getAuthorBook } from '@/lib/authoring/workspace';
export { OPTIONS } from '@/lib/mobile/response';

type Ctx = { params: Promise<{ bookId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A non-UUID id matches no row (the web routes answer 404) instead of reaching Postgres as bad input.
const withCharacter = (context: Ctx, characterId: unknown) => ({
  params: context.params.then(p => ({ ...p, characterId: typeof characterId === 'string' && UUID.test(characterId) ? characterId : '00000000-0000-0000-0000-000000000000' })),
});

// Book overview for its author: details, chapters (drafts and removed ones too), characters.
export function GET(request: Request, context: Ctx) {
  return mobileResponse(request, async () => {
    let auth;
    try { auth = await getUserContext(request); } catch (e) { return requestError(e); }
    if (!auth.userId) return Response.json({ error: 'Vui lòng đăng nhập lại.' }, { status: 401 });
    const { bookId } = await context.params;
    const book = UUID.test(bookId) ? await getAuthorBook(auth.supabase, auth.userId, bookId) : null;
    if (!book) return Response.json({ error: 'Không tìm thấy truyện.' }, { status: 404 });
    return Response.json({ book });
  });
}

// action → web authoring handler; each action forwards only its own fields. The web routes check ownership.
export function POST(request: Request, context: Ctx) {
  return mobileResponse(request, async () => {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    switch (body?.action) {
      case 'update':
        return updateBook(forwardRequest(request, 'PATCH', pick(body, ['title', 'synopsis', 'genre', 'tags', 'is_exclusive'])), context);
      case 'delete':
        return deleteBook(forwardRequest(request, 'DELETE'), context);
      case 'add-chapters':
        return addChapters(forwardRequest(request, 'POST', { chapters: body.chapters }), context);
      case 'reorder':
        return reorderChapters(forwardRequest(request, 'PUT', { chapterIds: body.chapterIds }), context);
      case 'add-character':
        return addCharacter(forwardRequest(request, 'POST', pick(body, ['name', 'role', 'trope'])), context);
      case 'update-character':
        return updateCharacter(forwardRequest(request, 'PATCH', pick(body, ['name', 'role', 'trope'])), withCharacter(context, body.characterId));
      case 'delete-character':
        return deleteCharacter(forwardRequest(request, 'DELETE'), withCharacter(context, body.characterId));
      case 'share':
        return shareManuscript(forwardRequest(request, 'POST', { username: body.username }), context);
      case 'unshare':
        return unshareManuscript(forwardRequest(request, 'DELETE'), context);
      case 'finalize':
        return finalizeBook(forwardRequest(request, 'POST'), context);
      default:
        return Response.json({ error: 'Thao tác không hợp lệ.' }, { status: 400 });
    }
  });
}
