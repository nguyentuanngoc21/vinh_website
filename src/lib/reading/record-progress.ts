import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { ReadingEventService } from '@/lib/quests/reading-event-service';

type Client = SupabaseClient<Database>;
export type ProgressInput = { bookId: string; chapterId: string; paragraphIndex: number; completed: boolean };
export type ProgressResult = { ok: true } | { ok: false; status: 400 | 403 | 404 | 502; error: string };

/**
 * Ghi tiến độ đọc cho client KHÔNG tự chứng minh được quyền đọc (app mobile).
 * Khác route web /api/books/[bookId]/reading-progress (tin chapterId từ client),
 * hàm này kiểm tra lại mọi điều kiện ở server trước khi ghi:
 * - chương đã xuất bản, chưa gỡ và thuộc đúng truyện đã xuất bản;
 * - chương trả phí chỉ ghi khi người gọi là tác giả hoặc đã mua;
 * - paragraphIndex phải nằm trong số đoạn thật (cùng cách chia "\n\n" với Reader).
 * `completed` kích hoạt ReadingEventService — hàm SQL record_chapter_read tự
 * chống ghi lặp trong ngày, nên gửi lại không cộng thưởng hai lần.
 * `client` phải là service-role client (record_chapter_read đã revoke khỏi authenticated).
 */
export async function recordReadingProgress(client: Client, userId: string, input: ProgressInput): Promise<ProgressResult> {
  const { bookId, chapterId, paragraphIndex, completed } = input;
  const chapter = await client.from('chapters').select('id,book_id,price,content').eq('id', chapterId)
    .eq('published', true).is('removed_at', null).maybeSingle();
  if (chapter.error) return { ok: false, status: 502, error: 'Không kiểm tra được chương.' };
  if (!chapter.data || chapter.data.book_id !== bookId) return { ok: false, status: 404, error: 'Không tìm thấy chương.' };
  const book = await client.from('books').select('id,author_id').eq('id', bookId)
    .eq('published', true).is('deleted_at', null).maybeSingle();
  if (book.error) return { ok: false, status: 502, error: 'Không kiểm tra được truyện.' };
  if (!book.data) return { ok: false, status: 404, error: 'Không tìm thấy truyện.' };
  if (chapter.data.price > 0 && book.data.author_id !== userId) {
    const purchase = await client.from('purchase_transactions').select('id')
      .eq('chapter_id', chapterId).eq('buyer_id', userId).maybeSingle();
    if (purchase.error) return { ok: false, status: 502, error: 'Không kiểm tra được quyền đọc.' };
    if (!purchase.data) return { ok: false, status: 403, error: 'Bạn chưa có quyền đọc chương này.' };
  }
  const paragraphCount = chapter.data.content ? chapter.data.content.split('\n\n').length : 0;
  if (paragraphIndex >= Math.max(1, paragraphCount)) return { ok: false, status: 400, error: 'Vị trí đọc không hợp lệ.' };

  const { error } = await client.from('book_progress').upsert({
    user_id: userId, book_id: bookId, chapter_id: chapterId,
    last_paragraph_index: paragraphIndex, updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,book_id' });
  if (error) return { ok: false, status: 502, error: 'Không lưu được tiến độ đọc.' };
  // Lỗi ở đây được ReadingEventService tự ghi log, không làm hỏng việc lưu vị trí.
  if (completed) await ReadingEventService.recordChapterCompletion(client, { userId, bookId, chapterId });
  return { ok: true };
}
