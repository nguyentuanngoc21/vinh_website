import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { ReadingEventService } from '@/lib/quests/reading-event-service';
import { checkChapterAccess } from '@/lib/reading/chapter-access';

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
  const access = await checkChapterAccess(client, userId, chapterId, bookId);
  if (!access.ok) return access;
  const chapter = { data: access.chapter };
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
