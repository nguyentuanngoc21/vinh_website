import { PATCH as saveChapter, DELETE as deleteChapter } from '@/app/api/authoring/chapters/[chapterId]/route';
import { getUserContext, requestError } from '@/lib/mobile/request-context';
import { mobileResponse } from '@/lib/mobile/response';
import { forwardRequest, pick } from '@/lib/mobile/forward';
import { getAuthorChapter } from '@/lib/authoring/workspace';
export { OPTIONS } from '@/lib/mobile/response';

type Ctx = { params: Promise<{ chapterId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A chapter for editing (drafts too — api/mobile/chapters/[id] only serves published ones).
export function GET(request: Request, context: Ctx) {
  return mobileResponse(request, async () => {
    let auth;
    try { auth = await getUserContext(request); } catch (e) { return requestError(e); }
    if (!auth.userId) return Response.json({ error: 'Vui lòng đăng nhập lại.' }, { status: 401 });
    const { chapterId } = await context.params;
    const data = UUID.test(chapterId) ? await getAuthorChapter(auth.supabase, auth.userId, chapterId) : null;
    if (!data) return Response.json({ error: 'Không tìm thấy chương.' }, { status: 404 });
    return Response.json(data);
  });
}

// 'save' covers both Lưu nháp (published:false) and Xuất bản (published:true), as the web editor.
// audio_url/audio_price are left to the web for now (Phase 8d handles chapter audio).
export function POST(request: Request, context: Ctx) {
  return mobileResponse(request, async () => {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    switch (body?.action) {
      case 'save':
        return saveChapter(forwardRequest(request, 'PATCH', pick(body, ['title', 'content', 'published', 'price', 'is_last_chapter'])), context);
      case 'delete':
        return deleteChapter(forwardRequest(request, 'DELETE'), context);
      default:
        return Response.json({ error: 'Thao tác không hợp lệ.' }, { status: 400 });
    }
  });
}
