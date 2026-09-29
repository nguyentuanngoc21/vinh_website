import { buildContentPreview } from '@/lib/reading/access-gate';
import { getMobileAnonClient } from '@/lib/mobile/request-context';
import { mobileJson as json, mobileOptions } from '@/lib/mobile/response';
import { isUuid } from '@/lib/validation/uuid';

// Token-only API: CORS supports Expo web previews without cookie credentials.
export function OPTIONS() {
  return mobileOptions('GET, OPTIONS', 'Authorization');
}
export async function GET(request: Request, context: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await context.params;
  if (!isUuid(chapterId)) return json({ error: 'Chương không hợp lệ.' }, 400);
  const authorization = request.headers.get('authorization');
  const client = getMobileAnonClient(authorization);
  if (!client) return json({ error: 'Máy chủ chưa được cấu hình.' }, 503);
  if (authorization && !/^Bearer \S+$/i.test(authorization)) return json({ error: 'Phiên đăng nhập không hợp lệ.' }, 401);
  try {
    let viewerId: string | null = null;
    if (authorization) {
      const { data, error } = await client.auth.getUser(authorization.slice(7));
      if (error || !data.user) return json({ error: 'Phiên đăng nhập không hợp lệ.' }, 401);
      viewerId = data.user.id;
    }
    const { data: chapter, error } = await client.from('chapters')
      .select('id,book_id,title,price,order_index').eq('id', chapterId)
      .eq('published', true).is('removed_at', null).maybeSingle();
    if (error) return json({ error: 'Không tải được chương.' }, 502);
    if (!chapter) return json({ error: 'Không tìm thấy.' }, 404);
    const { data: book, error: bookError } = await client.from('books')
      .select('id,title,author_id').eq('id', chapter.book_id).eq('published', true).is('deleted_at', null).maybeSingle();
    if (bookError) return json({ error: 'Không tải được truyện.' }, 502);
    if (!book) return json({ error: 'Không tìm thấy.' }, 404);
    let gate: 'none' | 'login' | 'purchase' = 'none';
    if (chapter.price > 0 && viewerId !== book.author_id) {
      if (!viewerId) gate = 'purchase';
      else {
        const purchase = await client.from('purchase_transactions').select('id')
          .eq('chapter_id', chapterId).eq('buyer_id', viewerId).maybeSingle();
        if (purchase.error) return json({ error: 'Không kiểm tra được quyền truy cập.' }, 502);
        if (!purchase.data) gate = 'purchase';
      }
    }
    let content = '';
    if (gate !== 'purchase') {
      const result = await client.from('chapters').select('content').eq('id', chapterId)
        .eq('published', true).is('removed_at', null).maybeSingle();
      if (result.error) return json({ error: 'Không tải được nội dung.' }, 502);
      if (!result.data) return json({ error: 'Không tìm thấy.' }, 404);
      content = result.data.content;
      if (!viewerId) {
        const preview = buildContentPreview(content);
        content = preview.visible;
        if (preview.truncated) gate = 'login';
      }
    }
    const siblings = await client.from('chapters').select('id').eq('book_id', book.id)
      .eq('published', true).is('removed_at', null).order('order_index');
    if (siblings.error) return json({ error: 'Không tải được mục lục.' }, 502);
    const ordered = siblings.data ?? [];
    const index = ordered.findIndex(c => c.id === chapterId);
    return json({ id: chapter.id, bookId: book.id, title: chapter.title, bookTitle: book.title, content,
      price: chapter.price, gate, previousId: ordered[index - 1]?.id ?? null,
      nextId: index >= 0 ? ordered[index + 1]?.id ?? null : null });
  } catch {
    return json({ error: 'Dịch vụ đọc truyện tạm thời không khả dụng.' }, 502);
  }
}
