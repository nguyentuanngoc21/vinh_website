import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

type Client = SupabaseClient<Database>;
export type ChapterAccess =
  | { ok: true; chapter: { id: string; book_id: string; price: number; content: string }; authorId: string }
  | { ok: false; status: 403 | 404 | 502; error: string };

/**
 * Whether `userId` may read `chapterId` — the same rule as the reader (mobile chapter route,
 * web read page): chapter published and not removed, in a published, non-deleted book; a paid
 * chapter needs the author or a purchase. Used before writing progress (record-progress.ts) and
 * reading interactions (comments, highlights, votes), which previously accepted any chapter id.
 * `client` is a service-role client; `expectedBookId` also requires the chapter to belong to it.
 */
export async function checkChapterAccess(client: Client, userId: string, chapterId: string, expectedBookId?: string): Promise<ChapterAccess> {
  const chapter = await client.from('chapters').select('id,book_id,price,content').eq('id', chapterId)
    .eq('published', true).is('removed_at', null).maybeSingle();
  if (chapter.error) return { ok: false, status: 502, error: 'Không kiểm tra được chương.' };
  if (!chapter.data || (expectedBookId !== undefined && chapter.data.book_id !== expectedBookId))
    return { ok: false, status: 404, error: 'Không tìm thấy chương.' };
  const book = await client.from('books').select('id,author_id').eq('id', chapter.data.book_id)
    .eq('published', true).is('deleted_at', null).maybeSingle();
  if (book.error) return { ok: false, status: 502, error: 'Không kiểm tra được truyện.' };
  if (!book.data) return { ok: false, status: 404, error: 'Không tìm thấy truyện.' };
  if (chapter.data.price > 0 && book.data.author_id !== userId) {
    const purchase = await client.from('purchase_transactions').select('id')
      .eq('chapter_id', chapterId).eq('buyer_id', userId).maybeSingle();
    if (purchase.error) return { ok: false, status: 502, error: 'Không kiểm tra được quyền đọc.' };
    if (!purchase.data) return { ok: false, status: 403, error: 'Bạn chưa có quyền đọc chương này.' };
  }
  return { ok: true, chapter: chapter.data, authorId: book.data.author_id };
}
